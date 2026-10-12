import { describe, it, expect } from "vitest";
import { positioningReportAgent } from "../agents/positioning";
import type { SDRGraphState } from "../state";

function makeState(overrides: Partial<SDRGraphState> = {}): SDRGraphState {
  return {
    input: {
      companyName: "Acme Corp",
      contactName: "John Doe",
      contactTitle: "VP of Engineering",
      productDescription: "AI-powered customer onboarding platform",
      goal: "meeting",
    },
    researchReport: {
      companyName: "Acme Corp",
      companyOverview:
        "Acme Corp is a SaaS company with 200 employees, growing rapidly after Series B.",
      recentNews: [
        {
          headline: "Acme raises $50M Series B",
          summary:
            "Funding round led by a16z to expand platform and hire 100 engineers.",
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
          description:
            "Rapid hiring post-Series B creates onboarding and tooling challenges.",
          confidence: "medium",
        },
        {
          area: "Customer onboarding friction",
          description:
            "Manual onboarding processes can't keep up with growth.",
          confidence: "high",
        },
      ],
      sources: [],
      rawNotes: "",
    },
    nextAgent: "positioning",
    completedAgents: ["researcher"],
    errors: [],
    messages: [],
    ...overrides,
  };
}

describe("positioningReportAgent", () => {
  it("produces a valid positioning report from research", async () => {
    const fakeLLM = async (): Promise<string> => {
      return JSON.stringify({
        companyName: "Acme Corp",
        contactName: "John Doe",
        valueProposition:
          "Acme's post-Series B engineering scale-up needs automated onboarding to keep pace with hiring. Our AI platform can reduce onboarding time by 60% and let their eng team focus on product, not process.",
        personalizationHooks: [
          {
            hook: "Congrats on the $50M Series B — that kind of hiring velocity means onboarding is either a competitive advantage or a bottleneck. Which is it for you right now?",
            source: "Crunchbase — Series B announcement",
            angle: "growth",
          },
          {
            hook: "Noticed your tech stack (React/Node/Postgres) — our platform has native integrations for all three, so there's no workflow disruption.",
            source: "Tech stack inference",
            angle: "tech",
          },
          {
            hook: "As VP Eng during a 2x headcount year, you're probably spending more time on onboarding processes than you'd like. We've seen exactly this pattern at similar-stage companies.",
            source: "Role + growth rate analysis",
            angle: "pain_point",
          },
        ],
        toneRecommendation: {
          style: "direct",
          reasoning:
            "VP of Engineering at a scaling startup — they value efficiency and specificity over fluff. Technical buyer who respects data.",
          dos: [
            "Be specific about metrics and outcomes",
            "Reference their actual tech stack",
            "Keep it tight — respect their time",
          ],
          donts: [
            "Don't use sales-speak or buzzwords",
            "Don't make claims without evidence",
            "Don't pretend to know their internal processes",
          ],
        },
        keyTalkingPoints: [
          {
            point: "Reduce new engineer time-to-productivity by 40-60%",
            evidence:
              "Companies at Acme's stage and stack typically see 40-60% reduction with automated onboarding",
            priority: "primary",
          },
          {
            point: "Scale onboarding without scaling the onboarding team",
            evidence:
              "Series B hiring plans (100 engineers) would require 3-4 FTE onboarding specialists manually",
            priority: "primary",
          },
          {
            point: "Native integrations with existing stack (React/Node/Postgres/AWS)",
            evidence: "Tech stack analysis shows full compatibility",
            priority: "secondary",
          },
          {
            point: "a16z portfolio companies using similar platforms",
            evidence: "a16z invested in Acme; social proof leverage",
            priority: "secondary",
          },
        ],
        competitiveContext:
          "Acme may be evaluating internal build-vs-buy for onboarding. Position as buy-to-accelerate rather than replace existing processes.",
      });
    };

    const state = makeState();
    const result = await positioningReportAgent(state, fakeLLM);

    expect(result.positioningReport).toBeDefined();
    expect(result.positioningReport!.valueProposition).toContain("Series B");
    expect(result.positioningReport!.personalizationHooks).toHaveLength(3);
    expect(result.positioningReport!.toneRecommendation.style).toBe("direct");
    expect(result.positioningReport!.keyTalkingPoints).toHaveLength(4);

    // Check priority filtering — primary points go to email
    const primaryPoints = result.positioningReport!.keyTalkingPoints.filter(
      (p) => p.priority === "primary"
    );
    expect(primaryPoints).toHaveLength(2);
  });

  it("handles missing research report gracefully", async () => {
    const fakeLLM = async (): Promise<string> => {
      return JSON.stringify({
        companyName: "Unknown",
        valueProposition: "Limited data available",
        personalizationHooks: [],
        toneRecommendation: {
          style: "conversational",
          reasoning: "Default without research",
          dos: ["Be general"],
          donts: ["Don't fabricate"],
        },
        keyTalkingPoints: [],
      });
    };

    const state = makeState({ researchReport: undefined });
    const result = await positioningReportAgent(state, fakeLLM);

    expect(result.positioningReport).toBeDefined();
    expect(result.positioningReport!.personalizationHooks).toHaveLength(0);
  });

  it("records parse errors", async () => {
    const fakeLLM = async () => "not json";

    const state = makeState();
    const result = await positioningReportAgent(state, fakeLLM);

    expect(result.errors).toBeDefined();
    expect(result.errors![0]).toContain("Positioning parse error");
  });
});