import { spawn } from 'node:child_process';

export type AcpContentBlock = {
  type?: string;
  text?: string;
  uri?: string;
  name?: string;
  [key: string]: unknown;
};

export type AcpPromptRequest = {
  prompt?: AcpContentBlock[];
  [key: string]: unknown;
};

export type AcpPromptResponse = {
  stopReason: 'end_turn' | 'max_tokens' | 'max_turn_requests' | 'refusal' | 'cancelled';
};

export type AcpSessionUpdate = {
  sessionId: string;
  update: Record<string, unknown>;
};

export type KunRuntimeLaunch = {
  baseUrl: string;
  command: string;
  args: string[];
};

export interface KunRuntimeClientOptions {
  baseUrl?: string;
  runtimeToken?: string;
  model?: string;
  title?: string;
  approvalPolicy?: string;
  sandboxMode?: string;
  autoStartRuntime?: boolean;
  runtimeCommand?: string;
  runtimeArgs?: string[];
  startupTimeoutMs?: number;
  startupPollMs?: number;
  startRuntime?: (launch: KunRuntimeLaunch) => Promise<void> | void;
  fetchImpl?: typeof fetch;
  onSessionUpdate?: (update: AcpSessionUpdate) => Promise<void> | void;
}

type KunSession = {
  sessionId: string;
};

type RuntimeEvent = {
  kind?: string;
  seq?: number;
  turnId?: string;
  item?: Record<string, unknown>;
  [key: string]: unknown;
};

const DEFAULT_RUNTIME_URL = 'http://127.0.0.1:18899';
const DEFAULT_MODEL = 'deepseek-v4-flash';
const DEFAULT_STARTUP_TIMEOUT_MS = 10_000;
const DEFAULT_STARTUP_POLL_MS = 250;

export class KunRuntimeClient {
  private readonly baseUrl: string;
  private readonly runtimeToken: string;
  private readonly model: string;
  private readonly title: string;
  private readonly approvalPolicy?: string;
  private readonly sandboxMode?: string;
  private readonly autoStartRuntime: boolean;
  private readonly runtimeCommand: string;
  private readonly runtimeArgs: string[];
  private readonly startupTimeoutMs: number;
  private readonly startupPollMs: number;
  private readonly startRuntime: (launch: KunRuntimeLaunch) => Promise<void> | void;
  private readonly fetchImpl: typeof fetch;
  private readonly onSessionUpdate?: (update: AcpSessionUpdate) => Promise<void> | void;
  private readonly lastSeqByThread = new Map<string, number>();
  private readonly activeTurns = new Map<string, { turnId: string; abort: AbortController }>();
  private runtimeStartAttempt?: Promise<void>;

  constructor(options: KunRuntimeClientOptions = {}) {
    const configuredBaseUrl = options.baseUrl || process.env.KUN_RUNTIME_URL || DEFAULT_RUNTIME_URL;
    this.baseUrl = stripTrailingSlash(configuredBaseUrl);
    this.runtimeToken = options.runtimeToken || process.env.KUN_RUNTIME_TOKEN || '';
    this.model = options.model || process.env.KUN_THREAD_MODEL || process.env.KUN_MODEL || DEFAULT_MODEL;
    this.title = options.title || 'HangCore ACP';
    this.approvalPolicy = options.approvalPolicy || process.env.KUN_APPROVAL_POLICY || undefined;
    this.sandboxMode = options.sandboxMode || process.env.KUN_SANDBOX_MODE || undefined;
    this.autoStartRuntime = options.autoStartRuntime ?? parseBool(process.env.KUN_RUNTIME_AUTO_START, this.baseUrl === DEFAULT_RUNTIME_URL);
    this.runtimeCommand = options.runtimeCommand || process.env.KUN_RUNTIME_COMMAND || 'kun';
    this.runtimeArgs =
      options.runtimeArgs ||
      splitArgs(process.env.KUN_RUNTIME_ARGS) ||
      defaultRuntimeArgs(this.baseUrl);
    this.startupTimeoutMs = options.startupTimeoutMs ?? Number(process.env.KUN_RUNTIME_STARTUP_TIMEOUT_MS || DEFAULT_STARTUP_TIMEOUT_MS);
    this.startupPollMs = options.startupPollMs ?? Number(process.env.KUN_RUNTIME_STARTUP_POLL_MS || DEFAULT_STARTUP_POLL_MS);
    this.startRuntime = options.startRuntime || startDetachedRuntime;
    this.fetchImpl = options.fetchImpl || fetch;
    this.onSessionUpdate = options.onSessionUpdate;
  }

