export interface ToolDef {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations?: { readOnlyHint?: boolean; untrustedContentHint?: boolean };
  execute: (args: any, options?: { signal?: AbortSignal }) => Promise<unknown> | unknown;
}

export interface ModelContext {
  provideContext?: (opts: { tools: unknown[] }) => void;
  registerTool?: (tool: unknown, options?: { signal?: AbortSignal }) => Promise<void> | void;
}

function feed(line: string) {
  if (typeof document !== "undefined") {
    document.dispatchEvent(new CustomEvent<string>("agent-feed", { detail: line }));
  }
}

// Adapter over the WebMCP surface. The spec has already renamed its entry point
// once (navigator.modelContext -> document.modelContext), so we detect both and
// keep our own registry; the rest of the app never touches the raw API.
export class WebMCPAdapter {
  private tools = new Map<string, ToolDef>();
  private registrations = new Map<string, { controller: AbortController; tool: ToolDef }>();
  private warnedUnavailable = false;
  private readonly contextProvider: () => ModelContext | null;

  constructor(context?: ModelContext | (() => ModelContext | null)) {
    this.contextProvider =
      typeof context === "function"
        ? context
        : context
          ? () => context
          : () =>
              ((typeof document !== "undefined" ? (document as any).modelContext : null) ??
                (typeof navigator !== "undefined" ? (navigator as any).modelContext : null) ??
                null) as ModelContext | null;
  }

  private ctx(): ModelContext | null {
    return this.contextProvider();
  }

  get available(): boolean {
    const ctx = this.ctx();
    return Boolean(ctx && (typeof ctx.registerTool === "function" || typeof ctx.provideContext === "function"));
  }

  // Replace the full tool set. Called on view changes — this is what makes
  // registration dynamic: tools appear and disappear with what is on screen.
  setTools(tools: ToolDef[]) {
    this.tools = new Map(tools.map((t) => [t.name, t]));
    this.sync();
  }

  private wrap(tool: ToolDef, legacy = false) {
    return {
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
      annotations: tool.annotations,
      execute: async (args: any, options?: { signal?: AbortSignal }) => {
        const keys = args && typeof args === "object" ? Object.keys(args).join(", ") : "";
        feed(`→ ${tool.name}${keys ? ` (${keys})` : ""}`);
        const result = (await tool.execute(args ?? {}, options)) ?? { ok: true };
        return legacy ? { content: [{ type: "text", text: JSON.stringify(result) }] } : result;
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
    if (typeof ctx.registerTool === "function") {
      let changed = false;
      for (const [name, registration] of this.registrations) {
        const next = this.tools.get(name);
        if (!next || next !== registration.tool) {
          registration.controller.abort();
          this.registrations.delete(name);
          changed = true;
        }
      }
      for (const tool of this.tools.values()) {
        if (this.registrations.has(tool.name)) continue;
        const controller = new AbortController();
        this.registrations.set(tool.name, { controller, tool });
        changed = true;
        try {
          Promise.resolve(ctx.registerTool(this.wrap(tool), { signal: controller.signal })).catch((error) => {
            const current = this.registrations.get(tool.name);
            if (current?.controller === controller) this.registrations.delete(tool.name);
            if (!controller.signal.aborted) {
              feed(`⚠ ${tool.name} registration failed: ${error instanceof Error ? error.message : String(error)}`);
            }
          });
        } catch (error) {
          this.registrations.delete(tool.name);
          feed(`⚠ ${tool.name} registration failed: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
      if (changed) feed(`▲ toolchange: ${this.registrations.size} tools registered`);
      return;
    }
    if (typeof ctx.provideContext === "function") {
      const wrapped = [...this.tools.values()].map((t) => this.wrap(t, true));
      ctx.provideContext({ tools: wrapped });
      feed(`▲ toolchange: ${wrapped.length} legacy tools provided`);
    }
  }
}
