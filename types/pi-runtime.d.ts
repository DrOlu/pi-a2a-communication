/**
 * Type declarations for pi runtime modules
 * These are provided by the pi environment at runtime
 */

// ═══════════════════════════════════════════════════════════════════════════
// @mariozechner/pi-coding-agent
// ═══════════════════════════════════════════════════════════════════════════

export interface ExtensionAPI {
  registerCommand(name: string, config: CommandConfig): void;
  registerTool(tool: ToolConfig): void;
  on(event: string, handler: EventHandler): void;
  events: EventBus;
  sendUserMessage(message: string | unknown[], options?: { deliverAs?: string }): void;
}

export interface CommandConfig {
  description: string;
  handler: (args: string, ctx: ExtensionContext) => Promise<void>;
}

export interface ToolConfig {
  name: string;
  label: string;
  description: string;
  parameters: unknown;
  execute: (
    toolCallId: string,
    params: Record<string, unknown>,
    signal: AbortSignal | undefined,
    onUpdate: ((result: { content: unknown[]; details?: unknown }) => void) | undefined,
    ctx: ExtensionContext
  ) => Promise<{ content: unknown[]; details?: unknown; isError?: boolean }>;
  renderCall?: (args: unknown, theme: Theme) => unknown;
  renderResult?: (result: unknown, options: { expanded: boolean }, theme: Theme) => unknown;
}

export interface ExtensionContext {
  cwd: string;
  hasUI: boolean;
  ui: {
    notify?: (message: string, type: "info" | "warning" | "error" | "success") => void;
    confirm?: (title: string, message: string) => Promise<boolean>;
    input?: (title: string, placeholder: string) => Promise<string | null>;
    editor?: (title: string, content: string) => Promise<string | undefined>;
    setEditorText?: (text: string) => void;
    setTitle?: (title: string) => void;
    setWidget?: (id: string, lines: string[]) => void;
    setStatus?: (id: string, status: string) => void;
  };
  model: unknown;
  modelRegistry: {
    getApiKey: (model: unknown) => Promise<string>;
  };
  sessionManager: {
    getBranch: () => unknown[];
    getSessionFile: () => string;
  };
  newSession: (options: { parentSession?: string }) => Promise<{ cancelled: boolean }>;
  isIdle: () => boolean;
}

export type EventHandler = (event: unknown, ctx: ExtensionContext) => Promise<unknown>;

export interface EventBus {
  on: (event: string, handler: (data: unknown) => void) => void;
  emit: (event: string, data: unknown) => void;
}

export interface Theme {
  fg: (color: string, text: string) => string;
  bold: (text: string) => string;
}

export interface Container {
  addChild: (child: unknown) => void;
}

export interface Spacer {
  height: number;
}

export function getMarkdownTheme(): unknown;
export function BorderedLoader(
  tui: unknown,
  theme: Theme,
  message: string
): {
  signal: AbortSignal;
  onAbort: (() => void) | null;
};
export function convertToLlm(messages: unknown[]): unknown[];
export function serializeConversation(messages: unknown[]): string;

// ═══════════════════════════════════════════════════════════════════════════
// @mariozechner/pi-ai
// ═══════════════════════════════════════════════════════════════════════════

export interface Message {
  role: "user" | "assistant" | "system";
  content: unknown[];
  timestamp?: number;
  usage?: {
    input?: number;
    output?: number;
    cacheRead?: number;
    cacheWrite?: number;
    totalTokens?: number;
    cost?: { total: number };
  };
  stopReason?: string;
  errorMessage?: string;
  model?: string;
}

export interface CompleteOptions {
  apiKey: string;
  signal?: AbortSignal;
}

export interface CompleteResult {
  content: unknown[];
  stopReason: string;
}

export function complete(
  model: unknown,
  params: { systemPrompt: string; messages: Message[] },
  options: CompleteOptions
): Promise<CompleteResult>;

export function StringEnum<T extends readonly string[]>(
  values: T,
  options?: { description?: string; default?: T[number] }
): { type: "string"; enum: T };

// ═══════════════════════════════════════════════════════════════════════════
// @mariozechner/pi-tui
// ═══════════════════════════════════════════════════════════════════════════

export class Container {
  constructor();
  addChild(child: unknown): void;
}

export class Markdown {
  constructor(content: string, x: number, y: number, theme: unknown);
}

export class Spacer {
  constructor(height: number);
}

export class Text {
  constructor(text: string, x: number, y: number);
}

// ═══════════════════════════════════════════════════════════════════════════
// @mariozechner/pi-agent-core
// ═══════════════════════════════════════════════════════════════════════════

export interface AgentToolResult<T = unknown> {
  content: unknown[];
  details?: T;
  isError?: boolean;
}
