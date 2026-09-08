import { describe, expect, it, vi } from "vitest";
import { draftReply, translateText, proposeWorkflow } from "./helpers";
import type { AiProvider } from "./types";

function fakeProvider(response: string): AiProvider {
  return { name: "fake", complete: vi.fn().mockResolvedValue(response) };
}

describe("draftReply", () => {
  it("returns the provider's trimmed response", async () => {
    const provider = fakeProvider("  Sure, happy to help!  ");
    const reply = await draftReply(provider, { history: [{ direction: "inbound", body: "Can you help me?" }] });
    expect(reply).toBe("Sure, happy to help!");
  });

  it("includes the conversation transcript in the prompt sent to the provider", async () => {
    const provider = fakeProvider("ok");
    await draftReply(provider, {
      history: [
        { direction: "inbound", body: "Hi" },
        { direction: "outbound", body: "Hello!" },
      ],
    });
    const call = (provider.complete as ReturnType<typeof vi.fn>).mock.calls[0];
    const userMessage = call[0].find((m: { role: string }) => m.role === "user");
    expect(userMessage.content).toContain("Customer: Hi");
    expect(userMessage.content).toContain("Agent: Hello!");
  });
});

describe("translateText", () => {
  it("returns the provider's trimmed translation", async () => {
    const provider = fakeProvider(" Hola ");
    const result = await translateText(provider, "Hello", "Spanish");
    expect(result).toBe("Hola");
  });
});

describe("proposeWorkflow", () => {
  it("parses a valid JSON workflow proposal", async () => {
    const provider = fakeProvider(
      JSON.stringify({
        nodes: [
          { id: "n1", type: "trigger", config: {} },
          { id: "n2", type: "log", config: { message: "hi" } },
        ],
        edges: [{ from: "n1", to: "n2" }],
        startNodeId: "n1",
      }),
    );
    const result = await proposeWorkflow(provider, "log a message when triggered");
    expect(result.nodes).toHaveLength(2);
    expect(result.startNodeId).toBe("n1");
  });

  it("strips a markdown code fence around the JSON", async () => {
    const provider = fakeProvider('```json\n{"nodes":[{"id":"n1","type":"trigger","config":{}}],"edges":[],"startNodeId":"n1"}\n```');
    const result = await proposeWorkflow(provider, "just a trigger");
    expect(result.startNodeId).toBe("n1");
  });

  it("rejects a proposal whose startNodeId doesn't reference a real node", async () => {
    const provider = fakeProvider(JSON.stringify({ nodes: [{ id: "n1", type: "trigger", config: {} }], edges: [], startNodeId: "missing" }));
    await expect(proposeWorkflow(provider, "x")).rejects.toThrow(/startNodeId/);
  });

  it("rejects non-JSON output", async () => {
    const provider = fakeProvider("I cannot help with that.");
    await expect(proposeWorkflow(provider, "x")).rejects.toThrow(/valid JSON/);
  });

  it("rejects a proposal with no nodes", async () => {
    const provider = fakeProvider(JSON.stringify({ nodes: [], edges: [], startNodeId: "n1" }));
    await expect(proposeWorkflow(provider, "x")).rejects.toThrow(/no nodes/);
  });
});
