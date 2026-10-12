import type {
  WebSearchResult,
  WebSearchInput,
} from "../state.js";

/**
 * Interface for web search providers.
 * Implement this to swap in real search (Brave, Tavily, SerpAPI, etc.).
 */
export interface WebSearchProvider {
  search(input: WebSearchInput): Promise<WebSearchResult[]>;
}

/**
 * Mock web search provider that returns realistic-looking results for SDR
 * research. Replace with a real provider in production.
 */
export class MockWebSearchProvider implements WebSearchProvider {
  private mockResults: Record<string, WebSearchResult[]> = {};

  constructor(seedResults?: Record<string, WebSearchResult[]>) {
    if (seedResults) {
      this.mockResults = seedResults;
    }
  }

  async search(input: WebSearchInput): Promise<WebSearchResult[]> {
    const { query, maxResults = 5 } = input;

    // Exact match first
    if (this.mockResults[query]) {
      return this.mockResults[query]!.slice(0, maxResults);
    }

    // Fuzzy fallback — generate placeholder results based on the query
    return this.generateFallbackResults(query, maxResults);
  }

  /**
   * Generate generic fallback results so the agent can still produce output
   * during development without a real search API key.
   *
   * In production, the agent prompt instructs the LLM to treat these as low-confidence
   * placeholders and flag gaps for the user to fill in.
   */
  private generateFallbackResults(
    query: string,
    maxResults: number
  ): WebSearchResult[] {
    const terms = query.split(/\s+/).slice(0, 4);
    const companyHint = terms[0] ?? query;
    const category = terms[1] ?? "company";

    const templates: WebSearchResult[] = [
      {
        title: `${companyHint} — About | LinkedIn`,
        url: `https://linkedin.com/company/${companyHint.toLowerCase().replace(/[^a-z0-9]/g, "-")}`,
        snippet: `${companyHint} is a ${category} company. [PLACEHOLDER: Real search data not available — verify manually]`,
        date: new Date().toISOString().split("T")[0],
      },
      {
        title: `${companyHint} — Crunchbase Profile`,
        url: `https://crunchbase.com/organization/${companyHint.toLowerCase().replace(/[^a-z0-9]/g, "-")}`,
        snippet: `${companyHint} — funding rounds, investors, and company details on Crunchbase. [PLACEHOLDER]`,
        date: new Date().toISOString().split("T")[0],
      },
      {
        title: `${companyHint} News & Press Releases`,
        url: `https://news.google.com/search?q=${encodeURIComponent(companyHint)}`,
        snippet: `Latest news about ${companyHint}. [PLACEHOLDER: Configure a real search API for live results]`,
        date: new Date().toISOString().split("T")[0],
      },
      {
        title: `${companyHint} — G2 Reviews & Ratings`,
        url: `https://g2.com/search?query=${encodeURIComponent(companyHint)}`,
        snippet: `User reviews and ratings for ${companyHint} products. [PLACEHOLDER]`,
        date: new Date().toISOString().split("T")[0],
      },
      {
        title: `${companyHint} Tech Stack — BuiltWith Profile`,
        url: `https://builtwith.com/${companyHint.toLowerCase().replace(/[^a-z0-9]/g, "-")}`,
        snippet: `Technology stack and web profile for ${companyHint}. [PLACEHOLDER]`,
        date: new Date().toISOString().split("T")[0],
      },
    ];

    return templates.slice(0, maxResults);
  }
}

/**
 * Factory: create a web search tool callable by LangChain agents.
 * Returns a function that matches the tool-calling interface used by the agent executors.
 */
export function createWebSearchTool(provider: WebSearchProvider) {
  return {
    name: "web_search",
    description:
      "Search the web for company information, news, funding, tech stack, and leadership changes. Use this to research a prospect before outreach.",
    schema: {
      type: "object" as const,
      properties: {
        query: {
          type: "string",
          description: "Search query string",
        },
        maxResults: {
          type: "number",
          description: "Maximum number of results to return (1-10)",
          default: 5,
        },
      },
      required: ["query"],
    },
    invoke: async (input: WebSearchInput): Promise<string> => {
      const results = await provider.search(input);
      return JSON.stringify(results, null, 2);
    },
  };
}