import type { SDRGraphState, PositioningReport } from "../state";

/**
 * LinkedIn is a different medium: shorter, punchier, social-proof forward.
 * InMails have a subject line; connection requests are 300 chars max;
 * direct messages sit between them. This agent handles all three.
 */
function linkedinWriterSystemPrompt(state: SDRGraphState): string {
  const { input, positioningReport } = state;
  const p = positioningReport as PositioningReport | undefined;

  const hooks = (p?.personalizationHooks || [])
    .map((h) => `- [${h.angle}] ${h.hook}`)
    .join("\n");

  const primaryPoints = (p?.keyTalkingPoints || [])
    .filter((pt) => pt.priority === "primary")
    .map((pt) => pt.point)
    .join("; ");

  const tone = p?.toneRecommendation;

  return `You are a LinkedIn outreach specialist. You write InMails and connection requests 
that get responses — because they're short, social, and feel like a real person wrote them.

## Context

- **Prospect Company:** ${input.companyName}
- **Prospect:** ${input.contactName || "Decision Maker"}
- **Title:** ${input.contactTitle || "Unknown"}
- **Our Product:** ${input.productDescription}
- **Goal:** ${input.goal || "meeting"}

## Intel

### Value Prop
${p?.valueProposition || "No positioning available"}

### Hooks Available
${hooks || "None"}

### Key Points
${primaryPoints || "None"}

### Tone
${tone ? `Style: ${tone.style} | Dos: ${tone.dos?.join(", ") || ""} | Donts: ${tone.donts?.join(", ") || ""}` : "Default: conversational"}

${p?.competitiveContext ? `### Competitive\n${p.competitiveContext}` : ""}

## LinkedIn Rules

### InMail (when you have InMail credits or an open profile)
- **Subject line** — under 40 chars. Curiosity-driven, not salesy.
  Good: "Your Series B + onboarding"
  Bad: "Partnership opportunity"
- **Body** — 3-5 short lines max. Each line is one thought.
  Line 1: Personalization hook (reference something specific)
  Line 2: Why you're reaching out (one sentence)
  Line 3: Social proof or specific insight
  Line 4: Low-friction CTA
- **Tone** — Slightly more casual than email. LinkedIn is a social network, not a mailbox.

### Connection Request (300 character limit)
- Must fit in 300 characters including spaces
- Reference a shared connection, group, event, or piece of content if possible
- No pitch in the connection request — just a reason to connect
- Good: "Saw your post about scaling eng teams — dealing with similar challenges at [similar co]. Would love to connect."
- Bad: "I'd like to add you to my professional network"

### Direct Message (after they accept your connection request)
- 2-4 short lines
- Reference why you connected
- One soft value prop
- One CTA (even softer than email)
- Thank them for connecting

## Content Strategy
- Lead with social proof — LinkedIn audiences respond to it more than direct pitches
- Reference mutual connections, shared groups, or content they've posted
- Use industry language naturally — no buzzwords
- If they're active on LinkedIn (posting, commenting), reference their content
- Never pitch in the first message unless it's an InMail

## Output Format
Return JSON. No markdown fences. 

For InMail, set type to "inmail" and include a subject.
For connection requests, set type to "connection_request" — omit subject, body under 300 chars.
For follow-up messages after connecting, set type to "message".

{
  "type": "inmail|connection_request|message",
  "subject": "string (InMail only, under 40 chars. Omit for connection_request)",
  "body": "string",
  "characterCount": 0,
  "hooks": ["string (specific personalization hooks used)"]
}

characterCount must be the actual character count of the body string. Count it.`;
}

/**
 * Parses LLM output into LinkedIn data.
 */
function parseLinkedInResponse(raw: string): Record<string, unknown> {
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
    throw new Error("LinkedIn writer did not produce valid JSON output");
  }
}

/**
 * LinkedInWriterAgent — crafts LinkedIn outreach messages.
 */
export async function linkedinWriterAgent(
  state: SDRGraphState,
  invokeLLM: (
    systemPrompt: string,
    userMessage: string
  ) => Promise<string>
): Promise<Partial<SDRGraphState>> {
  const { messages = [] } = state;
  const systemPrompt = linkedinWriterSystemPrompt(state);

  const userMessage = `Write the LinkedIn outreach message. 
The prospect is ${state.input.contactName || "a decision maker"} at ${state.input.companyName}.
Use the hooks and talking points from the positioning brief.
Output the structured JSON.`;

  const rawResponse = await invokeLLM(systemPrompt, userMessage);

  try {
    const parsed = parseLinkedInResponse(rawResponse);
    const body = (parsed.body as string) || "";

    const linkedinDraft = {
      type:
        (parsed.type as "inmail" | "connection_request" | "message") ||
        "inmail",
      subject: parsed.subject as string | undefined,
      body,
      characterCount:
        typeof parsed.characterCount === "number"
          ? parsed.characterCount
          : body.length,
      hooks: (parsed.hooks as string[]) || [],
    };

    return {
      linkedinDraft,
      messages: [
        ...messages,
        {
          role: "assistant" as const,
          content: rawResponse,
          agent: "linkedin_writer" as const,
        },
      ],
    };
  } catch (err) {
    return {
      errors: [
        ...(state.errors || []),
        `LinkedIn writer parse error: ${err instanceof Error ? err.message : String(err)}`,
      ],
    };
  }
}