  async createSession(input: { cwd?: string } = {}): Promise<KunSession> {
    await this.health();
    const workspace = input.cwd || process.cwd();
    const body: Record<string, unknown> = {
      title: this.title,
      titleAuto: true,
      workspace,
      model: this.model,
      mode: 'agent',
    };
    if (this.approvalPolicy) body.approvalPolicy = this.approvalPolicy;
    if (this.sandboxMode) body.sandboxMode = this.sandboxMode;

    const thread = await this.request<Record<string, unknown>>('/v1/threads', {
      method: 'POST',
      body,
    });
    const sessionId = stringField(thread, ['id', 'threadId', 'thread_id']);
    if (!sessionId) {
      throw new Error('Kun runtime did not return a thread id from POST /v1/threads');
    }
    this.lastSeqByThread.set(sessionId, 0);
    return { sessionId };
  }

  async prompt(sessionId: string, request: AcpPromptRequest): Promise<AcpPromptResponse> {
    const prompt = promptToText(request.prompt || []);
    if (!prompt.trim()) {
      throw new Error('Kun ACP adapter only supports non-empty text prompts in v0.1.2');
    }

    const started = await this.request<Record<string, unknown>>(`/v1/threads/${encodeURIComponent(sessionId)}/turns`, {
      method: 'POST',
      body: { prompt },
    });
    const turnId = stringField(started, ['turnId', 'turn_id']);
    if (!turnId) {
      throw new Error('Kun runtime did not return a turn id from POST /v1/threads/{id}/turns');
    }

    const abort = new AbortController();
    this.activeTurns.set(sessionId, { turnId, abort });
    try {
      const stopReason = await this.consumeEvents(sessionId, turnId, abort.signal);
      return { stopReason };
    } finally {
      this.activeTurns.delete(sessionId);
    }
  }

  async cancel(sessionId: string): Promise<void> {
    const active = this.activeTurns.get(sessionId);
    if (!active) return;
    active.abort.abort();
    await this.request(`/v1/threads/${encodeURIComponent(sessionId)}/turns/${encodeURIComponent(active.turnId)}/interrupt`, {
      method: 'POST',
      body: { discard: false },
    }).catch(() => undefined);
  }

  private async health(): Promise<void> {
    try {
      await this.request('/health', { method: 'GET', auth: false });
    } catch (error) {
      if (!this.autoStartRuntime || !isRuntimeUnreachable(error)) {
        throw error;
      }
      await this.ensureRuntimeStarted(error);
      await this.waitForHealth(error);
    }
  }

  private async consumeEvents(
    sessionId: string,
    turnId: string,
    signal: AbortSignal
  ): Promise<AcpPromptResponse['stopReason']> {
    const since = this.lastSeqByThread.get(sessionId) || 0;
    const response = await this.rawFetch(
      `/v1/threads/${encodeURIComponent(sessionId)}/events?since_seq=${since}`,
      { method: 'GET', signal }
    );
    if (!response.body) {
      throw new Error('Kun runtime returned an empty SSE body');
    }

    let terminal: AcpPromptResponse['stopReason'] | null = null;
    await parseSse(response.body, async ({ id, data }) => {
      if (id !== undefined) this.lastSeqByThread.set(sessionId, id);
      const event = safeJson(data) as RuntimeEvent | null;
      if (!event || (event.turnId && event.turnId !== turnId)) return true;
      if (typeof event.seq === 'number') this.lastSeqByThread.set(sessionId, event.seq);
      const update = mapKunEventToAcp(sessionId, event);
      if (update) await this.onSessionUpdate?.(update);
      terminal = terminalFromKunEvent(event) || terminal;
      return terminal === null;
    });

    return signal.aborted ? 'cancelled' : terminal || 'end_turn';
  }

  private async request<T = unknown>(
    path: string,
    init: { method: string; body?: unknown; auth?: boolean; signal?: AbortSignal }
  ): Promise<T> {
    const response = await this.rawFetch(path, init);
    return response.json() as Promise<T>;
  }

