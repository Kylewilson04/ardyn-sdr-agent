import { z } from "zod";

// ─── Input Schemas ───────────────────────────────────────────────────────────

export const SDRInputSchema = z.object({
  companyName: z.string().min(1, "Company name is required"),
  contactName: z.string().optional().default(""),
  contactTitle: z.string().optional().default(""),
  industry: z.string().optional().default(""),
  productDescription: z.string().min(1, "Product description is required"),
  goal: z
    .enum(["meeting", "demo", "call", "intro"])
    .optional()
    .default("meeting"),
  additionalContext: z.string().optional().default(""),
});

export type SDRInput = z.infer<typeof SDRInputSchema>;

// ─── Research Output ─────────────────────────────────────────────────────────

export const ResearchSourceSchema = z.object({
  title: z.string(),
  url: z.string(),
  snippet: z.string(),
  date: z.string().optional(),
});

export const ResearchReportSchema = z.object({
  companyName: z.string(),
  contactName: z.string().optional(),
  companyOverview: z.string(),
  recentNews: z.array(
    z.object({
      headline: z.string(),
      summary: z.string(),
      date: z.string().optional(),
      source: ResearchSourceSchema.optional(),
    })
  ),
  fundingInfo: z
    .object({
      totalRaised: z.string().optional(),
      lastRound: z.string().optional(),
      investors: z.array(z.string()).optional(),
    })
    .optional(),
  techStack: z
    .object({
      inferred: z.array(z.string()),
      confidence: z.enum(["high", "medium", "low"]).optional(),
    })
    .optional(),
  leadershipChanges: z
    .array(
      z.object({
        person: z.string(),
        role: z.string(),
        change: z.string(),
        date: z.string().optional(),
      })
    )
    .optional(),
  painPoints: z.array(
    z.object({
      area: z.string(),
      description: z.string(),
      confidence: z.enum(["high", "medium", "low"]).optional(),
    })
  ),
  sources: z.array(ResearchSourceSchema).optional(),
  rawNotes: z.string().optional(),
});

export type ResearchReport = z.infer<typeof ResearchReportSchema>;

// ─── Positioning Output ──────────────────────────────────────────────────────

export const PositioningReportSchema = z.object({
  companyName: z.string(),
  contactName: z.string().optional(),
  valueProposition: z.string(),
  personalizationHooks: z.array(
    z.object({
      hook: z.string(),
      source: z.string(),
      angle: z.enum([
        "news",
        "growth",
        "tech",
        "leadership",
        "pain_point",
        "role",
        "industry",
      ]),
    })
  ),
  toneRecommendation: z.object({
    style: z.enum(["formal", "conversational", "direct", "insightful"]),
    reasoning: z.string(),
    dos: z.array(z.string()),
    donts: z.array(z.string()),
  }),
  keyTalkingPoints: z.array(
    z.object({
      point: z.string(),
      evidence: z.string(),
      priority: z.enum(["primary", "secondary"]),
    })
  ),
  competitiveContext: z.string().optional(),
});

export type PositioningReport = z.infer<typeof PositioningReportSchema>;

// ─── Email Output ────────────────────────────────────────────────────────────

export const EmailOutputSchema = z.object({
  subjectLine: z.string(),
  body: z.string(),
  callToAction: z.string(),
  tone: z.string().optional(),
  personalizationScore: z.enum(["high", "medium", "low"]).optional(),
  researchElementsUsed: z.array(z.string()).optional(),
});

export type EmailOutput = z.infer<typeof EmailOutputSchema>;

// ─── LinkedIn Output ─────────────────────────────────────────────────────────

export const LinkedInOutputSchema = z.object({
  type: z.enum(["inmail", "connection_request", "message"]),
  subject: z.string().optional(),
  body: z.string(),
  characterCount: z.number(),
  hooks: z.array(z.string()).optional(),
});

export type LinkedInOutput = z.infer<typeof LinkedInOutputSchema>;

// ─── Agent Identities ────────────────────────────────────────────────────────

export const AgentName = z.enum([
  "supervisor",
  "researcher",
  "positioning",
  "email_writer",
  "linkedin_writer",
]);

export type AgentName = z.infer<typeof AgentName>;

// ─── Graph State ─────────────────────────────────────────────────────────────

export const SDRGraphStateSchema = z.object({
  // Input
  input: SDRInputSchema,

  // Agent outputs — each set when its agent completes
  researchReport: ResearchReportSchema.optional(),
  positioningReport: PositioningReportSchema.optional(),
  emailDraft: EmailOutputSchema.optional(),
  linkedinDraft: LinkedInOutputSchema.optional(),

  // Supervisor routing
  nextAgent: AgentName.optional().default("researcher"),
  completedAgents: z.array(AgentName).optional().default([]),
  errors: z.array(z.string()).optional().default([]),

  // Conversation history for checkpointing
  messages: z.array(
    z.object({
      role: z.enum(["system", "user", "assistant", "tool"]),
      content: z.string(),
      agent: AgentName.optional(),
    })
  ).optional().default([]),

  // Final outputs
  finalEmail: EmailOutputSchema.optional(),
  finalLinkedIn: LinkedInOutputSchema.optional(),
  finalPositioning: PositioningReportSchema.optional(),
});

export type SDRGraphState = z.infer<typeof SDRGraphStateSchema>;

// ─── Tool Schemas ────────────────────────────────────────────────────────────

export const WebSearchResultSchema = z.object({
  title: z.string(),
  url: z.string(),
  snippet: z.string(),
  date: z.string().optional(),
});

export type WebSearchResult = z.infer<typeof WebSearchResultSchema>;

export const WebSearchInputSchema = z.object({
  query: z.string().min(1),
  maxResults: z.number().min(1).max(10).optional().default(5),
});

export type WebSearchInput = z.infer<typeof WebSearchInputSchema>;