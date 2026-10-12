// ─── Graph Factory ────────────────────────────────────────────────────────────
export { createSDRGraph } from "./graph.js";
export type { SDRGraphDependencies, LLMInvoker } from "./graph.js";

// ─── Agents ──────────────────────────────────────────────────────────────────
export { researcherAgent } from "./agents/researcher.js";
export { positioningReportAgent } from "./agents/positioning.js";
export { emailWriterAgent } from "./agents/email-writer.js";
export { linkedinWriterAgent } from "./agents/linkedin-writer.js";

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
} from "./state.js";

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
  AgentName,
} from "./state.js";

// ─── Tools ───────────────────────────────────────────────────────────────────
export {
  MockWebSearchProvider,
  createWebSearchTool,
} from "./tools/web-search.js";

export type { WebSearchProvider } from "./tools/web-search.js";