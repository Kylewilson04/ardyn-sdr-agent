import type { SDRGraphState, SDRInput } from "../state.js";
import type { WebSearchProvider } from "../tools/web-search.js";

/**
 * ResearcherPrompt builds the system prompt for the Researcher agent.
 * It bakes the input context into a structured instruction set.
 */
function researcherSystemPrompt(input: SDRInput): string {
  return `You are an expert SDR researcher. Your job is to gather actionable intelligence 
about a target company and contact for outbound sales outreach.

## Company
- **Name:** ${input.companyName}
${input.contactName ? `- **Contact:** ${input.contactName}` : ""}
${input.contactTitle ? `- **Title:** ${input.contactTitle}` : ""}
${input.industry ? `- **Industry:** ${input.industry}` : ""}
- **Our Product:** ${input.productDescription}
${input.additionalContext ? `- **Additional Context:** ${input.additionalContext}` : ""}

## Research Instructions

Use the web_search tool to find the following. Run multiple searches; be thorough.

1. **Company Overview** — What they do, size, market position, recent trajectory (1-2 paragraphs).

2. **Recent News** (last 6 months) — Product launches, partnerships, expansions, earnings, press mentions. Find at least 3 items if possible.

3. **Funding Information** — Total raised, last round amount/date, key investors. If a public company, note market cap or stock ticker instead.

4. **Tech Stack** — What tools and platforms they use (infer from job postings, engineering blogs, BuiltWith, StackShare). List specific tools.

5. **Leadership Changes** — New hires, promotions, departures in the last 12 months, especially in roles related to your product's domain.

6. **Pain Points** — Based on industry, size, news, and role of the contact, infer likely challenges where your product could help. Look for signals: rapid hiring (onboarding pain), new CRO (pipeline pressure), recent funding (growth pain), legacy tech mentions (modernization need).

## Output Format
Return a JSON object matching this exact structure. No markdown fences, just raw JSON.

{
  "companyName": "${input.companyName}",
  "contactName": "${input.contactName || ""}",
  "companyOverview": "string",
  "recentNews": [
    {"headline": "string", "summary": "string", "date": "string or null", "source": {"title": "string", "url": "string", "snippet": "string"} or null}
  ],
  "fundingInfo": {"totalRaised": "string", "lastRound": "string", "investors": ["string"]} or null,
  "techStack": {"inferred": ["string"], "confidence": "high|medium|low"} or null,
  "leadershipChanges": [{"person": "string", "role": "string", "change": "string", "date": "string or null"}] or [],
  "painPoints": [{"area": "string", "description": "string", "confidence": "high|medium|low"}],
  "sources": [{"title": "string", "url": "string", "snippet": "string", "date": "string or null"}],
  "rawNotes": "any additional context or caveats"
}

If you cannot find information for a field, use an empty array [] or null as appropriate.
Mark low-confidence inferences with confidence: "low" and note it in rawNotes.
NEVER fabricate. If the mock search returns [PLACEHOLDER] data, flag it in rawNotes
and set confidence to "low" on affected fields.`;
}

/**
 * Parses the LLM response string into a ResearchReport.
 * Handles common LLM output quirks (markdown fences, trailing commas, etc.).
 */
function parseResearchResponse(raw: string): Record<string, unknown> {
  // Strip markdown code fences if present
  let cleaned = raw.trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  }

  try {
    return JSON.parse(cleaned) as Record<string, unknown>;
  } catch {
    // Attempt to extract JSON from text
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (match) {
      return JSON.parse(match[0]) as Record<string, unknown>;
    }
    throw new Error("Researcher did not produce valid JSON output");
  }
}

/**
 * ResearcherAgent — gathers intelligence about a target company and contact.
 *
 * @param state - Current graph state
 * @param searchProvider - Injected web search provider
 * @param invokeLLM - Function to call the LLM with messages. Injected so the
 *   agent doesn't couple to a specific model provider. Signature:
 *   (systemPrompt: string, userMessage: string, tools?: Tool[]) => Promise<string>
 * @returns Partial graph state update with researchReport set
 */
