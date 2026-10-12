import type { SDRGraphState, ResearchReport } from "../state";

/**
 * Builds the Positioning agent's system prompt from the research report.
 */
function positioningSystemPrompt(
  state: SDRGraphState
): string {
  const { input, researchReport } = state;
  const r = researchReport as ResearchReport | undefined;

  if (!r) {
    return "You are a strategic SDR positioning expert. No research report is available yet.";
  }

  const painPoints = (r.painPoints || [])
    .map((p) => `- ${p.area}: ${p.description} (confidence: ${p.confidence ?? "unknown"})`)
    .join("\n");

  const news = (r.recentNews || [])
    .map((n) => `- ${n.headline}${n.date ? ` (${n.date})` : ""}: ${n.summary}`)
    .join("\n");

  const leadership = (r.leadershipChanges || [])
    .map((l) => `- ${l.person}, ${l.role}: ${l.change}${l.date ? ` (${l.date})` : ""}`)
    .join("\n");

  return `You are a senior SDR strategist. Your job: take raw research and produce a sharp, 
actionable positioning brief that an email writer can use immediately.

## Target Account

- **Company:** ${r.companyName || input.companyName}
- **Contact:** ${r.contactName || input.contactName || "Unknown"}
- **Contact Title:** ${input.contactTitle || "Unknown"}
- **Our Product:** ${input.productDescription}
- **Goal:** ${input.goal || "meeting"}

## Research Summary

### Company Overview
${r.companyOverview || "No overview available"}

### Recent News
${news || "No recent news found"}

### Funding
${r.fundingInfo ? `Total raised: ${r.fundingInfo.totalRaised || "unknown"}, Last round: ${r.fundingInfo.lastRound || "unknown"}` : "No funding data"}

### Tech Stack
${r.techStack?.inferred?.length ? r.techStack.inferred.join(", ") + ` (confidence: ${r.techStack.confidence || "unknown"})` : "Unknown"}

### Leadership Changes
${leadership || "None noted"}

### Pain Points
${painPoints || "None identified"}

### Raw Notes
${r.rawNotes || "None"}

## Your Task

Write a positioning brief that connects our product to the prospect's actual situation. 
Be specific, not generic. Use the research — reference real news, real pain points, real roles.

### Framework

1. **Value Proposition Alignment** — How does our product specifically solve their pain points? 
   Match features to problems one-to-one. If they just raised a Series B and are hiring fast, 
   talk about scale. If they have a new CRO, talk about pipeline impact.

2. **Personalization Hooks** (at least 3) — Concrete angles for opening an email. Each hook 
   must cite a specific piece of research. Examples: "Congrats on the Series B — that 
   hiring velocity usually means..." or "Saw your new VP of Engineering came from Stripe..."

3. **Tone Recommendation** — Should this be formal, conversational, direct, or insightful? 
   Reason from the company's culture signals (enterprise = formal, startup = conversational, 
   technical buyer = direct, strategic buyer = insightful). Give 3 specific dos and 3 donts.

4. **Key Talking Points** (at least 4) — Ranked by priority. Each point must have evidence 
   from the research. Primary points go to the email; secondary go to follow-up.

5. **Competitive Context** — If the prospect likely uses a competitor, acknowledge it and 
   frame our differentiator. If the research suggests they evaluated something similar, 
   address the objection before they raise it.

## Output Format
Return a JSON object matching this exact structure. No markdown fences.

{
  "companyName": "string",
  "contactName": "string",
  "valueProposition": "string (2-3 sentences)",
  "personalizationHooks": [
    {"hook": "string", "source": "string", "angle": "news|growth|tech|leadership|pain_point|role|industry"}
  ],
  "toneRecommendation": {
    "style": "formal|conversational|direct|insightful",
    "reasoning": "string",
    "dos": ["string", "string", "string"],
    "donts": ["string", "string", "string"]
  },
  "keyTalkingPoints": [
    {"point": "string", "evidence": "string", "priority": "primary|secondary"}
  ],
  "competitiveContext": "string or null"
}`;
}

/**
 * Parses LLM output into positioning data.
 */
function parsePositioningResponse(raw: string): Record<string, unknown> {
  let cleaned = raw.trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  }

  try {
    return JSON.parse(cleaned) as Record<string, unknown>;
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (match) {
      return JSON.parse(match[0]) as Record<string, unknown>;
    }
    throw new Error("Positioning agent did not produce valid JSON output");
  }
}

/**
 * PositioningReportAgent — builds a strategic positioning brief from research.
 */
export async function positioningReportAgent(
  state: SDRGraphState,
  invokeLLM: (
    systemPrompt: string,
    userMessage: string
  ) => Promise<string>
): Promise<Partial<SDRGraphState>> {
  const { input, messages = [] } = state;
  const systemPrompt = positioningSystemPrompt(state);

  const userMessage =
    "Analyze the research and produce the positioning brief as structured JSON. Be specific, reference the actual research data, and rank your recommendations.";

  const rawResponse = await invokeLLM(systemPrompt, userMessage);

  try {
    const parsed = parsePositioningResponse(rawResponse);
    const positioningReport = {
      companyName:
        (parsed.companyName as string) || input.companyName,
      contactName: (parsed.contactName as string) || input.contactName || "",
      valueProposition:
        (parsed.valueProposition as string) ||
        "Value proposition could not be determined from available research.",
      personalizationHooks:
        (parsed.personalizationHooks as PersonalizationHook[]) || [],
      toneRecommendation: {
        style:
          (parsed.toneRecommendation as Record<string, unknown>)
            ?.style as ToneStyle || "conversational",
        reasoning:
          ((parsed.toneRecommendation as Record<string, unknown>)
            ?.reasoning as string) || "",
        dos:
          ((parsed.toneRecommendation as Record<string, unknown>)?.dos as string[]) || [],
        donts:
          ((parsed.toneRecommendation as Record<string, unknown>)?.donts as string[]) || [],
      },
      keyTalkingPoints:
        (parsed.keyTalkingPoints as TalkingPoint[]) || [],
      competitiveContext: parsed.competitiveContext as string | undefined,
    };

    return {
      positioningReport,
      messages: [
        ...messages,
        {
          role: "assistant" as const,
          content: rawResponse,
          agent: "positioning" as const,
        },
      ],
    };
  } catch (err) {
    return {
      errors: [
        ...(state.errors || []),
        `Positioning parse error: ${err instanceof Error ? err.message : String(err)}`,
      ],
    };
  }
}

// Local types
type ToneStyle = "formal" | "conversational" | "direct" | "insightful";

interface PersonalizationHook {
  hook: string;
  source: string;
  angle: "news" | "growth" | "tech" | "leadership" | "pain_point" | "role" | "industry";
}

interface TalkingPoint {
  point: string;
  evidence: string;
  priority: "primary" | "secondary";
}