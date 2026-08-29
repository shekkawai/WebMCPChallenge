export interface ToolDef {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  execute: (args: any) => Promise<unknown> | unknown;
}

interface ModelContext {
  provideContext?: (opts: { tools: unknown[] }) => void;
  registerTool?: (tool: unknown) => { unregister?: () => void } | void;
}

function feed(line: string) {
  document.dispatchEvent(new CustomEvent<string>("agent-feed", { detail: line }));
}

// Adapter over the WebMCP surface. The spec has already renamed its entry point
// once (navigator.modelContext -> document.modelContext), so we detect both and
// keep our own registry; the rest of the app never touches the raw API.
export class WebMCPAdapter {
  private tools = new Map<string, ToolDef>();
  private handles = new Map<string, { unregister?: () => void } | void>();
  private warnedUnavailable = false;

  private ctx(): ModelContext | null {
    return ((document as any).modelContext ?? (navigator as any).modelContext ?? null) as ModelContext | null;
  }

  get available(): boolean {
    return this.ctx() !== null;
  }

  // Replace the full tool set. Called on view changes — this is what makes
  // registration dynamic: tools appear and disappear with what is on screen.
  setTools(tools: ToolDef[]) {
    this.tools = new Map(tools.map((t) => [t.name, t]));
    this.sync();
  }

  private wrap(tool: ToolDef) {
    return {
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
      execute: async (args: any) => {
        feed(`→ ${tool.name}(${JSON.stringify(args ?? {}).slice(0, 120)})`);
        const result = await tool.execute(args ?? {});
        return { content: [{ type: "text", text: JSON.stringify(result ?? { ok: true }) }] };
      },
    };
  }

  private sync() {
    const ctx = this.ctx();
    if (!ctx) {
      if (!this.warnedUnavailable) {
        this.warnedUnavailable = true;
        feed("⚠ WebMCP not detected — keyboard fallback only (← →)");
      }
      return;
    }
    const wrapped = [...this.tools.values()].map((t) => this.wrap(t));
    if (typeof ctx.provideContext === "function") {
      ctx.provideContext({ tools: wrapped });
      feed(`▲ toolchange: ${wrapped.length} tools provided`);
      return;
    }
    if (typeof ctx.registerTool === "function") {
      for (const [name, handle] of this.handles) {
        if (!this.tools.has(name)) {
          if (handle && typeof handle.unregister === "function") handle.unregister();
          this.handles.delete(name);
        }
      }
      for (const t of wrapped) {
        if (!this.handles.has(t.name)) this.handles.set(t.name, ctx.registerTool(t));
      }
      feed(`▲ toolchange: ${wrapped.length} tools registered`);
    }
  }
}
