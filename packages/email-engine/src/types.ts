import { z } from "zod";

// ─────────────────────────────────────────────────────────────
// Email Address
// ─────────────────────────────────────────────────────────────

export const EmailAddressSchema = z.object({
  email: z.string().email(),
  name: z.string().optional(),
});

export type EmailAddress = z.infer<typeof EmailAddressSchema>;

// ─────────────────────────────────────────────────────────────
// SMTP / Postal
// ─────────────────────────────────────────────────────────────

export const PostalSendRequestSchema = z.object({
  from: EmailAddressSchema,
  to: z.array(EmailAddressSchema).min(1).max(50),
  cc: z.array(EmailAddressSchema).optional(),
  bcc: z.array(EmailAddressSchema).optional(),
  subject: z.string().min(1).max(998),
  htmlBody: z.string().min(1),
  textBody: z.string().min(1),
  replyTo: z.string().email().optional(),
  messageId: z.string().optional(),
  tags: z.array(z.string()).optional(),
  headers: z.record(z.string(), z.string()).optional(),
  attachments: z
    .array(
      z.object({
        name: z.string(),
        content: z.string(),
        contentType: z.string(),
      })
    )
    .optional(),
});

export type PostalSendRequest = z.infer<typeof PostalSendRequestSchema>;

export const PostalSendResponseSchema = z.object({
  messageId: z.string(),
  token: z.string(),
  status: z.enum(["queued", "sent", "deferred", "bounced"]),
  details: z.string().optional(),
  timestamp: z.string(),
});

export type PostalSendResponse = z.infer<typeof PostalSendResponseSchema>;

export const PostalDeliveryStatusSchema = z.object({
  messageId: z.string(),
  status: z.enum([
    "queued",
    "sent",
    "delivered",
    "opened",
    "clicked",
    "bounced",
    "complained",
    "deferred",
    "soft_bounce",
    "hard_bounce",
  ]),
  details: z.string().optional(),
  timestamp: z.string(),
  attempts: z.number().int().nonnegative().optional(),
});

export type PostalDeliveryStatus = z.infer<typeof PostalDeliveryStatusSchema>;

// ─────────────────────────────────────────────────────────────
// Sending Domain
// ─────────────────────────────────────────────────────────────

export const DomainHealthSchema = z.object({
  domain: z.string(),
  status: z.enum(["warming", "active", "cooling", "blocked", "disabled"]),
  dailyLimit: z.number().int().positive(),
  sentToday: z.number().int().nonnegative(),
  bounceRate: z.number().min(0).max(1),
  complaintRate: z.number().min(0).max(1),
  openRate: z.number().min(0).max(1),
  clickRate: z.number().min(0).max(1),
  reputation: z.number().min(0).max(100),
  lastUsedAt: z.string().nullable(),
  createdAt: z.string(),
  warmupStartedAt: z.string().nullable(),
  warmupStage: z.number().int().min(0).max(30).nullable(),
  dkimVerified: z.boolean(),
  spfVerified: z.boolean(),
  dmarcVerified: z.boolean(),
  returnPath: z.string().optional(),
});

export type DomainHealth = z.infer<typeof DomainHealthSchema>;

export const DomainRotationConfigSchema = z.object({
  strategy: z.enum(["round-robin", "weighted", "least-used"]),
  excludeDomains: z.array(z.string()).optional(),
  maxDailyPerDomain: z.number().int().positive().default(200),
  cooldownAfterBounce: z.number().int().nonnegative().default(3600),
  cooldownAfterComplaint: z.number().int().nonnegative().default(86400),
  bounceThreshold: z.number().min(0).max(1).default(0.05),
  complaintThreshold: z.number().min(0).max(1).default(0.001),
});

export type DomainRotationConfig = z.infer<typeof DomainRotationConfigSchema>;

// ─────────────────────────────────────────────────────────────
// Sequence / Cadence
// ─────────────────────────────────────────────────────────────

export const ChannelTypeSchema = z.enum(["email", "linkedin", "call", "sms"]);
export type ChannelType = z.infer<typeof ChannelTypeSchema>;

export const SequenceStepTypeSchema = z.enum([
  "send_email",
  "linkedin_connect",
  "linkedin_message",
  "linkedin_visit",
  "phone_call",
  "sms",
  "wait",
  "condition",
  "webhook",
  "manual_task",
]);

export type SequenceStepType = z.infer<typeof SequenceStepTypeSchema>;

export const WaitDelaySchema = z.object({
  value: z.number().int().positive(),
  unit: z.enum(["minutes", "hours", "days", "weeks"]),
  businessDaysOnly: z.boolean().default(true),
  minHours: z.number().int().min(8).default(8),
  maxHours: z.number().int().max(20).default(17),
});

export type WaitDelay = z.infer<typeof WaitDelaySchema>;

export const BranchConditionSchema = z.object({
  type: z.enum(["reply", "no_reply", "opened", "not_opened", "clicked", "replied_positive", "replied_negative", "time_elapsed", "always"]),
  value: z.string().optional(),
});

export type BranchCondition = z.infer<typeof BranchConditionSchema>;