export async function researcherAgent(
  state: SDRGraphState,
  searchProvider: WebSearchProvider,
  invokeLLM: (
    systemPrompt: string,
    userMessage: string,
    tools?: Array<{
      name: string;
      description: string;
      schema: Record<string, unknown>;
      invoke: (input: unknown) => Promise<string>;
    }>
  ) => Promise<string>
): Promise<Partial<SDRGraphState>> {
  const { input, messages = [] } = state;
  const systemPrompt = researcherSystemPrompt(input);

  const searchTool = {
    name: "web_search",
    description:
      "Search the web for company information, news, funding, tech stack, and leadership changes.",
    schema: {
      type: "object" as const,
      properties: {
        query: { type: "string", description: "Search query" },
        maxResults: {
          type: "number",
          description: "Max results (1-10)",
          default: 5,
        },
      },
      required: ["query"],
    },
    invoke: async (toolInput: unknown) => {
      const typed = toolInput as { query: string; maxResults?: number };
      const results = await searchProvider.search({
        query: typed.query,
        maxResults: typed.maxResults ?? 5,
      });
      return JSON.stringify(results, null, 2);
    },
  };

  const userMessage = `Research ${input.companyName}${input.contactName ? ` and ${input.contactName}` : ""}. 
Use web_search multiple times to gather all required information. 
Search for:
1. "${input.companyName} company overview"
2. "${input.companyName} recent news funding"
3. "${input.companyName} tech stack"
4. "${input.companyName} leadership changes ${new Date().getFullYear()}"
5. "${input.companyName} challenges pain points"

After gathering all data, output the final structured JSON research report.`;

  const rawResponse = await invokeLLM(systemPrompt, userMessage, [searchTool]);

  try {
    const parsed = parseResearchResponse(rawResponse);
    const researchReport = {
      companyName: (parsed.companyName as string) || input.companyName,
      contactName: (parsed.contactName as string) || input.contactName || "",
      companyOverview:
        (parsed.companyOverview as string) ||
        `${input.companyName} — research inconclusive. [Data gap: configure a real search API]`,
      recentNews: (parsed.recentNews as ResearchNewsItem[]) || [],
      fundingInfo: parsed.fundingInfo as FundingInfo | undefined,
      techStack: parsed.techStack as TechStack | undefined,
      leadershipChanges:
        (parsed.leadershipChanges as LeadershipChange[]) || [],
      painPoints: (parsed.painPoints as PainPoint[]) || [],
      sources: (parsed.sources as Source[]) || [],
      rawNotes: (parsed.rawNotes as string) || "",
    };

    return {
      researchReport,
      messages: [
        ...messages,
        { role: "assistant" as const, content: rawResponse, agent: "researcher" as const },
      ],
    };
  } catch (err) {
    return {
      errors: [
        ...(state.errors || []),
        `Researcher parse error: ${err instanceof Error ? err.message : String(err)}`,
      ],
      messages: [
        ...messages,
        {
          role: "assistant" as const,
          content: rawResponse,
          agent: "researcher" as const,
        },
      ],
    };
  }
}

// Local types for parsing
interface ResearchNewsItem {
  headline: string;
  summary: string;
  date?: string;
  source?: Source;
}

interface FundingInfo {
  totalRaised?: string;
  lastRound?: string;
  investors?: string[];
}

interface TechStack {
  inferred: string[];
  confidence?: "high" | "medium" | "low";
}

interface LeadershipChange {
  person: string;
  role: string;
  change: string;
  date?: string;
}

interface PainPoint {
  area: string;
  description: string;
  confidence?: "high" | "medium" | "low";
}

interface Source {
  title: string;
  url: string;
  snippet: string;
  date?: string;
}