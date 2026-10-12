import { StateGraph, END } from "@langchain/langgraph";
import type { SDRGraphState, AgentName } from "../state.js";
import { SDRGraphStateSchema } from "../state.js";
import type { WebSearchProvider } from "../tools/web-search.js";
import { researcherAgent } from "../agents/researcher.js";
import { positioningReportAgent } from "../agents/positioning.js";
import { emailWriterAgent } from "../agents/email-writer.js";
import { linkedinWriterAgent } from "../agents/linkedin-writer.js";

/**
 * LLM invocation interface — decouples the graph from any specific model provider.
 *
 * Single-turn call:
 *   invokeLLM(systemPrompt, userMessage, tools?) => string
 *
 * Multi-turn / tool-calling loop is handled inside each agent that needs it
 * (currently only the researcher uses tools). The agent is responsible for
 * calling invokeLLM in a loop, passing tool results back as messages.
 */
export interface LLMInvoker {
  invoke(
    systemPrompt: string,
    userMessage: string,
    tools?: Array<{
      name: string;
      description: string;
      schema: Record<string, unknown>;
      invoke: (input: unknown) => Promise<string>;
    }>
  ): Promise<string>;
}

/**
 * Builds a multi-turn LLM call loop for agents that need tool use.
 * Wraps a plain invoker with tool-calling logic so the agent can just
 * pass tools and get a final string back.
 */
function createToolCallingInvoker(
  invoker: LLMInvoker
): (
  systemPrompt: string,
  userMessage: string,
  tools?: Array<{
    name: string;
    description: string;
    schema: Record<string, unknown>;
    invoke: (input: unknown) => Promise<string>;
  }>
) => Promise<string> {
  return async (systemPrompt, userMessage, tools) => {
    if (!tools || tools.length === 0) {
      return invoker.invoke(systemPrompt, userMessage);
    }

    // For a real implementation, you'd use LangChain's tool-calling agent loop.
    // Here we do a simple 3-turn maximum loop:
    // Turn 1: LLM sees tools, decides which to call, returns a tool call + eventual answer
    // We parse the tool call(s), execute them, send results back, and get final answer.

    // Build tool descriptions for the system prompt extension
    const toolDescriptions = tools
      .map(
        (t) =>
          `- ${t.name}: ${t.description}. Input schema: ${JSON.stringify(t.schema)}`
      )
      .join("\n");

    const extendedSystem = `${systemPrompt}

## Available Tools
You have access to the following tools. To use a tool, respond with a JSON array of tool calls:
[{"tool": "tool_name", "input": {...}}]

After tool results come back, continue your analysis and eventually output your final result.

${toolDescriptions}`;

    // Turn 1: initial call
    let response = await invoker.invoke(
      extendedSystem,
      `${userMessage}\n\nCall tools as needed, then provide your final output.`
    );

    // Try to extract tool calls from the response
    let toolCalls = extractToolCalls(response);
    let turn = 0;
    const maxTurns = 3;

    while (toolCalls.length > 0 && turn < maxTurns) {
      turn++;

      // Execute each tool call
      const toolResults: string[] = [];
      for (const call of toolCalls) {
        const tool = tools.find((t) => t.name === call.tool);
        if (tool) {
          try {
            const result = await tool.invoke(call.input);
            toolResults.push(
              `Tool ${call.tool} result:\n${result}`
            );
          } catch (err) {
            toolResults.push(
              `Tool ${call.tool} error: ${err instanceof Error ? err.message : String(err)}`
            );
          }
        } else {
          toolResults.push(`Unknown tool: ${call.tool}`);
        }
      }

      // Send tool results back
      const toolResultBlock = toolResults.join("\n\n---\n\n");
      response = await invoker.invoke(
        extendedSystem,
        `Tool results:\n\n${toolResultBlock}\n\nContinue your analysis and provide your final output. If you need more tools, call them. Otherwise, output your final result.`
      );

      toolCalls = extractToolCalls(response);
    }

    return response;
  };
}

/**
 * Extracts tool-call JSON arrays from an LLM response string.
 */
function extractToolCalls(
  text: string
): Array<{ tool: string; input: unknown }> {
  try {
    // Try direct JSON parse
    const parsed = JSON.parse(text.trim());
    if (Array.isArray(parsed)) {
      return parsed as Array<{ tool: string; input: unknown }>;
    }
  } catch {
    // Look for JSON array in the text
    const match = text.match(/\[\s*\{[\s\S]*?\}\s*\]/);
    if (match) {
      try {
        const parsed = JSON.parse(match[0]);
        if (Array.isArray(parsed)) {
          return parsed as Array<{ tool: string; input: unknown }>;
        }
      } catch {
        // no-op
      }
    }
  }
  return [];
}

/**
 * Supervisor routing function.
 *
 * Determines which agent runs next based on the current state.
 * The pipeline is strictly sequential:
 *   researcher → positioning → email_writer → linkedin_writer → END
 *
 * This is a deterministic state machine. The supervisor doesn't need an LLM call
 * for routing — it just looks at what's been completed and advances the pipeline.
 * For a more flexible supervisor (dynamic routing, retries, parallel branches),
 * swap this for an LLM-based routing function.
 */
function supervisorRouter(state: SDRGraphState): AgentName | "__end__" {
  const completed = state.completedAgents || [];
  const errors = state.errors || [];

  // If we have errors on the current step but still have uncompleted agents,
  // push forward — individual agents record their own errors without blocking
  // the pipeline. A production system might want a retry policy here.

  if (!completed.includes("researcher")) {
    return "researcher";
  }

  if (!completed.includes("positioning")) {
    return "positioning";
  }

  if (!completed.includes("email_writer")) {
    return "email_writer";
  }

  if (!completed.includes("linkedin_writer")) {
    return "linkedin_writer";
  }

  return "__end__";
}