  private async rawFetch(
    path: string,
    init: { method: string; body?: unknown; auth?: boolean; signal?: AbortSignal }
  ): Promise<Response> {
    const headers = new Headers();
    if (init.body !== undefined) headers.set('content-type', 'application/json');
    if (init.auth !== false && this.runtimeToken) headers.set('authorization', `Bearer ${this.runtimeToken}`);
    let response: Response;
    try {
      response = await this.fetchImpl(`${this.baseUrl}${path}`, {
        method: init.method,
        headers,
        body: init.body === undefined ? undefined : JSON.stringify(init.body),
        signal: init.signal,
      });
    } catch (error) {
      const wrapped = new Error(
        `Kun runtime is not reachable at ${this.baseUrl}. Start Kun with \`kun serve --host 127.0.0.1 --port 18899\` or set KUN_RUNTIME_URL.`,
        { cause: error }
      );
      (wrapped as Error & { code?: string }).code = 'KUN_RUNTIME_UNREACHABLE';
      throw wrapped;
    }
    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(`Kun runtime ${init.method} ${path} failed: HTTP ${response.status}${text ? ` ${text}` : ''}`);
    }
    return response;
  }

  private async ensureRuntimeStarted(cause: unknown): Promise<void> {
    if (!this.runtimeStartAttempt) {
      const launch = { baseUrl: this.baseUrl, command: this.runtimeCommand, args: this.runtimeArgs };
      this.runtimeStartAttempt = Promise.resolve()
        .then(() => this.startRuntime(launch))
        .catch((error) => {
          this.runtimeStartAttempt = undefined;
          throw new Error(
            `Kun runtime is not reachable at ${this.baseUrl}. Auto-start failed with \`${formatCommand(launch.command, launch.args)}\`: ${errorMessage(error)}`,
            { cause: error || cause }
          );
        });
    }
    await this.runtimeStartAttempt;
  }

  private async waitForHealth(cause: unknown): Promise<void> {
    const deadline = Date.now() + Math.max(1, this.startupTimeoutMs);
    let lastError: unknown = cause;
    while (Date.now() <= deadline) {
      await sleep(Math.max(1, this.startupPollMs));
      try {
        await this.request('/health', { method: 'GET', auth: false });
        return;
      } catch (error) {
        lastError = error;
      }
    }

    throw new Error(
      `Kun runtime auto-started with \`${formatCommand(this.runtimeCommand, this.runtimeArgs)}\`, but ${this.baseUrl}/health was not ready within ${this.startupTimeoutMs}ms. Last error: ${errorMessage(lastError)}`,
      { cause: lastError }
    );
  }
}

export function promptToText(blocks: AcpContentBlock[]): string {
  return blocks
    .map((block) => {
      if (block.type === 'text' && typeof block.text === 'string') return block.text;
      if (typeof block.text === 'string') return block.text;
      if (typeof block.uri === 'string') return `[resource] ${block.name || block.uri}: ${block.uri}`;
      return '';
    })
    .filter(Boolean)
    .join('\n\n');
}

export function mapKunEventToAcp(sessionId: string, event: RuntimeEvent): AcpSessionUpdate | null {
  const text = stringField(event.item, ['text']) || stringField(event, ['text', 'message', 'displayText']);
  switch (event.kind) {
    case 'assistant_text_delta':
      if (!text) return null;
      return textUpdate(sessionId, 'agent_message_chunk', text);
    case 'assistant_reasoning_delta':
      if (!text) return null;
      return textUpdate(sessionId, 'agent_thought_chunk', text);
    case 'tool_call_started':
      return toolCallUpdate(sessionId, event, false);
    case 'tool_call_finished':
      return toolCallUpdate(sessionId, event, true);
    default:
      return null;
  }
}

function textUpdate(sessionId: string, kind: 'agent_message_chunk' | 'agent_thought_chunk', text: string): AcpSessionUpdate {
  return {
    sessionId,
    update: {
      sessionUpdate: kind,
      content: { type: 'text', text },
    },
  };
}

function toolCallUpdate(sessionId: string, event: RuntimeEvent, finished: boolean): AcpSessionUpdate | null {
  const item = event.item || {};
  const toolCallId = stringField(item, ['callId', 'call_id', 'id']) || stringField(event, ['callId', 'call_id', 'itemId']);
  if (!toolCallId) return null;
  const title = stringField(item, ['summary', 'toolName', 'tool_name']) || stringField(event, ['toolName', 'tool_name']) || 'Kun tool';
  if (!finished) {
    return {
      sessionId,
      update: {
        sessionUpdate: 'tool_call',
        toolCallId,
        title,
        kind: mapToolKind(stringField(item, ['toolKind', 'tool_kind'])),
        status: 'in_progress',
        rawInput: item.arguments || {},
      },
    };
  }
  return {
    sessionId,
    update: {
      sessionUpdate: 'tool_call_update',
      toolCallId,
      status: item.isError === true ? 'failed' : 'completed',
      rawOutput: item.output ?? {},
      content: [{ type: 'content', content: { type: 'text', text: stringifyOutput(item.output) } }],
    },
  };
}

