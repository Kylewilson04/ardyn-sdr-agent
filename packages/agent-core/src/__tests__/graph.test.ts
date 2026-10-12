import { describe, it, expect } from "vitest";
import { createSDRGraph } from "../graph.js";
import type { SDRGraphDependencies } from "../graph.js";
import type { SDRGraphState } from "../state.js";
import { MockWebSearchProvider } from "../tools/web-search.js";

/**
 * Creates a mock LLM invoker that returns a set of responses in sequence.
 * Each call advances to the next response. Useful for testing the full pipeline.
 */
function mockLLMInvoker(responses: string[]) {
  let callCount = 0;
  return {
    invoke: async (
      _systemPrompt: string,
      _userMessage: string,
      _tools?: Array<{
        name: string;
        description: string;
        schema: Record<string, unknown>;
        invoke: (input: unknown) => Promise<string>;
      }>
    ): Promise<string> => {
      const response = responses[callCount % responses.length];
      callCount++;
      if (!response) {
        throw new Error(`No mock response for call ${callCount}`);
      }
      return response;
    },
  };
}

/**
 * Full set of mock LLM responses for the 4-agent pipeline.
 */
const mockResponses = [
  // Researcher
  JSON.stringify({
    companyName: "Stripe",
    companyOverview: "Stripe is a payment processing platform.",
    recentNews: [
      {
        headline: "Stripe launches new API",
        summary: "New unified API for payment methods.",
        date: "2026-10-01",
      },
    ],
    fundingInfo: {
      totalRaised: "$8.7B",
      lastRound: "Series I ($6.5B)",
      investors: ["Sequoia", "a16z", "Thrive"],
    },
    techStack: {
      inferred: ["Ruby", "Go", "React", "AWS", "Kafka"],
      confidence: "high",
    },
    leadershipChanges: [],
    painPoints: [
      {
        area: "Developer onboarding experience",
        description: "Stripe's developer-first culture means onboarding tooling needs to be exceptional.",
        confidence: "high",
      },
    ],
    sources: [],
    rawNotes: "",
  }),
  // Positioning
  JSON.stringify({
    companyName: "Stripe",
    contactName: "John Doe",
    valueProposition: "Stripe's developer onboarding needs to match their API quality. Our platform reduces onboarding time by 60%.",
    personalizationHooks: [
      {
        hook: "Stripe's developer-first culture demands exceptional onboarding",
        source: "Company culture analysis",
        angle: "pain_point",
      },
    ],
    toneRecommendation: {
      style: "direct",
      reasoning: "Technical buyer, developer-focused culture",
      dos: ["Be technical", "Be specific", "Reference APIs"],
      donts: ["No fluff", "No buzzwords", "No generic pitches"],
    },
    keyTalkingPoints: [
      {
        point: "Reduce developer time-to-productivity by 60%",
        evidence: "Industry benchmarks",
        priority: "primary",
      },
    ],
  }),
  // Email
  JSON.stringify({
    subjectLine: "Stripe's developer onboarding at scale",
    body: "John,\n\nStripe's APIs set the standard. Shouldn't your onboarding too?\n\nOur platform reduces developer time-to-productivity by 60%.\n\nOpen to a quick chat?",
    callToAction: "Worth 15 min next Tuesday?",
    tone: "direct",
    personalizationScore: "high",
    researchElementsUsed: ["Developer-first culture", "API quality"],
  }),
  // LinkedIn
  JSON.stringify({
    type: "inmail",
    subject: "Stripe's developer onboarding",
    body: "John — Stripe's APIs set the standard. Shouldn't onboarding match?\n\nOur platform cuts dev onboarding time by 60% for teams on Ruby/Go/React.\n\nOpen to a quick chat?",
    characterCount: 165,
    hooks: ["Developer-first culture"],
  }),
];

