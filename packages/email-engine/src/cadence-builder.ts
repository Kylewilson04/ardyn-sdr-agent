import type {
  Cadence,
  SequenceStep,
  ChannelType,
  BranchAction,
  BranchCondition,
  WaitDelay,
  CadenceStore,
} from "./types.js";
import { CadenceSchema, SequenceStepSchema } from "./types.js";

// ─────────────────────────────────────────────────────────────
// Step Builders
// ─────────────────────────────────────────────────────────────

let stepCounter = 0;

/**
 * Create a unique step ID.
 */
export function createStepId(): string {
  stepCounter++;
  return `step_${Date.now()}_${stepCounter}`;
}

/**
 * Reset the step counter (useful for tests).
 */
export function resetStepCounter(): void {
  stepCounter = 0;
}

// ─────────────────────────────────────────────────────────────
// Delay Helpers
// ─────────────────────────────────────────────────────────────

export const Delays = {
  /** 1 minute (for testing) */
  minutes1: (): WaitDelay => ({
    value: 1,
    unit: "minutes",
    businessDaysOnly: false,
    minHours: 0,
    maxHours: 23,
  }),

  /** 1 hour */
  hours1: (): WaitDelay => ({
    value: 1,
    unit: "hours",
    businessDaysOnly: false,
    minHours: 0,
    maxHours: 23,
  }),

  /** 1 day (business days) */
  days1: (): WaitDelay => ({
    value: 1,
    unit: "days",
    businessDaysOnly: true,
    minHours: 8,
    maxHours: 17,
  }),

  /** 2 days (business days) */
  days2: (): WaitDelay => ({
    value: 2,
    unit: "days",
    businessDaysOnly: true,
    minHours: 8,
    maxHours: 17,
  }),

  /** 3 days (business days) */
  days3: (): WaitDelay => ({
    value: 3,
    unit: "days",
    businessDaysOnly: true,
    minHours: 8,
    maxHours: 17,
  }),

  /** 5 days (business days) */
  days5: (): WaitDelay => ({
    value: 5,
    unit: "days",
    businessDaysOnly: true,
    minHours: 8,
    maxHours: 17,
  }),

  /** 7 days (business days) */
  days7: (): WaitDelay => ({
    value: 7,
    unit: "days",
    businessDaysOnly: true,
    minHours: 8,
    maxHours: 17,
  }),

  /** 14 days (business days) */
  days14: (): WaitDelay => ({
    value: 14,
    unit: "days",
    businessDaysOnly: true,
    minHours: 8,
    maxHours: 17,
  }),
};

// ─────────────────────────────────────────────────────────────
// Branch Helpers
// ─────────────────────────────────────────────────────────────

export const Branches = {
  /** If prospect replies, stop the sequence. */
  stopOnReply: (): BranchAction => ({
    condition: { type: "reply" },
    action: "stop",
  }),

  /** If no reply, continue to the next step. */
  continueOnNoReply: (): BranchAction => ({
    condition: { type: "no_reply" },
    action: "continue",
  }),

  /** If prospect opened but didn't reply, continue. */
  continueOnOpened: (): BranchAction => ({
    condition: { type: "opened" },
    action: "continue",
  }),

  /** If prospect replied with interest, notify sales. */
  onPositiveReply: (): BranchAction => ({
    condition: { type: "replied_positive" },
    action: "stop",
  }),

  /** If prospect replied negatively, stop. */
  onNegativeReply: (): BranchAction => ({
    condition: { type: "replied_negative" },
    action: "stop",
  }),
};

// ─────────────────────────────────────────────────────────────
// Step Factory
// ─────────────────────────────────────────────────────────────

export interface StepBuilder {
  id: string;
  type: SequenceStep["type"];
  label?: string;
  channel?: ChannelType;
  delayAfter?: WaitDelay;
  templateId?: string;
  branches?: BranchAction[];
  linkedinMessage?: string;
  callScript?: string;
  smsMessage?: string;
  webhookUrl?: string;
  taskDescription?: string;
  config?: Record<string, unknown>;
  enabled: boolean;
}

/**
 * Create a step builder. The builder pattern is used to fluently
 * configure a sequence step before adding it to a cadence.
 */
export function step(type: SequenceStep["type"], label?: string): StepBuilder {
  return {
    id: createStepId(),
    type,
    label,
    enabled: true,
  };
}

/**
 * Add channel to a step builder.
 */
export function withChannel(
  builder: StepBuilder,
  channel: ChannelType
): StepBuilder {
  return { ...builder, channel };
}

/**
 * Add a delay after the step.
 */
export function withDelay(
  builder: StepBuilder,
  delay: WaitDelay
): StepBuilder {
  return { ...builder, delayAfter: delay };
}

/**
 * Bind an email template to the step.
 */