export const BranchActionSchema = z.object({
  condition: BranchConditionSchema,
  nextStepIndex: z.number().int().nonnegative().optional(),
  action: z.enum(["continue", "stop", "jump", "enroll_in_sequence"]).default("continue"),
  sequenceId: z.string().optional(),
});

export type BranchAction = z.infer<typeof BranchActionSchema>;

export const SequenceStepSchema = z.object({
  id: z.string(),
  type: SequenceStepTypeSchema,
  label: z.string().optional(),
  channel: ChannelTypeSchema.optional(),
  delayAfter: WaitDelaySchema.optional(),
  templateId: z.string().optional(),
  linkedinMessage: z.string().optional(),
  callScript: z.string().optional(),
  smsMessage: z.string().optional(),
  branches: z.array(BranchActionSchema).optional(),
  webhookUrl: z.string().url().optional(),
  taskDescription: z.string().optional(),
  config: z.record(z.unknown()).optional(),
  enabled: z.boolean().default(true),
});

export type SequenceStep = z.infer<typeof SequenceStepSchema>;

export const CadenceSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  steps: z.array(SequenceStepSchema),
  startOn: z
    .enum(["immediate", "scheduled", "timezone_aware"])
    .default("immediate"),
  scheduledTime: z.string().optional(),
  timezone: z.string().optional(),
  maxSteps: z.number().int().positive().optional(),
  stopOnReply: z.boolean().default(true),
  stopOnBounce: z.boolean().default(true),
  priority: z.enum(["low", "normal", "high"]).default("normal"),
  tags: z.array(z.string()).optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
  version: z.number().int().positive().default(1),
});

export type Cadence = z.infer<typeof CadenceSchema>;

// ─────────────────────────────────────────────────────────────
// Sequence Enrollment
// ─────────────────────────────────────────────────────────────

export const SequenceEnrollmentSchema = z.object({
  id: z.string(),
  cadenceId: z.string(),
  prospectId: z.string(),
  prospectEmail: z.string().email(),
  prospectName: z.string().optional(),
  companyName: z.string().optional(),
  currentStepIndex: z.number().int().nonnegative().default(0),
  status: z.enum(["active", "paused", "completed", "stopped", "bounced", "opted_out"]).default("active"),
  pausedAt: z.string().nullable(),
  startedAt: z.string(),
  completedAt: z.string().nullable(),
  replyReceived: z.boolean().default(false),
  replyClassification: ReplyClassificationSchema.nullable(),
  stepHistory: z
    .array(
      z.object({
        stepId: z.string(),
        stepType: SequenceStepTypeSchema,
        status: z.enum(["scheduled", "executing", "completed", "failed", "skipped"]),
        scheduledAt: z.string(),
        executedAt: z.string().nullable(),
        error: z.string().nullable(),
        messageId: z.string().nullable(),
      })
    )
    .default([]),
  context: z.record(z.unknown()).optional(),
  tags: z.array(z.string()).optional(),
});

export type SequenceEnrollment = z.infer<typeof SequenceEnrollmentSchema>;

// ─────────────────────────────────────────────────────────────
// Reply Classification
// ─────────────────────────────────────────────────────────────

export const ReplyClassificationSchema = z.object({
  category: z.enum([
    "interested",
    "not_interested",
    "wrong_person",
    "out_of_office",
    "auto_reply",
    "unsubscribe",
    "bounce",
    "needs_classification",
    "other",
  ]),
  confidence: z.number().min(0).max(1),
  reasoning: z.string(),
  suggestedAction: z.enum([
    "notify_sales",
    "stop_sequence",
    "pause_sequence",
    "update_prospect",
    "continue_sequence",
    "escalate",
    "ignore",
    "manual_review",
  ]),
  extractedInfo: z
    .object({
      alternativeContact: z.string().email().optional(),
      reason: z.string().optional(),
      returnDate: z.string().optional(),
      phoneNumber: z.string().optional(),
      jobTitle: z.string().optional(),
    })
    .optional(),
});

export type ReplyClassification = z.infer<typeof ReplyClassificationSchema>;

export const ReplyToClassifySchema = z.object({
  id: z.string(),
  enrollmentId: z.string(),
  prospectEmail: z.string().email(),
  subject: z.string(),
  bodyText: z.string(),
  bodyHtml: z.string().optional(),
  headers: z.record(z.string(), z.string()).optional(),
  receivedAt: z.string(),
  rawMessageId: z.string(),
  inReplyTo: z.string().optional(),
});

export type ReplyToClassify = z.infer<typeof ReplyToClassifySchema>;

// ─────────────────────────────────────────────────────────────
// Templates
// ─────────────────────────────────────────────────────────────

export const EmailTemplateSchema = z.object({
  id: z.string(),
  name: z.string(),
  subject: z.string(),
  htmlBody: z.string(),
  textBody: z.string(),
  variables: z.array(
    z.object({
      name: z.string(),
      description: z.string().optional(),
      required: z.boolean().default(true),
      defaultValue: z.string().optional(),
      type: z.enum(["text", "url", "email", "number", "date"]).default("text"),
    })
  ),
  category: z.string().optional(),
  version: z.number().int().positive().default(1),
  createdAt: z.string(),
  updatedAt: z.string(),
  spamScore: z.number().min(0).max(100).optional(),
  metadata: z.record(z.unknown()).optional(),
});

