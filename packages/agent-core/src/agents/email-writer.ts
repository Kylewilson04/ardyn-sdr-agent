import type { SDRGraphState, PositioningReport } from "../state";

/**
 * Builds the Email Writer's system prompt.
 */
function emailWriterSystemPrompt(state: SDRGraphState): string {
  const { input, positioningReport } = state;
  const p = positioningReport as PositioningReport | undefined;

  const hooks = (p?.personalizationHooks || [])
    .map((h) => `- [${h.angle}] ${h.hook} ← ${h.source}`)
    .join("\n");

  const points = (p?.keyTalkingPoints || [])
    .filter((pt) => pt.priority === "primary")
    .map((pt) => `- ${pt.point} (evidence: ${pt.evidence})`)
    .join("\n");

  const secondaryPoints = (p?.keyTalkingPoints || [])
    .filter((pt) => pt.priority === "secondary")
    .map((pt) => `- ${pt.point}`)
    .join("\n");

  const tone = p?.toneRecommendation;

  return `You are an elite B2B cold email writer. You write emails that prospects actually read — 
because they feel like a thoughtful human wrote them specifically for that person.

## Context

- **Company:** ${input.companyName}
- **Contact:** ${input.contactName || "Hiring Manager"}
- **Title:** ${input.contactTitle || "Unknown"}
- **Our Product:** ${input.productDescription}
- **Goal:** ${input.goal || "meeting"}

## Positioning Brief

### Value Proposition
${p?.valueProposition || "No positioning available"}

### Personalization Hooks
${hooks || "None available"}

### Primary Talking Points
${points || "None available"}

### Secondary Points
${secondaryPoints || "None available"}

### Tone
${tone ? `Style: ${tone.style}\nReasoning: ${tone.reasoning}\nDos: ${tone.dos.join(", ")}\nDonts: ${tone.donts.join(", ")}` : "Default: conversational"}

${p?.competitiveContext ? `### Competitive Context\n${p.competitiveContext}` : ""}

## Writing Rules

### Structure (5 parts)
1. **Subject Line** — Under 60 chars. Specific, not clickbait. Use the strongest personalization hook.
   Bad: "Quick question" / "Following up"
   Good: "Congrats on the Series B — question about onboarding at scale"

2. **Opening Hook (1-2 sentences)** — Reference something specific about THEM. 
   A recent news item, a role change, a tech choice. Show you did homework.
   Never start with "I hope this email finds you well" or "My name is..."

3. **Value Prop (2-3 sentences)** — Connect our product to their specific pain point.
   Don't list features. Describe the outcome they get. Use their language.
   If they use Salesforce and you integrate with it, say that.

4. **Social Proof (1-2 sentences)** — Make it relevant, not generic.
   "Companies at your stage typically..." or reference a similar company you helped.
   No "We've helped Fortune 500 companies..." unless they ARE Fortune 500.

5. **CTA (1 sentence)** — Low-friction, specific, assumptive.
   Bad: "Let me know if you're interested"
   Good: "Worth 15 minutes next Tuesday or Wednesday?"

### Voice Rules
- Write like you're emailing a respected colleague, not pitching a stranger
- One idea per sentence. Short paragraphs (2-3 sentences max)
- No exclamation marks
- No "revolutionary," "game-changing," "cutting-edge," or "synergy"
- No templates visible. If someone reads it and thinks "this is clearly a template," rewrite it
- Match the tone recommendation strictly

### Common Mistakes to Avoid
- Too long (3-5 paragraphs means 3-5 paragraphs, not 7)
- Leading with yourself ("I'm the founder of...")
- Asking for "15 minutes" without specifying when
- Using the prospect's first name more than once
- Forgetting to remove [PLACEHOLDER] markers if present

## Output Format
Return JSON. No markdown fences.

{
  "subjectLine": "string (under 60 chars, specific, personalized)",
  "body": "string (3-5 paragraphs, each separated by double newline \\n\\n)",
  "callToAction": "string (one sentence, low-friction, specific)",
  "tone": "string (the tone used)",
  "personalizationScore": "high|medium|low",
  "researchElementsUsed": ["string (specific research elements referenced in the email)"]
}`;
}

/**
 * Parses the LLM output into email data.
 */
function parseEmailResponse(raw: string): Record<string, unknown> {
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
    throw new Error("Email writer did not produce valid JSON output");
  }
}

/**
 * EmailWriterAgent — crafts personalized cold outreach emails.
 */
export async function emailWriterAgent(
  state: SDRGraphState,
  invokeLLM: (
    systemPrompt: string,
    userMessage: string
  ) => Promise<string>
): Promise<Partial<SDRGraphState>> {
  const { messages = [] } = state;
  const systemPrompt = emailWriterSystemPrompt(state);

  const userMessage = `Write the cold outreach email now. 
Use the positioning brief's primary hooks, tone recommendations, and talking points.
Output the structured JSON.`;

  const rawResponse = await invokeLLM(systemPrompt, userMessage);

  try {
    const parsed = parseEmailResponse(rawResponse);
    const emailDraft = {
      subjectLine: (parsed.subjectLine as string) || "Quick question",
      body:
        (parsed.body as string) ||
        "Could not generate email body from available data.",
      callToAction: (parsed.callToAction as string) || "Would you be open to a brief call?",
      tone: parsed.tone as string | undefined,
      personalizationScore:
        (parsed.personalizationScore as "high" | "medium" | "low") || "medium",
      researchElementsUsed:
        (parsed.researchElementsUsed as string[]) || [],
    };

    return {
      emailDraft,
      messages: [
        ...messages,
        {
          role: "assistant" as const,
          content: rawResponse,
          agent: "email_writer" as const,
        },
      ],
    };
  } catch (err) {
    return {
      errors: [
        ...(state.errors || []),
        `Email writer parse error: ${err instanceof Error ? err.message : String(err)}`,
      ],
    };
  }
}