/**
 * Node: supervisor. Records the current agent as "in progress" and logs routing.
 */
async function supervisorNode(
  state: SDRGraphState
): Promise<Partial<SDRGraphState>> {
  const nextAgent = supervisorRouter(state);

  return {
    nextAgent: nextAgent === "__end__" ? undefined : nextAgent,
    messages: [
      ...(state.messages || []),
      {
        role: "system" as const,
        content: `Supervisor routing to: ${nextAgent}`,
        agent: "supervisor" as const,
      },
    ],
  };
}

/**
 * Factory: creates the Researcher node, bound to dependencies.
 */
function createResearcherNode(
  searchProvider: WebSearchProvider,
  invoker: LLMInvoker
) {
  const callLLM = createToolCallingInvoker(invoker);

  return async (
    state: SDRGraphState
  ): Promise<Partial<SDRGraphState>> => {
    const result = await researcherAgent(state, searchProvider, callLLM);
    return {
      ...result,
      completedAgents: [
        ...(state.completedAgents || []),
        "researcher" as const,
      ],
    };
  };
}

/**
 * Factory: creates the Positioning node, bound to dependencies.
 */
function createPositioningNode(invoker: LLMInvoker) {
  return async (
    state: SDRGraphState
  ): Promise<Partial<SDRGraphState>> => {
    const result = await positioningReportAgent(state, invoker.invoke.bind(invoker));
    return {
      ...result,
      completedAgents: [
        ...(state.completedAgents || []),
        "positioning" as const,
      ],
    };
  };
}

/**
 * Factory: creates the Email Writer node.
 */
function createEmailWriterNode(invoker: LLMInvoker) {
  return async (
    state: SDRGraphState
  ): Promise<Partial<SDRGraphState>> => {
    const result = await emailWriterAgent(state, invoker.invoke.bind(invoker));
    return {
      ...result,
      completedAgents: [
        ...(state.completedAgents || []),
        "email_writer" as const,
      ],
    };
  };
}

/**
 * Factory: creates the LinkedIn Writer node.
 */
function createLinkedInWriterNode(invoker: LLMInvoker) {
  return async (
    state: SDRGraphState
  ): Promise<Partial<SDRGraphState>> => {
    const result = await linkedinWriterAgent(state, invoker.invoke.bind(invoker));
    return {
      ...result,
      completedAgents: [
        ...(state.completedAgents || []),
        "linkedin_writer" as const,
      ],
    };
  };
}

/**
 * Terminal node: copies drafts to final outputs and marks the graph complete.
 */
async function finalizeNode(
  state: SDRGraphState
): Promise<Partial<SDRGraphState>> {
  return {
    finalEmail: state.emailDraft,
    finalLinkedIn: state.linkedinDraft,
    finalPositioning: state.positioningReport,
    messages: [
      ...(state.messages || []),
      {
        role: "system" as const,
        content: "Pipeline complete. All outputs finalized.",
        agent: "supervisor" as const,
      },
    ],
  };
}

/**
 * Dependencies for the SDR graph.
 */
export interface SDRGraphDependencies {
  /** Web search provider — injected so you can use mock, Brave, Tavily, etc. */
  searchProvider: WebSearchProvider;
  /** LLM invoker — injected so you can use Anthropic, OpenAI, or any provider. */
  llmInvoker: LLMInvoker;
}

/**
 * createSDRGraph — builds the LangGraph StateGraph for the SDR pipeline.
 *
 * Graph topology:
 *
 *   START → supervisor → researcher → supervisor → positioning
 *              ↑             ↓               ↑           ↓
 *              └─────────────┴───────────────┴── supervisor → email_writer
 *                                                               ↓
 *                                                  supervisor → linkedin_writer
 *                                                               ↓
 *                                                      supervisor → finalize → END
 *
 * The supervisor acts as a router between each agent node. After each agent
 * completes, control returns to the supervisor which checks completion flags
 * and routes to the next agent. This design supports future extensions like
 * conditional branching, retries, and human-in-the-loop checkpoints.
 */
export function createSDRGraph(deps: SDRGraphDependencies) {
  const researcherNode = createResearcherNode(deps.searchProvider, deps.llmInvoker);
  const positioningNode = createPositioningNode(deps.llmInvoker);
  const emailWriterNode = createEmailWriterNode(deps.llmInvoker);
  const linkedinWriterNode = createLinkedInWriterNode(deps.llmInvoker);

  const workflow = new StateGraph({
    channels: SDRGraphStateSchema,
  });

  // Add nodes
  workflow.addNode("supervisor", supervisorNode);
  workflow.addNode("researcher", researcherNode);
  workflow.addNode("positioning", positioningNode);
  workflow.addNode("email_writer", emailWriterNode);
  workflow.addNode("linkedin_writer", linkedinWriterNode);
  workflow.addNode("finalize", finalizeNode);

  // Set entry point
  workflow.setEntryPoint("supervisor");

  // Supervisor conditional edges
  workflow.addConditionalEdges("supervisor", (state: SDRGraphState) => {
    const completed = state.completedAgents || [];

    if (!completed.includes("researcher")) return "researcher";
    if (!completed.includes("positioning")) return "positioning";
    if (!completed.includes("email_writer")) return "email_writer";
    if (!completed.includes("linkedin_writer")) return "linkedin_writer";

    return "finalize";
  });

  // Every agent node returns to supervisor for next routing decision
  workflow.addEdge("researcher", "supervisor");
  workflow.addEdge("positioning", "supervisor");
  workflow.addEdge("email_writer", "supervisor");
  workflow.addEdge("linkedin_writer", "supervisor");

  // Finalize ends the graph
  workflow.addEdge("finalize", END);

  return workflow.compile();
}