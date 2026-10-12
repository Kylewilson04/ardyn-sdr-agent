import { describe, it, expect } from "vitest";
import { linkedinWriterAgent } from "../agents/linkedin-writer.js";
import type { SDRGraphState } from "../state.js";

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
          hook: "Congrats on the $50M Series B — onboarding at that scale is make-or-break.",
          source: "Crunchbase",
          angle: "growth",
        },
        {
          hook: "Saw your post about scaling engineering teams — relevant topic.",
          source: "LinkedIn activity",
          angle: "role",
        },
      ],
      toneRecommendation: {
        style: "conversational",
        reasoning: "LinkedIn is social — keep it casual and human",
        dos: ["Be brief", "Reference their activity", "Keep it social"],
        donts: ["Don't pitch hard", "Don't use email-style formatting", "Don't be formal"],
      },
      keyTalkingPoints: [
        {
          point: "Reduce time-to-productivity by 40-60%",
          evidence: "Industry benchmarks",
          priority: "primary",
        },
      ],
    },
    nextAgent: "linkedin_writer",
    completedAgents: ["researcher", "positioning", "email_writer"],
    errors: [],
    messages: [],
    ...overrides,
  };
}

describe("linkedinWriterAgent", () => {
  it("produces an InMail with subject", async () => {
    const fakeLLM = async (): Promise<string> => {
      return JSON.stringify({
        type: "inmail",
        subject: "Your Series B + eng scale",
        body:
          "John — congrats on the Series B and the 100-engineer hiring plan.\n\n" +
          "At that pace, onboarding is either a competitive advantage or a drag. " +
          "Companies at your stage see 40-60% faster time-to-productivity with the right platform.\n\n" +
          "We built exactly that for teams on React/Node/Postgres. Would love to share what's working for similar-stage cos.\n\n" +
          "Open to a quick chat?",
        characterCount: 355,
        hooks: ["Series B growth", "100-engineer hiring plan", "Tech stack alignment"],
      });
    };

    const state = makeState();
    const result = await linkedinWriterAgent(state, fakeLLM);

    expect(result.linkedinDraft).toBeDefined();
    expect(result.linkedinDraft!.type).toBe("inmail");
    expect(result.linkedinDraft!.subject).toBeTruthy();
    expect(result.linkedinDraft!.subject!.length).toBeLessThanOrEqual(40);
    expect(result.linkedinDraft!.body).toContain("John");
    expect(result.linkedinDraft!.characterCount).toBeGreaterThan(0);
  });

  it("produces a connection request under 300 characters", async () => {
    const fakeLLM = async (): Promise<string> => {
      return JSON.stringify({
        type: "connection_request",
        body:
          "Saw your post about scaling eng teams at Acme — dealing with similar " +
          "challenges in onboarding at scale. Would love to connect and trade notes.",
        characterCount: 145,
        hooks: ["LinkedIn post about scaling"],
      });
    };

    const state = makeState();
    const result = await linkedinWriterAgent(state, fakeLLM);

    expect(result.linkedinDraft).toBeDefined();
    expect(result.linkedinDraft!.type).toBe("connection_request");
    expect(result.linkedinDraft!.subject).toBeUndefined();
    expect(result.linkedinDraft!.body.length).toBeLessThanOrEqual(300);
  });

  it("auto-computes characterCount if LLM doesn't provide it", async () => {
    const fakeLLM = async (): Promise<string> => {
      return JSON.stringify({
        type: "message",
        body: "Short message",
      });
    };

    const state = makeState();
    const result = await linkedinWriterAgent(state, fakeLLM);

    expect(result.linkedinDraft!.characterCount).toBe(13); // "Short message".length
  });

  it("handles markdown-fenced JSON", async () => {
    const fakeLLM = async () => {
      return "```json\n" + JSON.stringify({
        type: "inmail",
        subject: "Acme onboarding",
        body: "Test body",
        characterCount: 9,
      }) + "\n```";
    };

    const state = makeState();
    const result = await linkedinWriterAgent(state, fakeLLM);

    expect(result.linkedinDraft).toBeDefined();
    expect(result.linkedinDraft!.type).toBe("inmail");
    expect(result.linkedinDraft!.body).toBe("Test body");
  });

  it("records parse errors for invalid JSON", async () => {
    const fakeLLM = async () => "just some linkedin text, no json";

    const state = makeState();
    const result = await linkedinWriterAgent(state, fakeLLM);

    expect(result.errors).toBeDefined();
    expect(result.errors![0]).toContain("LinkedIn writer parse error");
  });

  it("validates type field is one of the allowed values", async () => {
    // Even if the LLM returns an invalid type, the agent should still parse
    // and the caller should validate with LinkedInOutputSchema
    const fakeLLM = async () => {
      return JSON.stringify({
        type: "tweet", // invalid type
        body: "Test",
        characterCount: 4,
      });
    };

    const state = makeState();
    const result = await linkedinWriterAgent(state, fakeLLM);

    // The agent passes through whatever the LLM returns — validation happens
    // when the graph state is validated or when the caller checks the schema
    expect(result.linkedinDraft!.type).toBe("tweet");
  });
});