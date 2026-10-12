import type {
  ReplyToClassify,
  ReplyClassification,
  ClassifyReplyFn,
} from "./types.js";

// ─────────────────────────────────────────────────────────────
// Pattern-Based Pre-Filtering
// ─────────────────────────────────────────────────────────────
// These heuristics catch obvious auto-replies, bounces, and OOO
// without calling an LLM. Falls through to LLM if uncertain.

export interface PatternMatch {
  category: ReplyClassification["category"];
  confidence: number;
  reason: string;
}

/**
 * Known email addresses / domains used by popular auto-reply services.
 */
const AUTO_REPLY_DOMAINS = new Set([
  "mailer-daemon",
  "postmaster",
  "noreply",
  "no-reply",
  "donotreply",
]);

const AUTO_REPLY_SUBJECT_PREFIXES = [
  "auto:",
  "automatic reply:",
  "out of office:",
  "out of the office:",
  "vacation:",
  "away from",
  "undeliverable:",
  "delivery status notification",
  "returned mail:",
  "mail delivery failed",
  "failure notice",
];

const UNSUBSCRIBE_PATTERNS = [
  /\bunsubscribe\b/i,
  /\bplease remove\b/i,
  /\btake me off\b/i,
  /\bremove me\b/i,
  /\bopt[- ]out\b/i,
  /\bdo not contact\b/i,
  /\bdon't email\b/i,
  /\bstop emailing\b/i,
];

interface HeaderRecord {
  name: string;
  value: string;
}

/**
 * Normalize headers into a record for easier lookup.
 */
function normalizeHeaders(
  headers: Record<string, string> | undefined
): Record<string, string> {
  if (!headers) return {};
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    result[key.toLowerCase()] = value;
  }
  return result;
}

/**
 * Check if the from address looks like a bounce/automated sender.
 */
function isBounceAddress(from: string): boolean {
  const normalized = from.toLowerCase();
  return AUTO_REPLY_DOMAINS.has(normalized) ||
    normalized.startsWith("mailer-daemon@") ||
    normalized.startsWith("postmaster@") ||
    normalized.startsWith("noreply@") ||
    normalized.startsWith("no-reply@");
}

/**
 * Check subject for known auto-reply prefixes.
 */
function checkSubjectForAutoReply(subject: string): PatternMatch | null {
  const normalized = subject.toLowerCase();
  for (const prefix of AUTO_REPLY_SUBJECT_PREFIXES) {
    if (normalized.startsWith(prefix)) {
      return {
        category: "auto_reply",
        confidence: 0.95,
        reason: `Subject matches auto-reply prefix: "${prefix}"`,
      };
    }
  }
  return null;
}

/**
 * Check for OOO-specific patterns in subject and body.
 */
function checkOutOfOffice(
  subject: string,
  body: string
): PatternMatch | null {
  const combined = `${subject} ${body}`.toLowerCase();
  const oooPatterns = [
    /out of (the )?office/i,
    /on vacation/i,
    /annual leave/i,
    /away from .*(?:desk|office|email)/i,
    /i am currently out/i,
    /i will be out of/i,
    /returning on/i,
    /back in the office/i,
    /limited access to email/i,
  ];

  for (const pattern of oooPatterns) {
    if (pattern.test(combined)) {
      return {
        category: "out_of_office",
        confidence: 0.85,
        reason: `Out-of-office pattern detected: ${pattern.source}`,
      };
    }
  }
  return null;
}

/**
 * Check for unsubscribe requests.
 */
function checkUnsubscribe(body: string): PatternMatch | null {
  for (const pattern of UNSUBSCRIBE_PATTERNS) {
    if (pattern.test(body)) {
      return {
        category: "unsubscribe",
        confidence: 0.9,
        reason: `Unsubscribe pattern detected: ${pattern.source}`,
      };
    }
  }
  return null;
}

/**
 * Detect bounce/undeliverable messages.
 */
function checkBounce(
  headers: Record<string, string>,
  subject: string,
  body: string
): PatternMatch | null {
  const combined = `${subject} ${body}`.toLowerCase();

  // Common bounce indicators
  if (
    combined.includes("undeliverable") ||
    combined.includes("delivery has failed") ||
    combined.includes("mail delivery failed") ||
    combined.includes("returned mail") ||
    combined.includes("could not be delivered") ||
    combined.includes("user unknown") ||
    combined.includes("mailbox not found") ||
    combined.includes("no such user") ||
    combined.includes("recipient rejected")
  ) {
    return {
      category: "bounce",
      confidence: 0.95,
      reason: "Bounce/undeliverable pattern detected in message content",
    };
  }

  // Check Content-Type for DSN
  if (
    headers["content-type"]?.includes("delivery-status") ||
    headers["content-type"]?.includes("report-type=delivery-status")
  ) {
    return {
      category: "bounce",
      confidence: 0.92,
      reason: "Delivery Status Notification content-type detected",
    };
  }

  return null;
}

