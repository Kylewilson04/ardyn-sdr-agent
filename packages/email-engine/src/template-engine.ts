import type {
  EmailTemplate,
  TemplateRenderResult,
  TemplateStore,
  SpamCheckResult,
} from "./types.js";
import { EmailTemplateSchema } from "./types.js";

// ─────────────────────────────────────────────────────────────
// Variable Interpolation
// ─────────────────────────────────────────────────────────────

/**
 * Simple variable syntax: {{ variableName }}
 */
const VARIABLE_RE = /\{\{\s*(\w+(?:\.\w+)*)\s*\}\}/g;

/**
 * Extract all variable names from a template string.
 */
export function extractVariables(template: string): string[] {
  const variables = new Set<string>();
  let match: RegExpExecArray | null;
  const regex = new RegExp(VARIABLE_RE);
  while ((match = regex.exec(template)) !== null) {
    variables.add(match[1]!);
  }
  return Array.from(variables);
}

/**
 * Interpolate variables into a template string.
 * Uses {{ variable }} syntax. Returns the rendered string
 * and a list of variables that were missing from the provided values.
 */
export function interpolate(
  template: string,
  values: Record<string, string | undefined>,
  defaults?: Record<string, string>
): { result: string; missingVariables: string[] } {
  const missing: string[] = [];

  const result = template.replace(
    VARIABLE_RE,
    (_match: string, varName: string) => {
      const value = values[varName];
      if (value !== undefined && value !== null) {
        return value;
      }
      if (defaults?.[varName] !== undefined) {
        return defaults[varName]!;
      }
      missing.push(varName);
      return `{{ ${varName} }}`; // Leave placeholder
    }
  );

  return { result, missingVariables: Array.from(new Set(missing)) };
}

// ─────────────────────────────────────────────────────────────
// Spam Check Heuristics
// ─────────────────────────────────────────────────────────────

export interface SpamCheckConfig {
  maxSubjectLength?: number;
  maxImageRatio?: number;
  maxLinkCount?: number;
  minTextToHtmlRatio?: number;
}

const DEFAULT_SPAM_CONFIG: Required<SpamCheckConfig> = {
  maxSubjectLength: 60,
  maxImageRatio: 0.3,
  maxLinkCount: 5,
  minTextToHtmlRatio: 0.3,
};

/**
 * Spam-filter words/phrases that increase spam score.
 * Higher weight = more spammy.
 */