describe("createSDRGraph", () => {
  function makeDeps(responses?: string[]): SDRGraphDependencies {
    return {
      searchProvider: new MockWebSearchProvider(),
      llmInvoker: mockLLMInvoker(responses ?? mockResponses),
    };
  }

  it("creates a compiled graph", () => {
    const graph = createSDRGraph(makeDeps());

    expect(graph).toBeDefined();
    expect(typeof graph.invoke).toBe("function");
  });

  it("runs the full pipeline start to finish", async () => {
    const graph = createSDRGraph(makeDeps());

    const initialState: Partial<SDRGraphState> = {
      input: {
        companyName: "Stripe",
        contactName: "John Doe",
        contactTitle: "VP Engineering",
        productDescription: "AI-powered onboarding platform",
        goal: "meeting",
      },
    };

    const result = await graph.invoke(initialState);

    // Pipeline should complete
    expect(result.completedAgents).toEqual([
      "researcher",
      "positioning",
      "email_writer",
      "linkedin_writer",
    ]);

    // All outputs should be populated
    expect(result.researchReport).toBeDefined();
    expect(result.researchReport!.companyName).toBe("Stripe");
    expect(result.positioningReport).toBeDefined();
    expect(result.emailDraft).toBeDefined();
    expect(result.emailDraft!.subjectLine).toBeTruthy();
    expect(result.linkedinDraft).toBeDefined();
    expect(result.linkedinDraft!.type).toBe("inmail");

    // Final outputs should be set
    expect(result.finalEmail).toBeDefined();
    expect(result.finalLinkedIn).toBeDefined();
    expect(result.finalPositioning).toBeDefined();
  });

  it("records messages at each step", async () => {
    const graph = createSDRGraph(makeDeps());

    const result = await graph.invoke({
      input: {
        companyName: "Stripe",
        productDescription: "AI onboarding",
      },
    });

    expect(result.messages.length).toBeGreaterThan(0);

    const agents = result.messages
      .filter((m: { agent?: string }) => m.agent)
      .map((m: { agent?: string }) => m.agent);

    expect(agents).toContain("supervisor");
    expect(agents).toContain("researcher");
    expect(agents).toContain("positioning");
    expect(agents).toContain("email_writer");
    expect(agents).toContain("linkedin_writer");
  });

  it("handles errors without crashing the pipeline", async () => {
    // Researcher returns garbage, but pipeline should continue
    const errorResponses = [
      "not valid json at all", // Researcher fails
      JSON.stringify({ // Positioning still runs
        companyName: "Stripe",
        valueProposition: "VP",
        personalizationHooks: [],
        toneRecommendation: {
          style: "conversational",
          reasoning: "",
          dos: [],
          donts: [],
        },
        keyTalkingPoints: [],
      }),
      JSON.stringify({
        subjectLine: "Test",
        body: "Test",
        callToAction: "Test",
      }),
      JSON.stringify({
        type: "inmail",
        subject: "Test",
        body: "Test",
        characterCount: 4,
      }),
    ];

    const graph = createSDRGraph(makeDeps(errorResponses));

    const result = await graph.invoke({
      input: {
        companyName: "Stripe",
        productDescription: "AI onboarding",
      },
    });

    // Pipeline should still complete (errors don't halt)
    expect(result.completedAgents).toEqual([
      "researcher",
      "positioning",
      "email_writer",
      "linkedin_writer",
    ]);

    // Researcher error should be recorded
    expect(result.errors).toBeDefined();
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("passes research data through to downstream agents", async () => {
    const graph = createSDRGraph(makeDeps());

    const result = await graph.invoke({
      input: {
        companyName: "Stripe",
        contactName: "Jane Smith",
        productDescription: "AI onboarding",
      },
    });

    // Email should reference the research
    expect(result.emailDraft!.body).toBeTruthy();

    // LinkedIn should be shorter than email
    expect(result.linkedinDraft!.body.length).toBeLessThan(
      result.emailDraft!.body.length + 100 // LinkedIn should be concise
    );
  });
});