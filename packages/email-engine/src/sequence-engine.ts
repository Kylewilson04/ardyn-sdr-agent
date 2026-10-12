import { Queue, Worker, Job, QueueScheduler } from "bullmq";
import type { ConnectionOptions, JobsOptions } from "bullmq";
import type {
  Cadence,
  SequenceEnrollment,
  SequenceStep,
  CadenceStore,
  EmailEventBus,
  EmailEventType,
} from "./types.js";

// ─────────────────────────────────────────────────────────────
// Queue Names
// ─────────────────────────────────────────────────────────────

export const SEQUENCE_QUEUE_NAME = "email-sequence-steps";
export const SCHEDULER_QUEUE_NAME = "email-sequence-scheduler";
export const DELIVERY_CHECK_QUEUE_NAME = "email-delivery-check";
export const REPLY_PROCESSOR_QUEUE_NAME = "email-reply-processor";

// ─────────────────────────────────────────────────────────────
// Job Data Types
// ─────────────────────────────────────────────────────────────

export interface StepJobData {
  enrollmentId: string;
  cadenceId: string;
  stepIndex: number;
  prospectId: string;
}

export interface DeliveryCheckJobData {
  enrollmentId: string;
  messageId: string;
  stepIndex: number;
}

export interface ReplyProcessJobData {
  enrollmentId: string;
  replyId: string;
  stepIndex: number;
}

// ─────────────────────────────────────────────────────────────
// Sequence Engine Configuration
// ─────────────────────────────────────────────────────────────

export interface SequenceEngineConfig {
  redis: ConnectionOptions;
  cadenceStore: CadenceStore;
  eventBus: EmailEventBus;
  queuePrefix?: string;
  defaultJobOptions?: Partial<JobsOptions>;
  /** Called when a step needs to send email. Must be injected. */
  onSendStep?: (
    enrollment: SequenceEnrollment,
    step: SequenceStep,
    cadence: Cadence
  ) => Promise<void>;
  /** Called to check whether a sequence should proceed. */
  onStepDue?: (
    enrollment: SequenceEnrollment,
    step: SequenceStep,
    cadence: Cadence
  ) => Promise<boolean>;
}

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

/**
 * Convert a WaitDelay to milliseconds, optionally clamping to
 * business hours for timezone-aware scheduling.
 */
export function delayToMs(
  delay: { value: number; unit: "minutes" | "hours" | "days" | "weeks"; businessDaysOnly?: boolean },
  _timezone?: string
): number {
  const unitMs: Record<string, number> = {
    minutes: 60_000,
    hours: 3_600_000,
    days: 86_400_000,
    weeks: 604_800_000,
  };

  let ms = delay.value * (unitMs[delay.unit] ?? unitMs.days);

  // If business-days only, skip weekends by adding 2 extra days
  // per 5-day block in a simplified way.
  if (delay.businessDaysOnly && delay.unit === "days") {
    const extraWeekendDays = Math.floor(delay.value / 5) * 2;
    ms += extraWeekendDays * 86_400_000;
  }

  return ms;
}

/**
 * Calculate the scheduled time for a step based on the enrollment
 * start and the cumulative delays from all prior steps.
 */
export function calculateStepTime(
  enrollment: SequenceEnrollment,
  cadence: Cadence,
  stepIndex: number
): Date {
  const startDate = new Date(enrollment.startedAt);
  let cumulativeMs = 0;

  // Sum delays of all steps from 0 up to (but not including) stepIndex
  for (let i = 0; i < stepIndex; i++) {
    const step = cadence.steps[i];
    if (step?.delayAfter) {
      cumulativeMs += delayToMs(step.delayAfter, cadence.timezone);
    }
  }

  return new Date(startDate.getTime() + cumulativeMs);
}

// ─────────────────────────────────────────────────────────────
// Sequence Engine
// ─────────────────────────────────────────────────────────────

export class SequenceEngine {
  private config: SequenceEngineConfig;
  private stepQueue: Queue<StepJobData>;
  private scheduler: QueueScheduler;
  private worker: Worker<StepJobData> | null = null;

  constructor(config: SequenceEngineConfig) {
    this.config = config;

    const prefix = config.queuePrefix ?? "email-engine";

    this.stepQueue = new Queue<StepJobData>(SEQUENCE_QUEUE_NAME, {
      connection: config.redis,
      prefix,
      defaultJobOptions: config.defaultJobOptions,
    });

    this.scheduler = new QueueScheduler(SEQUENCE_QUEUE_NAME, {
      connection: config.redis,
      prefix,
    });
  }

