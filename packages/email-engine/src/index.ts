// ─────────────────────────────────────────────────────────────
// @ardyn-sdr/email-engine — Public API
// ─────────────────────────────────────────────────────────────
//
// This is the email pipeline for the open-source Ardyn SDR Agent.
// All exports are flat; import what you need.
//
// ─────────────────────────────────────────────────────────────

// ── Types & Schemas ────────────────────────────────────────

export {
  EmailAddressSchema,
  PostalSendRequestSchema,
  PostalSendResponseSchema,
  PostalDeliveryStatusSchema,
  DomainHealthSchema,
  DomainRotationConfigSchema,
  ChannelTypeSchema,
  SequenceStepTypeSchema,
  WaitDelaySchema,
  BranchConditionSchema,
  BranchActionSchema,
  SequenceStepSchema,
  CadenceSchema,
  SequenceEnrollmentSchema,
  ReplyClassificationSchema,
  ReplyToClassifySchema,
  EmailTemplateSchema,
  TemplateRenderResultSchema,
} from "./types.js";

export type {
  EmailAddress,
  PostalSendRequest,
  PostalSendResponse,
  PostalDeliveryStatus,
  DomainHealth,
  DomainRotationConfig,
  ChannelType,
  SequenceStepType,
  WaitDelay,
  BranchCondition,
  BranchAction,
  SequenceStep,
  Cadence,
  SequenceEnrollment,
  ReplyClassification,
  ReplyToClassify,
  EmailTemplate,
  TemplateRenderResult,
  SmtpClientConfig,
  SmtpClient,
  SendEmailFn,
  GetDeliveryStatusFn,
  ClassifyReplyFn,
  DomainHealthStore,
  TemplateStore,
  CadenceStore,
  EmailEventBus,
  EmailEventHandler,
  EmailEventType,
  SpamCheckResult,
} from "./types.js";

// ── SMTP Client ─────────────────────────────────────────────

export {
  PostalSmtpClient,
  InMemorySmtpClient,
  DEFAULT_SMTP_CONFIG,
} from "./smtp-client.js";

// ── Sequence Engine ─────────────────────────────────────────

export {
  SequenceEngine,
  delayToMs,
  calculateStepTime,
  SEQUENCE_QUEUE_NAME,
  SCHEDULER_QUEUE_NAME,
  DELIVERY_CHECK_QUEUE_NAME,
  REPLY_PROCESSOR_QUEUE_NAME,
} from "./sequence-engine.js";

export type {
  SequenceEngineConfig,
  StepJobData,
  DeliveryCheckJobData,
  ReplyProcessJobData,
} from "./sequence-engine.js";

// ── Reply Classifier ────────────────────────────────────────

export {
  ReplyClassifier,
  classifyByPatterns,
  getSuggestedAction,
  createLlmClassifier,
} from "./reply-classifier.js";

export type { ReplyClassifierConfig } from "./reply-classifier.js";

// ── Domain Manager ──────────────────────────────────────────

export {
  DomainManager,
  InMemoryDomainHealthStore,
  DEFAULT_ROTATION_CONFIG,
  WARMUP_SCHEDULE,
  MAX_WARMED_LIMIT,
} from "./domain-manager.js";

export type { DomainManagerConfig } from "./domain-manager.js";

// ── Template Engine ─────────────────────────────────────────

export {
  TemplateEngine,
  InMemoryTemplateStore,
  interpolate,
  extractVariables,
  checkSpamScore,
  injectUnsubscribeHtml,
  injectUnsubscribeText,
  UNSUBSCRIBE_HTML,
  UNSUBSCRIBE_TEXT,
} from "./template-engine.js";

export type {
  TemplateEngineConfig,
  SpamCheckConfig,
} from "./template-engine.js";

// ── Cadence Builder ─────────────────────────────────────────

export {
  CadenceBuilder,
  InMemoryCadenceStore,
  step,
  withChannel,
  withDelay,
  withTemplate,
  withBranches,
  withLinkedInMessage,
  withCallScript,
  withSmsMessage,
  withWebhook,
  withTask,
  disabled,
  buildStep,
  cadence,
  createStepId,
  resetStepCounter,
  standardEmailCadence,
  multiChannelCadence,
  emailWithCallCadence,
  Delays,
  Branches,
} from "./cadence-builder.js";

export type {
  StepBuilder,
  CadenceBuilderOptions,
  CadenceBuilderConfig,
} from "./cadence-builder.js";

// ── Event Bus ───────────────────────────────────────────────

export { InMemoryEventBus } from "./event-bus.js";