function mapToolKind(kind?: string): 'read' | 'edit' | 'execute' {
  if (kind === 'file_change') return 'edit';
  if (kind === 'command_execution') return 'execute';
  return 'execute';
}

function stringifyOutput(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value === undefined || value === null) return '';
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function terminalFromKunEvent(event: RuntimeEvent): AcpPromptResponse['stopReason'] | null {
  switch (event.kind) {
    case 'turn_completed':
      return 'end_turn';
    case 'turn_aborted':
      return 'cancelled';
    case 'turn_failed':
    case 'error':
      return 'refusal';
    default:
      return null;
  }
}

async function parseSse(
  body: ReadableStream<Uint8Array>,
  onEvent: (event: { id?: number; event?: string; data: string }) => Promise<boolean | void> | boolean | void
): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let stoppedEarly = false;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let boundary = buffer.indexOf('\n\n');
      while (boundary >= 0) {
        const frame = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        const shouldContinue = await consumeFrame(frame, onEvent);
        if (shouldContinue === false) {
          stoppedEarly = true;
          return;
        }
        boundary = buffer.indexOf('\n\n');
      }
    }
    buffer += decoder.decode();
    if (buffer.trim()) await consumeFrame(buffer, onEvent);
  } finally {
    if (stoppedEarly) await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}

async function consumeFrame(
  frame: string,
  onEvent: (event: { id?: number; event?: string; data: string }) => Promise<boolean | void> | boolean | void
): Promise<boolean | void> {
  let id: number | undefined;
  let event: string | undefined;
  const data: string[] = [];
  for (const raw of frame.split(/\r?\n/)) {
    if (!raw || raw.startsWith(':')) continue;
    const index = raw.indexOf(':');
    const field = index >= 0 ? raw.slice(0, index) : raw;
    const value = index >= 0 ? raw.slice(index + 1).replace(/^ /, '') : '';
    if (field === 'id') {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) id = parsed;
    } else if (field === 'event') {
      event = value;
    } else if (field === 'data') {
      data.push(value);
    }
  }
  if (data.length > 0) return onEvent({ id, event, data: data.join('\n') });
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function stringField(source: unknown, keys: string[]): string | undefined {
  if (!source || typeof source !== 'object') return undefined;
  const obj = source as Record<string, unknown>;
  for (const key of keys) {
    const value = obj[key];
    if (typeof value === 'string' && value.trim()) return value;
  }
  return undefined;
}

function stripTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

function parseBool(raw: string | undefined, fallback: boolean): boolean {
  if (raw === undefined) return fallback;
  return !['0', 'false', 'no', 'off'].includes(raw.trim().toLowerCase());
}

function splitArgs(raw: string | undefined): string[] | undefined {
  const trimmed = raw?.trim();
  if (!trimmed) return undefined;
  return trimmed.split(/\s+/);
}

function defaultRuntimeArgs(baseUrl: string): string[] {
  const url = new URL(baseUrl);
  return ['serve', '--host', url.hostname, '--port', url.port || defaultPortFor(url)];
}

function defaultPortFor(url: URL): string {
  if (url.protocol === 'https:') return '443';
  return '80';
}

async function startDetachedRuntime(launch: KunRuntimeLaunch): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    let settled = false;
    const child = spawn(launch.command, launch.args, {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
    });
    child.once('error', (error) => {
      if (settled) return;
      settled = true;
      reject(error);
    });
    child.once('spawn', () => {
      if (settled) return;
      settled = true;
      child.unref();
      resolve();
    });
  });
}

function isRuntimeUnreachable(error: unknown): boolean {
  return (error as { code?: unknown })?.code === 'KUN_RUNTIME_UNREACHABLE';
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatCommand(command: string, args: string[]): string {
  return [command, ...args].map(quoteArg).join(' ');
}

function quoteArg(value: string): string {
  if (!/[\s"'`]/.test(value)) return value;
  return JSON.stringify(value);
}