  /**
   * Start the worker that processes step jobs. Only call once.
   */
  startWorker(): Worker<StepJobData> {
    if (this.worker) {
      return this.worker;
    }

    const prefix = this.config.queuePrefix ?? "email-engine";

    this.worker = new Worker<StepJobData>(
      SEQUENCE_QUEUE_NAME,
      async (job: Job<StepJobData>) => {
        await this.processStep(job);
      },
      {
        connection: this.config.redis,
        prefix,
        concurrency: 5,
        limiter: {
          max: 50,
          duration: 60_000,
        },
      }
    );

    this.worker.on("failed", async (job, error) => {
      if (!job) return;
      const data = job.data;
      await this.config.eventBus.emit("sequence:step_completed", {
        enrollmentId: data.enrollmentId,
        stepIndex: data.stepIndex,
        status: "failed",
        error: error.message,
      });
    });

    this.worker.on("completed", async (job) => {
      const data = job.data;
      await this.config.eventBus.emit("sequence:step_completed", {
        enrollmentId: data.enrollmentId,
        stepIndex: data.stepIndex,
        status: "completed",
      });
    });

    return this.worker;
  }

  /**
   * Enroll a prospect in a cadence and schedule the first step.
   */
  async enroll(
    cadenceId: string,
    prospectId: string,
    prospectEmail: string,
    options?: {
      prospectName?: string;
      companyName?: string;
      context?: Record<string, unknown>;
      startAt?: Date;
    }
  ): Promise<SequenceEnrollment> {
    const cadence = await this.config.cadenceStore.getCadence(cadenceId);
    if (!cadence) {
      throw new Error(`Cadence ${cadenceId} not found`);
    }

    const now = new Date().toISOString();
    const enrollmentId = `enr_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

    const enrollment: SequenceEnrollment = {
      id: enrollmentId,
      cadenceId,
      prospectId,
      prospectEmail,
      prospectName: options?.prospectName,
      companyName: options?.companyName,
      currentStepIndex: 0,
      status: "active",
      pausedAt: null,
      startedAt: options?.startAt?.toISOString() ?? now,
      completedAt: null,
      replyReceived: false,
      replyClassification: null,
      stepHistory: [],
      context: options?.context,
      tags: [],
    };

    await this.config.cadenceStore.saveEnrollment(enrollment);
    await this.scheduleNextStep(enrollment, cadence);

    await this.config.eventBus.emit("sequence:step_completed", {
      enrollmentId,
      cadenceId,
      status: "enrolled",
    });

    return enrollment;
  }

  /**
   * Pause an active enrollment. No more steps will execute until resumed.
   */
  async pause(enrollmentId: string): Promise<SequenceEnrollment> {
    const enrollment = await this.config.cadenceStore.getEnrollment(enrollmentId);
    if (!enrollment) {
      throw new Error(`Enrollment ${enrollmentId} not found`);
    }
    if (enrollment.status !== "active") {
      throw new Error(
        `Cannot pause enrollment ${enrollmentId}: current status is ${enrollment.status}`
      );
    }

    const updated = await this.config.cadenceStore.updateEnrollment(enrollmentId, {
      status: "paused",
      pausedAt: new Date().toISOString(),
    });

    // Remove any pending delayed jobs for this enrollment
    await this.removePendingJobs(enrollmentId);

    await this.config.eventBus.emit("sequence:paused", {
      enrollmentId,
      pausedAt: new Date().toISOString(),
    });

    return updated;
  }

  /**
   * Resume a paused enrollment. The next pending step is scheduled.
   */
  async resume(enrollmentId: string): Promise<SequenceEnrollment> {
    const enrollment = await this.config.cadenceStore.getEnrollment(enrollmentId);
    if (!enrollment) {
      throw new Error(`Enrollment ${enrollmentId} not found`);
    }
    if (enrollment.status !== "paused") {
      throw new Error(
        `Cannot resume enrollment ${enrollmentId}: current status is ${enrollment.status}`
      );
    }

    const cadence = await this.config.cadenceStore.getCadence(enrollment.cadenceId);
    if (!cadence) {
      throw new Error(`Cadence ${enrollment.cadenceId} not found for enrollment`);
    }

    const updated = await this.config.cadenceStore.updateEnrollment(enrollmentId, {
      status: "active",
      pausedAt: null,
    });

    await this.scheduleNextStep(updated, cadence);

    await this.config.eventBus.emit("sequence:resumed", {
      enrollmentId,
      resumedAt: new Date().toISOString(),
    });

    return updated;
  }

  /**
   * Stop an enrollment completely. No further steps.
   */
  async stop(
    enrollmentId: string,
    reason?: string
  ): Promise<SequenceEnrollment> {
    const enrollment = await this.config.cadenceStore.getEnrollment(enrollmentId);
    if (!enrollment) {
      throw new Error(`Enrollment ${enrollmentId} not found`);
    }

    const updated = await this.config.cadenceStore.updateEnrollment(enrollmentId, {
      status: "stopped",
      completedAt: new Date().toISOString(),
    });

    await this.removePendingJobs(enrollmentId);

    await this.config.eventBus.emit("sequence:stopped", {
      enrollmentId,
      reason: reason ?? "manual",
      stoppedAt: new Date().toISOString(),
    });

    return updated;
  }

  /**
   * Mark the current step as completed (from external callback)
   * and schedule the next step.
   */
  async completeStep(
    enrollmentId: string,
    messageId?: string
  ): Promise<SequenceEnrollment> {
    const enrollment = await this.config.cadenceStore.getEnrollment(enrollmentId);
    if (!enrollment) {
      throw new Error(`Enrollment ${enrollmentId} not found`);
    }

    const cadence = await this.config.cadenceStore.getCadence(enrollment.cadenceId);
    if (!cadence) {
      throw new Error(`Cadence ${enrollment.cadenceId} not found`);
    }

    const currentStep = cadence.steps[enrollment.currentStepIndex];
    if (!currentStep) {
      throw new Error(
        `Step ${enrollment.currentStepIndex} not found in cadence ${cadence.id}`
      );
    }

    // Mark current step as completed in history
    const stepHistoryEntry = {
      stepId: currentStep.id,
      stepType: currentStep.type,
      status: "completed" as const,
      scheduledAt: calculateStepTime(
        enrollment,
        cadence,
        enrollment.currentStepIndex
      ).toISOString(),
      executedAt: new Date().toISOString(),
      error: null,
      messageId: messageId ?? null,
    };

    const stepHistory = [
      ...enrollment.stepHistory.filter(
        (h) => h.stepId !== currentStep.id
      ),
      stepHistoryEntry,
    ];

    // Check for stop conditions
    const nextIndex = enrollment.currentStepIndex + 1;
    const isComplete = nextIndex >= cadence.steps.length;

    const hasReplyStopCondition =
      cadence.stopOnReply && enrollment.replyReceived;

    let newStatus: SequenceEnrollment["status"] = enrollment.status;
    if (hasReplyStopCondition) {
      newStatus = "stopped";
    } else if (isComplete) {
      newStatus = "completed";
    }

    const updated = await this.config.cadenceStore.updateEnrollment(
      enrollmentId,
      {
        currentStepIndex: isComplete ? enrollment.currentStepIndex : nextIndex,
        status: newStatus,
        completedAt: isComplete ? new Date().toISOString() : null,
        stepHistory,
      }
    );

    if (newStatus === "stopped") {
      await this.removePendingJobs(enrollmentId);
      await this.config.eventBus.emit("sequence:stopped", {
        enrollmentId,
        reason: "reply_received",
      });
    } else if (newStatus === "completed") {
      await this.config.eventBus.emit("sequence:completed", {
        enrollmentId,
        cadenceId: cadence.id,
      });
    } else {
      // Schedule the next step
      await this.scheduleNextStep(updated, cadence);
    }

    return updated;
  }

  /**
   * Handle an inbound reply — classify it and decide what to do.
   */
  async handleReply(
    enrollmentId: string,
    classification: {
      category: string;
      suggestedAction: string;
    }
  ): Promise<SequenceEnrollment> {
    const enrollment = await this.config.cadenceStore.getEnrollment(enrollmentId);
    if (!enrollment) {
      throw new Error(`Enrollment ${enrollmentId} not found`);
    }

    const cadence = await this.config.cadenceStore.getCadence(enrollment.cadenceId);
    if (!cadence) {
      throw new Error(`Cadence ${enrollment.cadenceId} not found`);
    }

    const action = classification.suggestedAction;

    switch (action) {
      case "stop_sequence":
        return this.stop(enrollmentId, classification.category);

      case "pause_sequence":
        return this.pause(enrollmentId);

      case "continue_sequence":
        // Mark reply received but continue — the cadence stopOnReply
        // flag will handle the stop if configured.
        await this.config.cadenceStore.updateEnrollment(enrollmentId, {
          replyReceived: true,
        });

        if (cadence.stopOnReply) {
          return this.stop(enrollmentId, classification.category);
        }
        return enrollment;

      case "ignore":
        // For OOO / auto-reply — do nothing, let sequence continue.
        return enrollment;

      case "escalate":
      case "notify_sales":
      case "manual_review":
        // Pause and flag for manual review
        await this.config.cadenceStore.updateEnrollment(enrollmentId, {
          status: "paused",
          pausedAt: new Date().toISOString(),
        });
        await this.removePendingJobs(enrollmentId);
        await this.config.eventBus.emit("sequence:paused", {
          enrollmentId,
          reason: classification.category,
        });
        return this.config.cadenceStore.getEnrollment(enrollmentId) as Promise<SequenceEnrollment>;

      default:
        return enrollment;
    }
  }

  /**
   * Internal: schedule the next step job for an enrollment.
   */
  private async scheduleNextStep(
    enrollment: SequenceEnrollment,
    cadence: Cadence
  ): Promise<void> {
    const stepIndex = enrollment.currentStepIndex;
    const step = cadence.steps[stepIndex];

    if (!step) {
      // No more steps — sequence is complete.
      await this.config.cadenceStore.updateEnrollment(enrollment.id, {
        status: "completed",
        completedAt: new Date().toISOString(),
      });
      await this.config.eventBus.emit("sequence:completed", {
        enrollmentId: enrollment.id,
        cadenceId: cadence.id,
      });
      return;
    }

    if (!step.enabled) {
      // Skip disabled steps and go to the next one.
      const nextEnrollment = await this.config.cadenceStore.updateEnrollment(
        enrollment.id,
        { currentStepIndex: stepIndex + 1 }
      );
      return this.scheduleNextStep(nextEnrollment, cadence);
    }

    const jobData: StepJobData = {
      enrollmentId: enrollment.id,
      cadenceId: cadence.id,
      stepIndex,
      prospectId: enrollment.prospectId,
    };

    const scheduledTime = calculateStepTime(enrollment, cadence, stepIndex);
    const delay = Math.max(0, scheduledTime.getTime() - Date.now());

    const jobOptions: JobsOptions = {
      delay,
      jobId: `${enrollment.id}:step:${stepIndex}`,
      removeOnComplete: true,
      removeOnFail: 100,
    };

    await this.stepQueue.add(`step:${step.type}`, jobData, jobOptions);

    // Record the scheduled step in history
    const stepHistoryEntry = {
      stepId: step.id,
      stepType: step.type,
      status: "scheduled" as const,
      scheduledAt: scheduledTime.toISOString(),
      executedAt: null,
      error: null,
      messageId: null,
    };

    const stepHistory = [
      ...enrollment.stepHistory.filter(
        (h) => h.stepId !== step.id
      ),
      stepHistoryEntry,
    ];

    await this.config.cadenceStore.updateEnrollment(enrollment.id, {
      stepHistory,
    });
  }

  /**
   * Internal: process a step job when the worker picks it up.
   */
  private async processStep(job: Job<StepJobData>): Promise<void> {
    const { enrollmentId, cadenceId, stepIndex } = job.data;

    const enrollment = await this.config.cadenceStore.getEnrollment(enrollmentId);
    if (!enrollment) {
      throw new Error(`Enrollment ${enrollmentId} not found`);
    }

    // Don't run if paused/stopped/completed
    if (enrollment.status !== "active") {
      return;
    }

    const cadence = await this.config.cadenceStore.getCadence(cadenceId);
    if (!cadence) {
      throw new Error(`Cadence ${cadenceId} not found`);
    }

    const step = cadence.steps[stepIndex];
    if (!step) {
      throw new Error(`Step ${stepIndex} not found in cadence`);
    }

    // Check stop conditions
    if (cadence.stopOnReply && enrollment.replyReceived) {
      await this.stop(enrollmentId, "reply_received");
      return;
    }

    // Mark step as executing
    const executingEntry = {
      stepId: step.id,
      stepType: step.type,
      status: "executing" as const,
      scheduledAt: calculateStepTime(enrollment, cadence, stepIndex).toISOString(),
      executedAt: new Date().toISOString(),
      error: null,
      messageId: null,
    };

    await this.config.cadenceStore.updateEnrollment(enrollmentId, {
      stepHistory: [
        ...enrollment.stepHistory.filter(
          (h) => h.stepId !== step.id
        ),
        executingEntry,
      ],
    });

    // Delegate to the onSendStep callback for email steps
    if (step.type === "send_email" && this.config.onSendStep) {
      await this.config.onSendStep(enrollment, step, cadence);
    }
    // For non-email steps (linkedin, call, etc.), we don't auto-execute;
    // they are handled externally via completeStep().

    // Auto-complete wait steps
    if (step.type === "wait") {
      await this.completeStep(enrollmentId);
    }
  }

  /**
   * Remove all pending delayed jobs for an enrollment.
   */
  private async removePendingJobs(enrollmentId: string): Promise<void> {
    const prefix = `${enrollmentId}:step:`;
    const jobs = await this.stepQueue.getDelayed();

    for (const job of jobs) {
      if (job.id && job.id.startsWith(prefix)) {
        await job.remove().catch(() => {
          // Job may have already been removed — ignore.
        });
      }
    }
  }

  /**
   * Get all pending step jobs (useful for dashboard visibility).
   */
  async getPendingJobs(): Promise<StepJobData[]> {
    const delayed = await this.stepQueue.getDelayed();
    return delayed.map((j) => j.data);
  }

  /**
   * Graceful shutdown — close workers and queues.
   */
  async shutdown(): Promise<void> {
    if (this.worker) {
      await this.worker.close();
    }
    await this.scheduler.close();
    await this.stepQueue.close();
  }
}