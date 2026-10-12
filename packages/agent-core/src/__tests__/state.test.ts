import { describe, it, expect } from "vitest";
import {
  SDRInputSchema,
  ResearchReportSchema,
  PositioningReportSchema,
  EmailOutputSchema,
  LinkedInOutputSchema,
  SDRGraphStateSchema,
  AgentName,
} from "../state";

describe("SDRInputSchema", () => {
  it("accepts valid minimal input", () => {
    const result = SDRInputSchema.safeParse({
      companyName: "Stripe",
      productDescription: "AI-powered onboarding platform",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.companyName).toBe("Stripe");
      expect(result.data.goal).toBe("meeting"); // default
      expect(result.data.contactName).toBe(""); // default
    }
  });

  it("accepts full input with all fields", () => {
    const result = SDRInputSchema.safeParse({
      companyName: "Vercel",
      contactName: "Jane Smith",
      contactTitle: "VP Engineering",
      industry: "Developer Tools",
      productDescription: "Edge compute platform",
      goal: "demo",
      additionalContext: "Recently raised Series C",
    });

    expect(result.success).toBe(true);
  });

  it("rejects empty company name", () => {
    const result = SDRInputSchema.safeParse({
      companyName: "",
      productDescription: "Something",
    });

    expect(result.success).toBe(false);
  });

  it("rejects invalid goal", () => {
    const result = SDRInputSchema.safeParse({
      companyName: "A",
      productDescription: "B",
      goal: "hire_me",
    });

    expect(result.success).toBe(false);
  });
});

describe("ResearchReportSchema", () => {
  it("accepts valid research report", () => {
    const result = ResearchReportSchema.safeParse({
      companyName: "Stripe",
      companyOverview: "Payment processing platform",
      recentNews: [
        {
          headline: "Stripe launches new API",
          summary: "New API for developers",
        },
      ],
      painPoints: [
        {
          area: "Scaling",
          description: "Rapid growth challenges",
          confidence: "high",
        },
      ],
    });

    expect(result.success).toBe(true);
  });

  it("accepts optional funding info", () => {
    const result = ResearchReportSchema.safeParse({
      companyName: "Stripe",
      companyOverview: "Overview",
      recentNews: [],
      fundingInfo: {
        totalRaised: "$2B",
        lastRound: "Series H",
        investors: ["Sequoia", "a16z"],
      },
      painPoints: [],
    });

    expect(result.success).toBe(true);
  });

  it("rejects missing required fields", () => {
    const result = ResearchReportSchema.safeParse({
      companyName: "Stripe",
    });

    expect(result.success).toBe(false);
  });
});

describe("PositioningReportSchema", () => {
  it("accepts valid positioning report", () => {
    const result = PositioningReportSchema.safeParse({
      companyName: "Stripe",
      valueProposition: "Our platform helps Stripe scale onboarding",
      personalizationHooks: [
        {
          hook: "Congrats on the Series H",
          source: "Crunchbase",
          angle: "growth",
        },
      ],
      toneRecommendation: {
        style: "conversational",
        reasoning: "Stripe has a developer-friendly culture",
        dos: ["Be technical", "Reference APIs", "Keep it brief"],
        donts: ["Don't be formal", "Don't pitch", "Don't use buzzwords"],
      },
      keyTalkingPoints: [
        {
          point: "Scale onboarding at Stripe's volume",
          evidence: "Stripe processes millions of onboardings",
          priority: "primary",
        },
      ],
    });

    expect(result.success).toBe(true);
  });

  it("validates tone recommendation style enum", () => {
    const result = PositioningReportSchema.safeParse({
      companyName: "Stripe",
      valueProposition: "VP",
      personalizationHooks: [],
      toneRecommendation: {
        style: "shakespearean", // invalid
        reasoning: "n/a",
        dos: [],
        donts: [],
      },
      keyTalkingPoints: [],
    });

    expect(result.success).toBe(false);
  });

  it("validates hook angle enum", () => {
    const result = PositioningReportSchema.safeParse({
      companyName: "Stripe",
      valueProposition: "VP",
      personalizationHooks: [
        { hook: "test", source: "s", angle: "random_angle" },
      ],
      toneRecommendation: {
        style: "direct",
        reasoning: "r",
        dos: ["a"],
        donts: ["b"],
      },
      keyTalkingPoints: [],
    });

    expect(result.success).toBe(false);
  });
});

describe("EmailOutputSchema", () => {
  it("accepts valid email output", () => {
    const result = EmailOutputSchema.safeParse({
      subjectLine: "Your Series H and onboarding at scale",
      body: "Hi Jane,\n\nSaw the Series H news — impressive growth...\n\nBest,\nAlex",
      callToAction: "Worth 15 min next Tuesday?",
    });

    expect(result.success).toBe(true);
  });

  it("accepts optional fields", () => {
    const result = EmailOutputSchema.safeParse({
      subjectLine: "Test",
      body: "Body",
      callToAction: "CTA",
      tone: "conversational",
      personalizationScore: "high",
      researchElementsUsed: ["Series H news", "tech stack"],
    });

    expect(result.success).toBe(true);
  });

  it("validates personalizationScore enum", () => {
    const result = EmailOutputSchema.safeParse({
      subjectLine: "Test",
      body: "Body",
      callToAction: "CTA",
      personalizationScore: "incredible",
    });

    expect(result.success).toBe(false);
  });
});

describe("LinkedInOutputSchema", () => {
  it("accepts InMail output", () => {
    const result = LinkedInOutputSchema.safeParse({
      type: "inmail",
      subject: "Your Series B + onboarding",
      body: "Hi Jane, saw the Series B news...",
      characterCount: 42,
    });

    expect(result.success).toBe(true);
  });

  it("accepts connection request without subject", () => {
    const result = LinkedInOutputSchema.safeParse({
      type: "connection_request",
      body: "Saw your post about scaling — would love to connect.",
      characterCount: 57,
    });

    expect(result.success).toBe(true);
  });

  it("validates type enum", () => {
    const result = LinkedInOutputSchema.safeParse({
      type: "tweet",
      body: "test",
      characterCount: 4,
    });

    expect(result.success).toBe(false);
  });
});

describe("SDRGraphStateSchema", () => {
  it("accepts minimal state", () => {
    const result = SDRGraphStateSchema.safeParse({
      input: {
        companyName: "Stripe",
        productDescription: "AI onboarding",
      },
    });

    expect(result.success).toBe(true);
  });

  it("applies defaults correctly", () => {
    const result = SDRGraphStateSchema.safeParse({
      input: {
        companyName: "Stripe",
        productDescription: "AI onboarding",
      },
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.nextAgent).toBe("researcher");
      expect(result.data.completedAgents).toEqual([]);
      expect(result.data.errors).toEqual([]);
      expect(result.data.messages).toEqual([]);
    }
  });
});

describe("AgentName", () => {
  it("accepts valid agent names", () => {
    expect(AgentName.safeParse("supervisor").success).toBe(true);
    expect(AgentName.safeParse("researcher").success).toBe(true);
    expect(AgentName.safeParse("positioning").success).toBe(true);
    expect(AgentName.safeParse("email_writer").success).toBe(true);
    expect(AgentName.safeParse("linkedin_writer").success).toBe(true);
  });

  it("rejects invalid agent names", () => {
    expect(AgentName.safeParse("ceo").success).toBe(false);
    expect(AgentName.safeParse("").success).toBe(false);
  });
});