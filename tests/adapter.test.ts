import { describe, expect, test } from "bun:test";
import { WebMCPAdapter, type ModelContext, type ToolDef } from "../src/webmcp/adapter";

class FakeContext implements ModelContext {
  tools = new Map<string, any>();

  registerTool(tool: any, options?: { signal?: AbortSignal }): Promise<void> {
    if (this.tools.has(tool.name)) return Promise.reject(new DOMException("duplicate", "InvalidStateError"));
    this.tools.set(tool.name, tool);
    options?.signal?.addEventListener("abort", () => this.tools.delete(tool.name), { once: true });
    return Promise.resolve();
  }
}

const tool = (name: string): ToolDef => ({
  name,
  description: `${name} description`,
  inputSchema: { type: "object", properties: { value: { type: "string" } } },
  execute: ({ value }) => ({ name, value }),
});

describe("WebMCPAdapter", () => {
  test("adds and truly unregisters dynamic tools with AbortSignal", async () => {
    const context = new FakeContext();
    const adapter = new WebMCPAdapter(context);
    const base = tool("base");
    const scoped = tool("scoped");

    adapter.setTools([base]);
    await Promise.resolve();
    expect([...context.tools.keys()]).toEqual(["base"]);

    adapter.setTools([base, scoped]);
    await Promise.resolve();
    expect([...context.tools.keys()]).toEqual(["base", "scoped"]);

    adapter.setTools([base]);
    await Promise.resolve();
    expect([...context.tools.keys()]).toEqual(["base"]);

    adapter.setTools([base, scoped]);
    await Promise.resolve();
    expect([...context.tools.keys()]).toEqual(["base", "scoped"]);
  });

  test("returns a direct WebMCP result instead of an MCP content envelope", async () => {
    const context = new FakeContext();
    const adapter = new WebMCPAdapter(context);
    const base = tool("base");
    adapter.setTools([base]);
    await Promise.resolve();

    expect(await context.tools.get("base").execute({ value: "ok" })).toEqual({ name: "base", value: "ok" });
  });
});
