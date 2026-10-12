import { describe, it, expect } from "vitest";
import { researcherAgent } from "../agents/researcher";
import type { SDRGraphState } from "../state";
import { MockWebSearchProvider } from "../tools/web-search";

/**
 * Creates a minimal valid state for testing the researcher.
 */
function makeState(overrides: Partial<SDRGraphState> = {}): SDRGraphState {
  return {
    input: {
      companyName: "Acme Corp",
      contactName: "John Doe",
      contactTitle: "VP of Engineering",
      industry: "SaaS",
      productDescription: "AI-powered customer onboarding platform",
      goal: "meeting",
      additionalContext: "",
    },
    nextAgent: "researcher",
    completedAgents: [],
    errors: [],
    messages: [],
    ...overrides,
  };
}

describe("researcherAgent", () => {
  it("parses valid JSON response and returns research report", async () => {
    const searchProvider = new MockWebSearchProvider();

    const fakeLLM = async (
      _systemPrompt: string,
      _userMessage: string,
      _tools?: Array<{
        name: string;
        description: string;
        schema: Record<string, unknown>;
        invoke: (input: unknown) => Promise<string>;
      }>
    ): Promise<string> => {
      // Return a valid research report as if the LLM produced it
      return JSON.stringify({
        companyName: "Acme Corp",
        contactName: "John Doe",
        companyOverview: "Acme Corp is a SaaS company specializing in widgets.",
        recentNews: [
          {
            headline: "Acme raises $50M Series B",
            summary: "Funding to expand platform capabilities.",
            date: "2026-09-15",
          },
        ],
        fundingInfo: {
          totalRaised: "$75M",
          lastRound: "Series B ($50M)",
          investors: ["a16z", "Sequoia"],
        },
        techStack: {
          inferred: ["React", "Node.js", "PostgreSQL", "AWS"],
          confidence: "medium",
        },
        leadershipChanges: [],
        painPoints: [
          {
            area: "Scaling engineering team",
            description: "Rapid hiring post-Series B suggests onboarding and tooling challenges.",
            confidence: "medium",
          },
        ],
        sources: [
          {
            title: "Acme Crunchbase",
            url: "https://crunchbase.com/acme",
            snippet: "Funding data",
          },
        ],
        rawNotes: "",
      });
    };

    const state = makeState();
    const result = await researcherAgent(state, searchProvider, fakeLLM);

    expect(result.researchReport).toBeDefined();
    expect(result.researchReport!.companyName).toBe("Acme Corp");
    expect(result.researchReport!.painPoints).toHaveLength(1);
    expect(result.researchReport!.fundingInfo?.totalRaised).toBe("$75M");
  });

  it("handles markdown-fenced JSON response", async () => {
    const searchProvider = new MockWebSearchProvider();

    const fakeLLM = async () => {
      return "```json\n" + JSON.stringify({
        companyName: "Acme Corp",
        companyOverview: "Overview text.",
        recentNews: [],
        painPoints: [],
      }) + "\n```";
    };

    const state = makeState();
    const result = await researcherAgent(state, searchProvider, fakeLLM);

    expect(result.researchReport).toBeDefined();
    expect(result.researchReport!.companyName).toBe("Acme Corp");
  });

  it("handles JSON embedded in text response", async () => {
    const searchProvider = new MockWebSearchProvider();

    const fakeLLM = async () => {
      return "Here is the research report:\n\n" + JSON.stringify({
        companyName: "Acme Corp",
        companyOverview: "Overview text.",
        recentNews: [],
        painPoints: [{ area: "Growth", description: "Scaling pain", confidence: "high" }],
      }) + "\n\nLet me know if you need anything else.";
    };

    const state = makeState();
    const result = await researcherAgent(state, searchProvider, fakeLLM);

    expect(result.researchReport).toBeDefined();
    expect(result.researchReport!.painPoints).toHaveLength(1);
  });

  it("records parse errors when JSON is invalid", async () => {
    const searchProvider = new MockWebSearchProvider();

    const fakeLLM = async () => "not json at all, just rambling";

    const state = makeState();
    const result = await researcherAgent(state, searchProvider, fakeLLM);

    expect(result.errors).toBeDefined();
    expect(result.errors![0]).toContain("Researcher parse error");
    expect(result.researchReport).toBeUndefined();
  });

  it("includes the LLM response in messages", async () => {
    const searchProvider = new MockWebSearchProvider();

    const fakeLLM = async () => JSON.stringify({
      companyName: "Acme Corp",
      companyOverview: "Text.",
      recentNews: [],
      painPoints: [],
    });

    const state = makeState();
    const result = await researcherAgent(state, searchProvider, fakeLLM);

    expect(result.messages).toBeDefined();
    const addedMessages = result.messages!.slice(state.messages!.length);
    expect(addedMessages).toHaveLength(1);
    expect(addedMessages[0]!.agent).toBe("researcher");
  });
});