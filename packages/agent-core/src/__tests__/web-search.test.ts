import { describe, it, expect, vi } from "vitest";
import { MockWebSearchProvider, createWebSearchTool } from "../tools/web-search.js";

describe("MockWebSearchProvider", () => {
  it("returns seeded results when query matches", async () => {
    const provider = new MockWebSearchProvider({
      "test query": [
        {
          title: "Custom Result",
          url: "https://example.com",
          snippet: "A custom snippet",
          date: "2026-01-01",
        },
      ],
    });

    const results = await provider.search({
      query: "test query",
      maxResults: 5,
    });

    expect(results).toHaveLength(1);
    expect(results[0]!.title).toBe("Custom Result");
    expect(results[0]!.url).toBe("https://example.com");
  });

  it("respects maxResults on seeded queries", async () => {
    const provider = new MockWebSearchProvider({
      "query": [
        { title: "A", url: "https://a.com", snippet: "a" },
        { title: "B", url: "https://b.com", snippet: "b" },
        { title: "C", url: "https://c.com", snippet: "c" },
      ],
    });

    const results = await provider.search({ query: "query", maxResults: 2 });
    expect(results).toHaveLength(2);
  });

  it("generates fallback results for unknown queries", async () => {
    const provider = new MockWebSearchProvider();
    const results = await provider.search({
      query: "Stripe funding 2026",
      maxResults: 3,
    });

    expect(results).toHaveLength(3);
    expect(results[0]!.title).toContain("Stripe");
    expect(results[0]!.snippet).toContain("[PLACEHOLDER]");
  });

  it("generates at most 5 fallback results", async () => {
    const provider = new MockWebSearchProvider();
    const results = await provider.search({
      query: "anything",
      maxResults: 10,
    });

    expect(results.length).toBeLessThanOrEqual(5);
  });

  it("marks fallback results with PLACEHOLDER tag", async () => {
    const provider = new MockWebSearchProvider();
    const results = await provider.search({
      query: "unknown company xyz",
      maxResults: 1,
    });

    expect(results[0]!.snippet).toContain("[PLACEHOLDER]");
  });
});

describe("createWebSearchTool", () => {
  it("creates a tool with name and schema", () => {
    const provider = new MockWebSearchProvider();
    const tool = createWebSearchTool(provider);

    expect(tool.name).toBe("web_search");
    expect(tool.description).toBeTruthy();
    expect(tool.schema.type).toBe("object");
    expect(tool.schema.properties.query).toBeDefined();
    expect(tool.schema.required).toContain("query");
  });

  it("invoke returns JSON string of results", async () => {
    const provider = new MockWebSearchProvider({
      "stripe": [
        {
          title: "Stripe",
          url: "https://stripe.com",
          snippet: "Payments",
        },
      ],
    });

    const tool = createWebSearchTool(provider);
    const result = await tool.invoke({ query: "stripe", maxResults: 1 });

    const parsed = JSON.parse(result) as Array<{ title: string }>;
    expect(parsed).toHaveLength(1);
    expect(parsed[0]!.title).toBe("Stripe");
  });

  it("tool defaults maxResults to 5 when not provided", async () => {
    const provider = new MockWebSearchProvider();
    const tool = createWebSearchTool(provider);
    const result = await tool.invoke({ query: "test" });

    const parsed = JSON.parse(result) as unknown[];
    expect(parsed.length).toBeGreaterThan(0);
    expect(parsed.length).toBeLessThanOrEqual(5);
  });
});