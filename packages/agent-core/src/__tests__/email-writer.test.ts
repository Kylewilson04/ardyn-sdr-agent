import { describe, it, expect } from "vitest";
import { emailWriterAgent } from "../agents/email-writer";
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
    positioningReport: {
      companyName: "Acme Corp",
      contactName: "John Doe",
      valueProposition:
        "Acme's post-Series B engineering scale-up needs automated onboarding. Our AI platform reduces onboarding time by 60%.",
      personalizationHooks: [
        {
          hook: "Congrats on the $50M Series B — onboarding at that scale is either a competitive advantage or a bottleneck.",
          source: "Crunchbase",
          angle: "growth",
        },
        {
          hook: "Native integrations with React/Node/Postgres — no workflow disruption.",
          source: "Tech stack analysis",
          angle: "tech",
        },
      ],
      toneRecommendation: {
        style: "direct",
        reasoning: "Technical buyer, values efficiency",
        dos: ["Be specific", "Use metrics", "Keep it tight"],
        donts: ["No buzzwords", "No fluff", "No long paragraphs"],
      },
      keyTalkingPoints: [
        {
          point: "Reduce new engineer time-to-productivity by 40-60%",
          evidence: "Similar-stage companies see 40-60% reduction",
          priority: "primary",
        },
        {
          point: "Scale onboarding without scaling the team",
          evidence: "100 engineers planned would need 3-4 FTE manually",
          priority: "primary",
        },
        {
          point: "Native integrations with existing stack",
          evidence: "React/Node/Postgres/AWS compatibility",
          priority: "secondary",
        },
      ],
    },
    nextAgent: "email_writer",
    completedAgents: ["researcher", "positioning"],
    errors: [],
    messages: [],
    ...overrides,
  };
}

describe("emailWriterAgent", () => {
  it("produces a structured email from positioning brief", async () => {
    const fakeLLM = async (): Promise<string> => {
      return JSON.stringify({
        subjectLine: "Your Series B and onboarding at 100 engineers",
        body:
          "John,\n\n" +
          "Congrats on the $50M Series B — that kind of growth puts a spotlight on every part of the engineering org, especially onboarding.\n\n" +
          "At the pace you're hiring (100 engineers planned), manual onboarding creates a linear cost that compounds every month. Companies at your stage using automated onboarding see new engineers hit full productivity 40-60% faster — which translates to weeks of saved engineering time per hire.\n\n" +
          "We built an AI onboarding platform that integrates natively with React, Node, and Postgres — no workflow disruption, no new tools to learn. The teams we work with go from 'welcome email' to 'first PR merged' in under 3 days.\n\n" +
          "Worth 15 minutes to see if the fit makes sense? I can do Tuesday after 2pm or Thursday morning.",
        callToAction: "Worth 15 minutes? Tuesday after 2pm or Thursday morning work.",
        tone: "direct",
        personalizationScore: "high",
        researchElementsUsed: [
          "Series B funding news",
          "100 engineer hiring plan",
          "Tech stack: React/Node/Postgres",
          "VP Eng role context",
        ],
      });
    };

    const state = makeState();
    const result = await emailWriterAgent(state, fakeLLM);

    expect(result.emailDraft).toBeDefined();
    expect(result.emailDraft!.subjectLine).toBeTruthy();
    expect(result.emailDraft!.subjectLine.length).toBeLessThanOrEqual(60);
    expect(result.emailDraft!.body).toContain("John");
    expect(result.emailDraft!.callToAction).toBeTruthy();
    expect(result.emailDraft!.personalizationScore).toBe("high");
  });

  it("parses markdown-fenced JSON", async () => {
    const fakeLLM = async () => {
      return "```json\n" + JSON.stringify({
        subjectLine: "Quick question about Acme's onboarding",
        body: "Hi John,\n\nTesting.\n\nBest",
        callToAction: "Open to a quick call?",
      }) + "\n```";
    };

    const state = makeState();
    const result = await emailWriterAgent(state, fakeLLM);

    expect(result.emailDraft).toBeDefined();
    expect(result.emailDraft!.subjectLine).toBe("Quick question about Acme's onboarding");
  });

  it("records parse errors for invalid JSON", async () => {
    const fakeLLM = async () => "here is a beautifully crafted email but not json";

    const state = makeState();
    const result = await emailWriterAgent(state, fakeLLM);

    expect(result.errors).toBeDefined();
    expect(result.errors![0]).toContain("Email writer parse error");
  });

  it("references personalizationScore as an enum value", async () => {
    // Test that the output validates the personalizationScore enum
    const fakeLLM = async () => {
      return JSON.stringify({
        subjectLine: "Test",
        body: "Test body",
        callToAction: "Test CTA",
        personalizationScore: "medium",
      });
    };

    const state = makeState();
    const result = await emailWriterAgent(state, fakeLLM);

    expect(result.emailDraft!.personalizationScore).toBe("medium");
  });
});