/**
 * Check for the X-Autoreply or Precedence: bulk/auto_reply headers.
 */
function checkAutoReplyHeaders(
  headers: Record<string, string>
): PatternMatch | null {
  if (
    headers["x-autoreply"] === "yes" ||
    headers["x-autorespond"] ||
    headers["auto-submitted"] === "auto-replied" ||
    headers["auto-submitted"] === "auto-generated"
  ) {
    return {
      category: "auto_reply",
      confidence: 0.9,
      reason: "Auto-reply header detected",
    };
  }

  if (
    headers["precedence"] === "bulk" ||
    headers["precedence"] === "auto_reply" ||
    headers["precedence"] === "junk"
  ) {
    return {
      category: "auto_reply",
      confidence: 0.8,
      reason: `Precedence header: ${headers["precedence"]}`,
    };
  }

  return null;
}

/**
 * Check for positive interest signals.
 * IMPORTANT: negative signals (not_interested) are checked FIRST in the pipeline
 * (see checkNotInterestedSignals below). When both exist, negative wins.
 * Also, the "interested" pattern here uses a negative lookbehind to avoid
 * matching "not interested" as a false positive.
 */
function checkInterestSignals(subject: string, body: string): PatternMatch | null {
  const combined = `${subject} ${body}`.toLowerCase();
  const interestPatterns = [
    /(?<!not )interested\b/i,
    /(?:i am|i'm) interested/i,
    /(?:tell me|let me know) more/i,
    /(?:schedule|set up|book) (?:a |some )?time/i,
    /(?:send|share) (?:me |over )?(?:more |additional )?info/i,
    /(?:how does|how do) (?:it|this|pricing)/i,
    /demo/i,
    /trial/i,
    /(?:sounds |looks? )(?:interesting|great|good|promising)/i,
    /(?:would love|would like) to (?:learn|see|hear|talk|chat)/i,
  ];

  let strongestMatch: PatternMatch | null = null;
  for (const pattern of interestPatterns) {
    if (pattern.test(combined)) {
      strongestMatch = {
        category: "interested",
        confidence: 0.7,
        reason: `Interest signal: ${pattern.source}`,
      };
      break;
    }
  }
  return strongestMatch;
}

/**
 * Check for negative/not-interested signals.
 */
function checkNotInterestedSignals(
  subject: string,
  body: string
): PatternMatch | null {
  const combined = `${subject} ${body}`.toLowerCase();
  const notInterestedPatterns = [
    /not interested/i,
    /not a (?:good )?fit/i,
    /don't contact/i,
    /(?:please |kindly )?(?:stop|cease)/i,
    /(?:leave me|me) alone/i,
    /spam/i,
    /(?:not|don't) (?:need|want|looking)/i,
  ];

  for (const pattern of notInterestedPatterns) {
    if (pattern.test(combined)) {
      return {
        category: "not_interested",
        confidence: 0.75,
        reason: `Not-interested signal: ${pattern.source}`,
      };
    }
  }
  return null;
}

/**
 * Check for wrong person signals.
 */
function checkWrongPerson(subject: string, body: string): PatternMatch | null {
  const combined = `${subject} ${body}`.toLowerCase();
  const wrongPersonPatterns = [
    /wrong person/i,
    /no longer .*(?:work|at|with|here)/i,
    /not .*(?:my|our) (?:role|department|responsibility)/i,
    /(?:left|no longer with) the company/i,
    /(?:reach out to|contact) (?:my colleague|someone else)/i,
    /i'm not the right person/i,
  ];

  for (const pattern of wrongPersonPatterns) {
    if (pattern.test(combined)) {
      return {
        category: "wrong_person",
        confidence: 0.75,
        reason: `Wrong person signal: ${pattern.source}`,
      };
    }
  }
  return null;
}

// ─────────────────────────────────────────────────────────────
// Classification Pipeline
// ─────────────────────────────────────────────────────────────

/**
 * Run pattern-based classification. Returns null if no pattern
 * matches with confidence >= threshold — caller should fall back
 * to LLM classification.
 */
export function classifyByPatterns(
  reply: ReplyToClassify
): PatternMatch | null {
  const headers = normalizeHeaders(reply.headers);

  // 1. Check from address for bounce senders
  if (isBounceAddress(reply.prospectEmail)) {
    return {
      category: "bounce",
      confidence: 0.98,
      reason: "From address is a known bounce sender",
    };
  }

  // 2. Check auto-reply headers (highest signal)
  const autoHeader = checkAutoReplyHeaders(headers);
  if (autoHeader) return autoHeader;

  // 3. Check subject for auto-reply prefixes
  const subjectAuto = checkSubjectForAutoReply(reply.subject);
  if (subjectAuto) return subjectAuto;

  // 4. Bounce detection
  const bounce = checkBounce(headers, reply.subject, reply.bodyText);
  if (bounce) return bounce;

  // 5. Out of office
  const ooo = checkOutOfOffice(reply.subject, reply.bodyText);
  if (ooo) return ooo;

  // 6. Unsubscribe
  const unsub = checkUnsubscribe(reply.bodyText);
  if (unsub) return unsub;

  // 7. Not interested — checked BEFORE interest to prevent
  //    "not interested" from being a false positive on "interested"
  const notInt = checkNotInterestedSignals(reply.subject, reply.bodyText);
  if (notInt) return notInt;

  // 8. Interest signals — only reached if not_interested didn't match
  const interest = checkInterestSignals(reply.subject, reply.bodyText);
  if (interest) return interest;

  // 9. Wrong person
  const wrong = checkWrongPerson(reply.subject, reply.bodyText);
  if (wrong) return wrong;

  return null;
}

/**
 * Map a PatternMatch category to the suggested next action.
 */
export function getSuggestedAction(
  category: ReplyClassification["category"]
): ReplyClassification["suggestedAction"] {
  switch (category) {
    case "interested":
      return "notify_sales";
    case "not_interested":
      return "stop_sequence";
    case "wrong_person":
      return "update_prospect";
    case "out_of_office":
      return "ignore";
    case "auto_reply":
      return "ignore";
    case "unsubscribe":
      return "stop_sequence";
    case "bounce":
      return "stop_sequence";
    case "needs_classification":
      return "manual_review";
    case "other":
      return "manual_review";
  }
}

/**
 * Extract useful info from an OOO reply.
 */
function extractOooInfo(
  subject: string,
  body: string
): ReplyClassification["extractedInfo"] {
  const combined = `${subject}\n${body}`;

  // Try to extract a return date
  const returnDatePatterns = [
    /return(?:ing)? (?:on |to .*on )(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})/i,
    /back (?:on |in the office on )(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})/i,
    /return(?:ing)? (?:on )?((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\w* \d{1,2})/i,
  ];

  let returnDate: string | undefined;
  for (const pattern of returnDatePatterns) {
    const match = combined.match(pattern);
    if (match?.[1]) {
      returnDate = match[1];
      break;
    }
  }

  if (returnDate) {
    return { returnDate };
  }
  return undefined;
}

/**
 * Extract alternative contact from wrong-person replies.
 */
function extractAlternativeContact(
  body: string
): string | undefined {
  const emailPattern = /([\w.+-]+@[\w-]+\.[\w.-]+)/i;
  const match = body.match(emailPattern);
  return match?.[1];
}

/**
 * Post-process the classification to enrich extracted info.
 */
function enrichClassification(
  category: ReplyClassification["category"],
  reply: ReplyToClassify
): ReplyClassification["extractedInfo"] {
  switch (category) {
    case "out_of_office":
      return extractOooInfo(reply.subject, reply.bodyText);
    case "wrong_person":
      return {
        alternativeContact: extractAlternativeContact(reply.bodyText),
      };
    default:
      return undefined;
  }
}

// ─────────────────────────────────────────────────────────────
// Main Classifier
// ─────────────────────────────────────────────────────────────

export interface ReplyClassifierConfig {
  /** LLM classifier injected from agent-core or any custom impl. */
  classifyWithLLM?: ClassifyReplyFn;
  /** Minimum confidence for pattern-based classification before falling through to LLM. */
  patternConfidenceThreshold?: number;
}

/**
 * The reply classifier: pattern-based first, then LLM fallback.
 *
 * Pattern-based classification is fast, free, and catches 80%+ of
 * common auto-reply / bounce / OOO scenarios. When pattern confidence
 * is below the threshold, the LLM is invoked for deeper analysis.
 */
export class ReplyClassifier {
  private config: ReplyClassifierConfig;

  constructor(config: ReplyClassifierConfig = {}) {
    this.config = {
      patternConfidenceThreshold: 0.85,
      ...config,
    };
  }

  /**
   * Classify a reply. Returns the classification with suggested action.
   */
  async classify(reply: ReplyToClassify): Promise<ReplyClassification> {
    // 1. Try pattern-based classification first
    const patternMatch = classifyByPatterns(reply);

    if (
      patternMatch &&
      patternMatch.confidence >=
        (this.config.patternConfidenceThreshold ?? 0.85)
    ) {
      return {
        category: patternMatch.category,
        confidence: patternMatch.confidence,
        reasoning: patternMatch.reason,
        suggestedAction: getSuggestedAction(patternMatch.category),
        extractedInfo: enrichClassification(patternMatch.category, reply),
      };
    }

    // 2. Fall through to LLM
    if (this.config.classifyWithLLM) {
      const llmResult = await this.config.classifyWithLLM(reply);
      return {
        ...llmResult,
        extractedInfo: enrichClassification(llmResult.category, reply),
      };
    }

    // 3. No LLM available — use pattern result with low confidence
    if (patternMatch) {
      return {
        category: patternMatch.category,
        confidence: patternMatch.confidence,
        reasoning: `${patternMatch.reason} (no LLM fallback available)`,
        suggestedAction: getSuggestedAction(patternMatch.category),
        extractedInfo: enrichClassification(patternMatch.category, reply),
      };
    }

    // 4. Can't classify — flag for manual review
    return {
      category: "needs_classification",
      confidence: 0,
      reasoning: "Unable to classify: no pattern match and no LLM available",
      suggestedAction: "manual_review",
    };
  }

  /**
   * Synchronous classify using only patterns (no LLM).
   */
  classifySync(reply: ReplyToClassify): ReplyClassification {
    const patternMatch = classifyByPatterns(reply);

    if (patternMatch) {
      return {
        category: patternMatch.category,
        confidence: patternMatch.confidence,
        reasoning: patternMatch.reason,
        suggestedAction: getSuggestedAction(patternMatch.category),
        extractedInfo: enrichClassification(patternMatch.category, reply),
      };
    }

    return {
      category: "needs_classification",
      confidence: 0,
      reasoning: "Unable to classify with pattern matching alone",
      suggestedAction: "manual_review",
    };
  }
}

/**
 * Default LLM classifier builder using the @ardyn-sdr/agent-core package.
 * This is a factory that creates a ClassifyReplyFn using LangChain.
 *
 * Usage:
 * ```ts
 * import { createLlmClassifier } from "@ardyn-sdr/email-engine/reply-classifier";
 * const classifier = new ReplyClassifier({
 *   classifyWithLLM: await createLlmClassifier({ model: "gpt-4o" }),
 * });
 * ```
 */
export async function createLlmClassifier(options?: {
  model?: string;
}): Promise<ClassifyReplyFn> {
  return async (reply: ReplyToClassify): Promise<ReplyClassification> => {
    // Use agent-core's LLM if available; otherwise a standalone OpenAI call.
    try {
      const { ChatOpenAI } = await import("@langchain/openai");
      const { ChatAnthropic } = await import("@langchain/anthropic");

      const modelName = options?.model ?? "gpt-4o";
      const isAnthropic = modelName.startsWith("claude");

      const model = isAnthropic
        ? new ChatAnthropic({
            model: modelName,
            temperature: 0,
          })
        : new ChatOpenAI({
            model: modelName,
            temperature: 0,
          });

      const systemPrompt = `You are an email reply classifier for an outbound sales team.
Analyze the reply and classify it into exactly one category:
- interested: prospect wants to learn more, schedule a call, or shows buying signals
- not_interested: prospect explicitly declines or says they're not interested
- wrong_person: prospect says they're the wrong contact, no longer at company, etc.
- out_of_office: automated out-of-office or vacation auto-reply
- auto_reply: any other automated reply (not OOO)
- unsubscribe: prospect asks to be removed from contact list
- bounce: email delivery failure notification
- other: something else that doesn't fit

Respond with JSON only: {"category": "...", "confidence": 0.0-1.0, "reasoning": "..."}`;

      const response = await model.invoke([
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: `Subject: ${reply.subject}\n\nBody:\n${reply.bodyText.slice(0, 2000)}`,
        },
      ]);

      const content =
        typeof response.content === "string"
          ? response.content
          : (response.content as Array<{ text?: string }>)
              .map((c) => c.text ?? "")
              .join("");

      // Parse JSON from response
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        return {
          category: "needs_classification",
          confidence: 0,
          reasoning: `LLM returned unparseable response: ${content.slice(0, 200)}`,
          suggestedAction: "manual_review",
        };
      }

      const parsed = JSON.parse(jsonMatch[0]) as {
        category: string;
        confidence: number;
        reasoning: string;
      };

      // Validate category
      const validCategories = new Set([
        "interested",
        "not_interested",
        "wrong_person",
        "out_of_office",
        "auto_reply",
        "unsubscribe",
        "bounce",
        "other",
      ]);

      const category = validCategories.has(parsed.category)
        ? (parsed.category as ReplyClassification["category"])
        : "other";

      return {
        category,
        confidence: Math.min(1, Math.max(0, parsed.confidence ?? 0.5)),
        reasoning: parsed.reasoning ?? "Classified by LLM",
        suggestedAction: getSuggestedAction(category),
      };
    } catch (error) {
      return {
        category: "needs_classification",
        confidence: 0,
        reasoning: `LLM classification failed: ${error instanceof Error ? error.message : String(error)}`,
        suggestedAction: "manual_review",
      };
    }
  };
}