const SPAM_TRIGGER_WORDS: Array<[RegExp, number]> = [
  [/\b(?:act now|limited time|exclusive offer|special promotion)\b/i, 5],
  [/\b(?:click (?:here|below)|click this link)\b/i, 4],
  [/\b(?:free|bonus|guaranteed|no obligation|no cost)\b/i, 3],
  [/\b(?:winner|congratulations!|you have been selected)\b/i, 8],
  [/\b(?:100%|one hundred percent|money back)\b/i, 4],
  [/\b(?:earn \$|make \$|extra income|work from home)\b/i, 6],
  [/\b(?:urgent|action required|immediate attention|time sensitive)\b/i, 5],
  [/\b(?:dear (?:friend|sir/madam|sir or madam))\b/i, 3],
  [/\b(?:opt[- ]?in|opt[- ]?out|unsubscribe)\b/i, -2], // Good to have!
  [/\b(?:viagra|cialis|casino|lottery|prize)\b/i, 10],
  [/\b(?:!!!|\*\*\*)/, 2],
  [/[A-Z]{10,}/, 3], // ALL CAPS LONG STRINGS
  [/\b(?:order now|buy now|shop now|call now)\b/i, 5],
  [/\b(?:you are a winner|you've won)\b/i, 8],
  [/\b(?:#1|best seller|top rated)\b/i, 2],
  [/\b(?:meet singles|dating|hot girls|sexy)\b/i, 10],
];

/**
 * Check an HTML body for excessive images.
 */
function checkImageRatio(html: string, maxRatio: number): SpamCheckResult["warnings"][number] | null {
  const imgCount = (html.match(/<img[\s>]/gi) || []).length;
  const textLength = html.replace(/<[^>]*>/g, "").length;

  if (textLength === 0 && imgCount > 0) {
    return {
      score: 8,
      warning: "HTML contains only images with no text content",
    };
  }

  if (imgCount > 0 && textLength < imgCount * 200) {
    return {
      score: 5,
      warning: "Image-heavy email with minimal text",
    };
  }

  return null;
}

/**
 * Check for excessive links.
 */
function checkLinks(html: string, maxLinks: number): SpamCheckResult["warnings"][number] | null {
  const linkCount = (html.match(/<a\s/gi) || []).length;
  if (linkCount > maxLinks) {
    return {
      score: Math.min(linkCount - maxLinks, 5),
      warning: `Email contains ${linkCount} links (max recommended: ${maxLinks})`,
    };
  }
  return null;
}

/**
 * Check for all-caps subject.
 */
function checkSubjectCaps(subject: string): SpamCheckResult["warnings"][number] | null {
  const upperCount = (subject.match(/[A-Z]/g) || []).length;
  const totalLetters = (subject.match(/[A-Za-z]/g) || []).length;
  if (totalLetters > 0 && upperCount / totalLetters > 0.7) {
    return {
      score: 4,
      warning: "Subject is mostly uppercase (looks like spam)",
    };
  }
  return null;
}

/**
 * Check for excessive punctuation in subject.
 */
function checkSubjectPunctuation(subject: string): SpamCheckResult["warnings"][number] | null {
  const exclaimCount = (subject.match(/!/g) || []).length;
  const questionCount = (subject.match(/\?/g) || []).length;

  if (exclaimCount > 2 || questionCount > 2) {
    return {
      score: 2,
      warning: "Subject has excessive exclamation or question marks",
    };
  }
  return null;
}

/**
 * Check subject length.
 */
function checkSubjectLength(subject: string, maxLen: number): SpamCheckResult["warnings"][number] | null {
  if (subject.length > maxLen) {
    return {
      score: 2,
      warning: `Subject is ${subject.length} characters (max recommended: ${maxLen})`,
    };
  }
  return null;
}

/**
 * Check for hidden text (same color as background).
 */
function checkHiddenText(html: string): SpamCheckResult["warnings"][number] | null {
  const hiddenPatterns = [
    /color\s*:\s*(?:white|#fff|#ffffff)\s*;?\s*font-size\s*:\s*(?:0|1px)/i,
    /display\s*:\s*none/i,
    /visibility\s*:\s*hidden/i,
    /opacity\s*:\s*0/i,
  ];

  for (const pattern of hiddenPatterns) {
    if (pattern.test(html)) {
      return {
        score: 6,
        warning: "HTML contains hidden text (spam indicator)",
      };
    }
  }
  return null;
}

/**
 * Check text-to-HTML ratio.
 */
function checkTextToHtmlRatio(
  textBody: string,
  htmlBody: string,
  minRatio: number
): SpamCheckResult["warnings"][number] | null {
  const htmlTextLength = htmlBody.replace(/<[^>]*>/g, "").trim().length;

  if (textBody.length === 0 && htmlTextLength > 0) {
    return {
      score: 3,
      warning: "Missing plaintext version (always send multipart)",
    };
  }

  if (htmlTextLength === 0 && textBody.length === 0) {
    return {
      score: 10,
      warning: "Both HTML and text bodies are empty",
    };
  }

  return null;
}

/**
 * Run a comprehensive spam score check on an email.
 */
export function checkSpamScore(
  subject: string,
  htmlBody: string,
  textBody: string,
  config?: SpamCheckConfig
): SpamCheckResult {
  const cfg = { ...DEFAULT_SPAM_CONFIG, ...config };
  const warnings: Array<{ score: number; warning: string }> = [];

  // Check spam trigger words in subject + body
  const combinedText = `${subject} ${htmlBody.replace(/<[^>]*>/g, " ")} ${textBody}`;
  for (const [pattern, weight] of SPAM_TRIGGER_WORDS) {
    if (pattern.test(combinedText)) {
      warnings.push({
        score: Math.abs(weight),
        warning: `Spam trigger: "${pattern.source}"`,
      });
    }
  }

  // Subject checks
  const capsWarning = checkSubjectCaps(subject);
  if (capsWarning) warnings.push(capsWarning);

  const punctWarning = checkSubjectPunctuation(subject);
  if (punctWarning) warnings.push(punctWarning);

  const lenWarning = checkSubjectLength(subject, cfg.maxSubjectLength);
  if (lenWarning) warnings.push(lenWarning);

  // HTML checks
  const imgWarning = checkImageRatio(htmlBody, cfg.maxImageRatio);
  if (imgWarning) warnings.push(imgWarning);

  const linkWarning = checkLinks(htmlBody, cfg.maxLinkCount);
  if (linkWarning) warnings.push(linkWarning);

  const hiddenWarning = checkHiddenText(htmlBody);
  if (hiddenWarning) warnings.push(hiddenWarning);

  const ratioWarning = checkTextToHtmlRatio(
    textBody,
    htmlBody,
    cfg.minTextToHtmlRatio
  );
  if (ratioWarning) warnings.push(ratioWarning);

  // Calculate total score
  const totalScore = Math.min(
    100,
    warnings.reduce((sum, w) => sum + w.score, 0)
  );

  return {
    score: totalScore,
    warnings: warnings.map((w) => w.warning),
    passed: totalScore < 15, // Under 15 passes
  };
}

// ─────────────────────────────────────────────────────────────
// Unsubscribe Link Injection
// ─────────────────────────────────────────────────────────────

export const UNSUBSCRIBE_HTML = `
<div style="margin-top: 20px; padding-top: 10px; border-top: 1px solid #e0e0e0; font-size: 12px; color: #888;">
  <p>You received this email because you expressed interest in our services.
  If you'd prefer not to receive future emails, you can
  <a href="{{ unsubscribeUrl }}" style="color: #888;">unsubscribe here</a>.</p>
  <p>{{ companyAddress }}</p>
</div>`;

export const UNSUBSCRIBE_TEXT = `
---
You received this email because you expressed interest in our services.
To unsubscribe, visit: {{ unsubscribeUrl }}
{{ companyAddress }}`;

/**
 * Inject an unsubscribe link into the HTML body (before </body> or at the end).
 */
export function injectUnsubscribeHtml(
  html: string,
  unsubscribeUrl: string,
  companyAddress?: string
): string {
  const rendered = UNSUBSCRIBE_HTML.replace(
    "{{ unsubscribeUrl }}",
    unsubscribeUrl
  ).replace(
    "{{ companyAddress }}",
    companyAddress ?? ""
  );

  if (html.includes("</body>")) {
    return html.replace("</body>", `${rendered}</body>`);
  }

  return `${html}${rendered}`;
}

/**
 * Inject unsubscribe text into the plaintext body.
 */
export function injectUnsubscribeText(
  text: string,
  unsubscribeUrl: string,
  companyAddress?: string
): string {
  const rendered = UNSUBSCRIBE_TEXT.replace(
    "{{ unsubscribeUrl }}",
    unsubscribeUrl
  ).replace(
    "{{ companyAddress }}",
    companyAddress ?? ""
  );

  return `${text}\n${rendered}`;
}

// ─────────────────────────────────────────────────────────────
// Template Engine
// ─────────────────────────────────────────────────────────────

export interface TemplateEngineConfig {
  store: TemplateStore;
  /** Base URL for unsubscribe links (e.g., "https://app.example.com/unsubscribe") */
  unsubscribeBaseUrl?: string;
  /** Company address for CAN-SPAM compliance */
  companyAddress?: string;
  spamConfig?: SpamCheckConfig;
}

/**
 * Template engine manages email templates: storage, validation,
 * rendering with variable interpolation, spam checking, and
 * unsubscribe link injection.
 */
export class TemplateEngine {
  private config: TemplateEngineConfig;

  constructor(config: TemplateEngineConfig) {
    this.config = config;
  }

  /**
   * Create a new email template.
   */
  async createTemplate(template: Omit<EmailTemplate, "id" | "createdAt" | "updatedAt" | "version" | "spamScore">): Promise<EmailTemplate> {
    const now = new Date().toISOString();
    const newTemplate: EmailTemplate = {
      ...template,
      id: `tpl_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      version: 1,
      createdAt: now,
      updatedAt: now,
    };

    // Validate
    const parsed = EmailTemplateSchema.safeParse(newTemplate);
    if (!parsed.success) {
      throw new Error(
        `Template validation failed: ${parsed.error.issues.map((i) => i.message).join(", ")}`
      );
    }

    // Calculate initial spam score
    newTemplate.spamScore = checkSpamScore(
      newTemplate.subject,
      newTemplate.htmlBody,
      newTemplate.textBody,
      this.config.spamConfig
    ).score;

    return this.config.store.saveTemplate(newTemplate);
  }

  /**
   * Update an existing template.
   */
  async updateTemplate(
    id: string,
    updates: Partial<Pick<EmailTemplate, "name" | "subject" | "htmlBody" | "textBody" | "variables" | "category" | "metadata">>
  ): Promise<EmailTemplate> {
    const existing = await this.config.store.getTemplate(id);
    if (!existing) {
      throw new Error(`Template ${id} not found`);
    }

    const updated: EmailTemplate = {
      ...existing,
      ...updates,
      version: existing.version + 1,
      updatedAt: new Date().toISOString(),
    };

    // Recalculate spam score if content changed
    if (updates.subject || updates.htmlBody || updates.textBody) {
      updated.spamScore = checkSpamScore(
        updated.subject,
        updated.htmlBody,
        updated.textBody,
        this.config.spamConfig
      ).score;
    }

    const parsed = EmailTemplateSchema.safeParse(updated);
    if (!parsed.success) {
      throw new Error(
        `Template validation failed: ${parsed.error.issues.map((i) => i.message).join(", ")}`
      );
    }

    return this.config.store.saveTemplate(updated);
  }

  /**
   * Render a template with variable values and unsubscribe injection.
   */
  async render(
    templateId: string,
    values: Record<string, string | undefined>,
    options?: {
      prospectId?: string;
      enrollmentId?: string;
      skipUnsubscribe?: boolean;
    }
  ): Promise<TemplateRenderResult> {
    const template = await this.config.store.getTemplate(templateId);
    if (!template) {
      throw new Error(`Template ${templateId} not found`);
    }

    // Build variable map with defaults
    const defaults: Record<string, string> = {};
    for (const variable of template.variables) {
      if (variable.defaultValue) {
        defaults[variable.name] = variable.defaultValue;
      }
    }

    // Interpolate subject
    const subjectResult = interpolate(template.subject, values, defaults);

    // Interpolate HTML body
    let htmlResult = interpolate(template.htmlBody, values, defaults);

    // Interpolate text body
    let textResult = interpolate(template.textBody, values, defaults);

    // Inject unsubscribe if configured
    if (!options?.skipUnsubscribe && this.config.unsubscribeBaseUrl) {
      const enrollmentId = options?.enrollmentId ?? "unknown";
      const prospectId = options?.prospectId ?? "unknown";
      const unsubscribeUrl = `${this.config.unsubscribeBaseUrl}?prospect=${prospectId}&enrollment=${enrollmentId}`;

      htmlResult = {
        ...htmlResult,
        result: injectUnsubscribeHtml(
          htmlResult.result,
          unsubscribeUrl,
          this.config.companyAddress
        ),
      };

      textResult = {
        ...textResult,
        result: injectUnsubscribeText(
          textResult.result,
          unsubscribeUrl,
          this.config.companyAddress
        ),
      };
    }

    // Run spam check on rendered output
    const spamResult = checkSpamScore(
      subjectResult.result,
      htmlResult.result,
      textResult.result,
      this.config.spamConfig
    );

    return {
      subject: subjectResult.result,
      htmlBody: htmlResult.result,
      textBody: textResult.result,
      missingVariables: [
        ...new Set([
          ...subjectResult.missingVariables,
          ...htmlResult.missingVariables,
          ...textResult.missingVariables,
        ]),
      ],
      spamScore: spamResult.score,
      spamWarnings: spamResult.warnings,
    };
  }

  /**
   * Validate a template against its variable declarations.
   */
  validateTemplate(template: EmailTemplate): {
    valid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];

    // Schema validation
    const parsed = EmailTemplateSchema.safeParse(template);
    if (!parsed.success) {
      errors.push(
        ...parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`)
      );
    }

    // Check that declared variables exist in templates
    const subjectVars = new Set(extractVariables(template.subject));
    const htmlVars = new Set(extractVariables(template.htmlBody));
    const textVars = new Set(extractVariables(template.textBody));
    const allUsedVars = new Set([...subjectVars, ...htmlVars, ...textVars]);
    const declaredVars = new Set(template.variables.map((v) => v.name));

    for (const used of allUsedVars) {
      if (!declaredVars.has(used)) {
        errors.push(`Variable "{{ ${used} }}" is used but not declared`);
      }
    }

    for (const declared of declaredVars) {
      const variable = template.variables.find((v) => v.name === declared);
      if (variable?.required && !allUsedVars.has(declared) && !variable.defaultValue) {
        errors.push(
          `Required variable "${declared}" has no default and is not used in template`
        );
      }
    }

    return { valid: errors.length === 0, errors };
  }

  /**
   * Get a template by ID.
   */
  async getTemplate(id: string): Promise<EmailTemplate | null> {
    return this.config.store.getTemplate(id);
  }

  /**
   * List all templates, optionally filtered by category.
   */
  async listTemplates(category?: string): Promise<EmailTemplate[]> {
    return this.config.store.listTemplates(category);
  }

  /**
   * Delete a template.
   */
  async deleteTemplate(id: string): Promise<void> {
    return this.config.store.deleteTemplate(id);
  }
}

// ─────────────────────────────────────────────────────────────
// In-Memory Template Store (for testing/dev)
// ─────────────────────────────────────────────────────────────

export class InMemoryTemplateStore implements TemplateStore {
  private templates = new Map<string, EmailTemplate>();

  async getTemplate(id: string): Promise<EmailTemplate | null> {
    return this.templates.get(id) ?? null;
  }

  async listTemplates(category?: string): Promise<EmailTemplate[]> {
    const all = Array.from(this.templates.values());
    if (category) {
      return all.filter((t) => t.category === category);
    }
    return all;
  }

  async saveTemplate(template: EmailTemplate): Promise<EmailTemplate> {
    this.templates.set(template.id, template);
    return template;
  }

  async deleteTemplate(id: string): Promise<void> {
    this.templates.delete(id);
  }

  /** Seed some templates for testing. */
  seed(templates: EmailTemplate[]): void {
    for (const t of templates) {
      this.templates.set(t.id, t);
    }
  }

  /** Clear all templates. */
  clear(): void {
    this.templates.clear();
  }
}