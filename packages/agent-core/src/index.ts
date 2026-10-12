// ─── Graph Factory ────────────────────────────────────────────────────────────
export { createSDRGraph } from "./graph";
export type { SDRGraphDependencies, LLMInvoker } from "./graph";

// ─── Agents ──────────────────────────────────────────────────────────────────
export { researcherAgent } from "./agents/researcher";
export { positioningReportAgent } from "./agents/positioning";
export { emailWriterAgent } from "./agents/email-writer";
export { linkedinWriterAgent } from "./agents/linkedin-writer";

// ─── State & Schemas ─────────────────────────────────────────────────────────
export {
  SDRInputSchema,
  ResearchReportSchema,
  PositioningReportSchema,
  EmailOutputSchema,
  LinkedInOutputSchema,
  SDRGraphStateSchema,
  WebSearchInputSchema,
  WebSearchResultSchema,
  AgentName,
} from "./state";

export type {
  SDRInput,
  ResearchReport,
  PositioningReport,
  EmailOutput,
  LinkedInOutput,
  SDRGraphState,
  ResearchSourceSchema,
  WebSearchResult,
  WebSearchInput,
} from "./state";

// AgentName is both a Zod schema (value) and a type — the value export above covers both

// ─── Tools ───────────────────────────────────────────────────────────────────
export {
  MockWebSearchProvider,
  createWebSearchTool,
} from "./tools/web-search";

export type { WebSearchProvider } from "./tools/web-search";