export function withTemplate(
  builder: StepBuilder,
  templateId: string
): StepBuilder {
  return { ...builder, templateId };
}

/**
 * Add branch conditions to the step.
 */
export function withBranches(
  builder: StepBuilder,
  branches: BranchAction[]
): StepBuilder {
  return { ...builder, branches };
}

/**
 * Set LinkedIn message content (for linkedin_message steps).
 */
export function withLinkedInMessage(
  builder: StepBuilder,
  message: string
): StepBuilder {
  return { ...builder, linkedinMessage: message };
}

/**
 * Set call script (for phone_call steps).
 */
export function withCallScript(
  builder: StepBuilder,
  script: string
): StepBuilder {
  return { ...builder, callScript: script };
}

/**
 * Set SMS message (for sms steps).
 */
export function withSmsMessage(
  builder: StepBuilder,
  message: string
): StepBuilder {
  return { ...builder, smsMessage: message };
}

/**
 * Set webhook URL (for webhook steps).
 */
export function withWebhook(
  builder: StepBuilder,
  url: string
): StepBuilder {
  return { ...builder, webhookUrl: url };
}

/**
 * Set task description (for manual_task steps).
 */
export function withTask(
  builder: StepBuilder,
  description: string
): StepBuilder {
  return { ...builder, taskDescription: description };
}

/**
 * Set step to disabled.
 */
export function disabled(builder: StepBuilder): StepBuilder {
  return { ...builder, enabled: false };
}

/**
 * Convert a builder to a validated SequenceStep.
 */
export function buildStep(builder: StepBuilder): SequenceStep {
  const step: SequenceStep = {
    id: builder.id,
    type: builder.type,
    label: builder.label,
    channel: builder.channel,
    delayAfter: builder.delayAfter,
    templateId: builder.templateId,
    linkedinMessage: builder.linkedinMessage,
    callScript: builder.callScript,
    smsMessage: builder.smsMessage,
    branches: builder.branches,
    webhookUrl: builder.webhookUrl,
    taskDescription: builder.taskDescription,
    config: builder.config,
    enabled: builder.enabled,
  };

  const parsed = SequenceStepSchema.safeParse(step);
  if (!parsed.success) {
    throw new Error(
      `Step validation failed: ${parsed.error.issues.map((i) => i.message).join(", ")}`
    );
  }

  return step;
}

// ─────────────────────────────────────────────────────────────
// Cadence Builder
// ─────────────────────────────────────────────────────────────

export interface CadenceBuilderOptions {
  name: string;
  description?: string;
  startOn?: Cadence["startOn"];
  scheduledTime?: string;
  timezone?: string;
  stopOnReply?: boolean;
  stopOnBounce?: boolean;
  priority?: Cadence["priority"];
  tags?: string[];
}

/**
 * Create a cadence builder from an array of step builders.
 */