export type EmailTemplate = z.infer<typeof EmailTemplateSchema>;

export const TemplateRenderResultSchema = z.object({
  subject: z.string(),
  htmlBody: z.string(),
  textBody: z.string(),
  missingVariables: z.array(z.string()),
  spamScore: z.number().min(0).max(100),
  spamWarnings: z.array(z.string()),
});

export type TemplateRenderResult = z.infer<typeof TemplateRenderResultSchema>;

// ─────────────────────────────────────────────────────────────
// SMTP Client Interfaces (for injection)
// ─────────────────────────────────────────────────────────────

export type SendEmailFn = (
  request: PostalSendRequest
) => Promise<PostalSendResponse>;

export type GetDeliveryStatusFn = (
  messageId: string
) => Promise<PostalDeliveryStatus>;

export interface SmtpClientConfig {
  postalApiUrl: string;
  postalApiKey: string;
  defaultDomain: string;
  defaultFromName: string;
}

// ─────────────────────────────────────────────────────────────
// LLM Classifier Interface (for injection)
// ─────────────────────────────────────────────────────────────

export type ClassifyReplyFn = (
  reply: ReplyToClassify
) => Promise<ReplyClassification>;

// ─────────────────────────────────────────────────────────────
// Domain Health Store (for injection)
// ─────────────────────────────────────────────────────────────

export interface DomainHealthStore {
  getDomainHealth(domain: string): Promise<DomainHealth | null>;
  getAllDomains(): Promise<DomainHealth[]>;
  updateDomainHealth(
    domain: string,
    update: Partial<DomainHealth>
  ): Promise<DomainHealth>;
  recordSend(domain: string, count?: number): Promise<void>;
  recordBounce(domain: string): Promise<void>;
  recordComplaint(domain: string): Promise<void>;
  recordOpen(domain: string): Promise<void>;
  recordClick(domain: string): Promise<void>;
}

// ─────────────────────────────────────────────────────────────
// Template Store (for injection)
// ─────────────────────────────────────────────────────────────

export interface TemplateStore {
  getTemplate(id: string): Promise<EmailTemplate | null>;
  listTemplates(category?: string): Promise<EmailTemplate[]>;
  saveTemplate(template: EmailTemplate): Promise<EmailTemplate>;
  deleteTemplate(id: string): Promise<void>;
}

// ─────────────────────────────────────────────────────────────
// Cadence Store (for injection)
// ─────────────────────────────────────────────────────────────

export interface CadenceStore {
  getCadence(id: string): Promise<Cadence | null>;
  listCadences(): Promise<Cadence[]>;
  saveCadence(cadence: Cadence): Promise<Cadence>;
  deleteCadence(id: string): Promise<void>;
  getEnrollment(id: string): Promise<SequenceEnrollment | null>;
  listEnrollments(
    filters?: { cadenceId?: string; status?: string; prospectId?: string }
  ): Promise<SequenceEnrollment[]>;
  saveEnrollment(enrollment: SequenceEnrollment): Promise<SequenceEnrollment>;
  updateEnrollment(
    id: string,
    update: Partial<SequenceEnrollment>
  ): Promise<SequenceEnrollment>;
}

// ─────────────────────────────────────────────────────────────
// Event Emitter Interface
// ─────────────────────────────────────────────────────────────

export type EmailEventType =
  | "email:sent"
  | "email:delivered"
  | "email:opened"
  | "email:clicked"
  | "email:bounced"
  | "email:complained"
  | "email:deferred"
  | "reply:received"
  | "reply:classified"
  | "sequence:step_completed"
  | "sequence:completed"
  | "sequence:paused"
  | "sequence:resumed"
  | "sequence:stopped"
  | "domain:blocked"
  | "domain:limit_reached";

export type EmailEventHandler = (event: {
  type: EmailEventType;
  payload: Record<string, unknown>;
  timestamp: string;
}) => void | Promise<void>;

export interface EmailEventBus {
  on(type: EmailEventType, handler: EmailEventHandler): void;
  off(type: EmailEventType, handler: EmailEventHandler): void;
  emit(
    type: EmailEventType,
    payload: Record<string, unknown>
  ): Promise<void>;
}

// ─────────────────────────────────────────────────────────────
// Spam Check Heuristics
// ─────────────────────────────────────────────────────────────

export interface SpamCheckResult {
  score: number;
  warnings: string[];
  passed: boolean;
}

// ─────────────────────────────────────────────────────────────
// SMTP Client Interface (for injection)
// ─────────────────────────────────────────────────────────────

export interface SmtpClient {
  send(request: PostalSendRequest): Promise<PostalSendResponse>;
  getDeliveryStatus(messageId: string): Promise<PostalDeliveryStatus>;
  getDomains(): Promise<string[]>;
  checkDomainHealth(domain: string): Promise<DomainHealth>;
}