export function cadence(
  options: CadenceBuilderOptions,
  stepBuilders: StepBuilder[]
): Cadence {
  const now = new Date().toISOString();
  const steps = stepBuilders.map(buildStep);

  const c: Cadence = {
    id: `cad_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
    name: options.name,
    description: options.description,
    steps,
    startOn: options.startOn ?? "immediate",
    scheduledTime: options.scheduledTime,
    timezone: options.timezone,
    stopOnReply: options.stopOnReply ?? true,
    stopOnBounce: options.stopOnBounce ?? true,
    priority: options.priority ?? "normal",
    tags: options.tags,
    createdAt: now,
    updatedAt: now,
    version: 1,
  };

  const parsed = CadenceSchema.safeParse(c);
  if (!parsed.success) {
    throw new Error(
      `Cadence validation failed: ${parsed.error.issues.map((i) => i.message).join(", ")}`
    );
  }

  return c;
}

// ─────────────────────────────────────────────────────────────
// Pre-built Cadence Templates
// ─────────────────────────────────────────────────────────────

/**
 * Standard 3-email outreach cadence:
 * Email 1 → 3 days → Email 2 → 5 days → Email 3
 */
export function standardEmailCadence(
  templates: {
    email1TemplateId: string;
    email2TemplateId: string;
    email3TemplateId: string;
  },
  name = "Standard 3-Touch Email Cadence"
): Cadence {
  return cadence(
    {
      name,
      description:
        "Standard 3-email outreach: initial touch, follow-up, and break-up",
      stopOnReply: true,
      stopOnBounce: true,
    },
    [
      withTemplate(
        withDelay(
          withBranches(
            step("send_email", "Initial Outreach"),
            [Branches.continueOnNoReply(), Branches.stopOnReply()]
          ),
          Delays.days3()
        ),
        templates.email1TemplateId
      ),
      withTemplate(
        withDelay(
          withBranches(
            step("send_email", "Follow-up #1"),
            [Branches.continueOnNoReply(), Branches.stopOnReply()]
          ),
          Delays.days5()
        ),
        templates.email2TemplateId
      ),
      withTemplate(
        withBranches(
          step("send_email", "Break-up Email"),
          [Branches.continueOnNoReply(), Branches.stopOnReply()]
        ),
        templates.email3TemplateId
      ),
    ]
  );
}

/**
 * Multi-channel cadence mixing email and LinkedIn.
 * Email 1 → 2 days → LinkedIn connect → 3 days → Email 2 → 4 days → LinkedIn message
 */
export function multiChannelCadence(
  templates: {
    email1TemplateId: string;
    email2TemplateId: string;
    linkedinConnectMessage?: string;
    linkedinFollowUpMessage?: string;
  },
  name = "Multi-Channel Cadence"
): Cadence {
  return cadence(
    {
      name,
      description: "Email + LinkedIn multi-channel outreach",
      stopOnReply: true,
      stopOnBounce: true,
    },
    [
      withTemplate(
        withDelay(
          step("send_email", "Initial Email Outreach"),
          Delays.days2()
        ),
        templates.email1TemplateId
      ),
      withLinkedInMessage(
        withDelay(
          step("linkedin_connect", "LinkedIn Connection Request"),
          Delays.days3()
        ),
        templates.linkedinConnectMessage ??
          "Hi {{ firstName }}, I came across your profile and would love to connect."
      ),
      withTemplate(
        withDelay(
          step("send_email", "Email Follow-up"),
          Delays.days4()
        ),
        templates.email2TemplateId
      ),
      withLinkedInMessage(
        step("linkedin_message", "LinkedIn Follow-up Message"),
        templates.linkedinFollowUpMessage ??
          "Hi {{ firstName }}, following up on my earlier outreach..."
      ),
    ]
  );
}

/**
 * Cadence with a call step mixed in.
 * Email → 2 days → Call → 3 days → Email → 5 days → Email
 */
export function emailWithCallCadence(
  templates: {
    email1TemplateId: string;
    email2TemplateId: string;
    email3TemplateId: string;
    callScript?: string;
  },
  name = "Email + Call Cadence"
): Cadence {
  return cadence(
    {
      name,
      description: "Email outreach with a phone call touchpoint",
      stopOnReply: true,
      stopOnBounce: true,
    },
    [
      withTemplate(
        withDelay(
          step("send_email", "Initial Email"),
          Delays.days2()
        ),
        templates.email1TemplateId
      ),
      withCallScript(
        withDelay(
          withTask(
            step("phone_call", "Discovery Call"),
            "Call the prospect to discuss their needs"
          ),
          Delays.days3()
        ),
        templates.callScript ??
          "Hi {{ firstName }}, this is {{ senderName }} from {{ companyName }}..."
      ),
      withTemplate(
        withDelay(
          step("send_email", "Call Follow-up Email"),
          Delays.days5()
        ),
        templates.email2TemplateId
      ),
      withTemplate(
        step("send_email", "Final Follow-up"),
        templates.email3TemplateId
      ),
    ]
  );
}

// ─────────────────────────────────────────────────────────────
// Cadence Builder Engine
// ─────────────────────────────────────────────────────────────

export interface CadenceBuilderConfig {
  store: CadenceStore;
}

/**
 * High-level cadence builder: save, load, update, delete cadences.
 */
export class CadenceBuilder {
  private config: CadenceBuilderConfig;

  constructor(config: CadenceBuilderConfig) {
    this.config = config;
  }

  /**
   * Save a new cadence (or update an existing one).
   */
  async save(cadence: Cadence): Promise<Cadence> {
    const parsed = CadenceSchema.safeParse(cadence);
    if (!parsed.success) {
      throw new Error(
        `Cadence validation failed: ${parsed.error.issues.map((i) => i.message).join(", ")}`
      );
    }

    await this.config.store.saveCadence(cadence);
    return cadence;
  }

  /**
   * Load a cadence by ID.
   */
  async get(id: string): Promise<Cadence | null> {
    return this.config.store.getCadence(id);
  }

  /**
   * List all saved cadences.
   */
  async list(): Promise<Cadence[]> {
    return this.config.store.listCadences();
  }

  /**
   * Delete a cadence.
   */
  async delete(id: string): Promise<void> {
    return this.config.store.deleteCadence(id);
  }

  /**
   * Update the steps of an existing cadence.
   */
  async updateSteps(
    id: string,
    steps: SequenceStep[]
  ): Promise<Cadence> {
    const existing = await this.config.store.getCadence(id);
    if (!existing) {
      throw new Error(`Cadence ${id} not found`);
    }

    const updated: Cadence = {
      ...existing,
      steps,
      version: existing.version + 1,
      updatedAt: new Date().toISOString(),
    };

    const parsed = CadenceSchema.safeParse(updated);
    if (!parsed.success) {
      throw new Error(
        `Cadence validation failed: ${parsed.error.issues.map((i) => i.message).join(", ")}`
      );
    }

    return this.config.store.saveCadence(updated);
  }

  /**
   * Add a step to an existing cadence at a specific position.
   */
  async addStep(
    cadenceId: string,
    stepBuilder: StepBuilder,
    position?: number // undefined = append
  ): Promise<Cadence> {
    const existing = await this.config.store.getCadence(cadenceId);
    if (!existing) {
      throw new Error(`Cadence ${cadenceId} not found`);
    }

    const newStep = buildStep(stepBuilder);
    const steps = [...existing.steps];

    if (position !== undefined && position >= 0 && position <= steps.length) {
      steps.splice(position, 0, newStep);
    } else {
      steps.push(newStep);
    }

    return this.updateSteps(cadenceId, steps);
  }

  /**
   * Remove a step from a cadence.
   */
  async removeStep(
    cadenceId: string,
    stepId: string
  ): Promise<Cadence> {
    const existing = await this.config.store.getCadence(cadenceId);
    if (!existing) {
      throw new Error(`Cadence ${cadenceId} not found`);
    }

    const steps = existing.steps.filter((s) => s.id !== stepId);
    if (steps.length === existing.steps.length) {
      throw new Error(`Step ${stepId} not found in cadence ${cadenceId}`);
    }

    return this.updateSteps(cadenceId, steps);
  }

  /**
   * Toggle a step's enabled state.
   */
  async toggleStep(
    cadenceId: string,
    stepId: string,
    enabled: boolean
  ): Promise<Cadence> {
    const existing = await this.config.store.getCadence(cadenceId);
    if (!existing) {
      throw new Error(`Cadence ${cadenceId} not found`);
    }

    const steps = existing.steps.map((s) =>
      s.id === stepId ? { ...s, enabled } : s
    );

    return this.updateSteps(cadenceId, steps);
  }
}

// ─────────────────────────────────────────────────────────────
// In-Memory Cadence Store (for testing/dev)
// ─────────────────────────────────────────────────────────────

import type { SequenceEnrollment } from "./types.js";

export class InMemoryCadenceStore implements CadenceStore {
  private cadences = new Map<string, Cadence>();
  private enrollments = new Map<string, SequenceEnrollment>();

  // ── Cadences ──

  async getCadence(id: string): Promise<Cadence | null> {
    return this.cadences.get(id) ?? null;
  }

  async listCadences(): Promise<Cadence[]> {
    return Array.from(this.cadences.values());
  }

  async saveCadence(cadence: Cadence): Promise<Cadence> {
    this.cadences.set(cadence.id, cadence);
    return cadence;
  }

  async deleteCadence(id: string): Promise<void> {
    this.cadences.delete(id);
  }

  // ── Enrollments ──

  async getEnrollment(
    id: string
  ): Promise<SequenceEnrollment | null> {
    return this.enrollments.get(id) ?? null;
  }

  async listEnrollments(filters?: {
    cadenceId?: string;
    status?: string;
    prospectId?: string;
  }): Promise<SequenceEnrollment[]> {
    let results = Array.from(this.enrollments.values());

    if (filters?.cadenceId) {
      results = results.filter((e) => e.cadenceId === filters.cadenceId);
    }
    if (filters?.status) {
      results = results.filter((e) => e.status === filters.status);
    }
    if (filters?.prospectId) {
      results = results.filter((e) => e.prospectId === filters.prospectId);
    }

    return results;
  }

  async saveEnrollment(
    enrollment: SequenceEnrollment
  ): Promise<SequenceEnrollment> {
    this.enrollments.set(enrollment.id, enrollment);
    return enrollment;
  }

  async updateEnrollment(
    id: string,
    update: Partial<SequenceEnrollment>
  ): Promise<SequenceEnrollment> {
    const existing = this.enrollments.get(id);
    if (!existing) {
      throw new Error(`Enrollment ${id} not found`);
    }
    const updated = { ...existing, ...update };
    this.enrollments.set(id, updated);
    return updated;
  }

  /** Seed cadences and enrollments for testing. */
  seed(
    cadences?: Cadence[],
    enrollments?: SequenceEnrollment[]
  ): void {
    if (cadences) {
      for (const c of cadences) {
        this.cadences.set(c.id, c);
      }
    }
    if (enrollments) {
      for (const e of enrollments) {
        this.enrollments.set(e.id, e);
      }
    }
  }

  /** Clear all data. */
  clear(): void {
    this.cadences.clear();
    this.enrollments.clear();
  }
}