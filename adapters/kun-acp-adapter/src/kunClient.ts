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

export type AcpPermissionRequest = {
  sessionId: string;
  toolCall: {
    toolCallId: string;
    title?: string;
    kind?: 'read' | 'edit' | 'execute';
    status?: 'pending' | 'in_progress' | 'completed' | 'failed';
    rawInput?: Record<string, unknown>;
  };
  options: Array<{
    optionId: string;
    name: string;
    kind: 'allow_once' | 'allow_always' | 'reject_once' | 'reject_always';
  }>;
  _meta?: Record<string, unknown>;
};

export type AcpPermissionDecision =
  | { outcome: 'selected'; optionId: string }
  | { outcome: 'cancelled' };

export type KunUserInputRequest = {
  sessionId: string;
  inputId: string;
  prompt?: string;
  questions?: Array<{
    header?: string;
    id?: string;
    question?: string;
    options?: Array<{ label?: string; description?: string }>;
  }>;
};

export type KunUserInputDecision =
  | { cancelled: true; answers?: undefined }
  | { cancelled?: false; answers: Array<{ id: string; label: string; value: string }> };

export type KunRuntimeLaunch = {
  baseUrl: string;
  command: string;
  args: string[];
};

type ProviderFallbackOptions = {
  provider: string;
  apiKey: string;
  baseUrl: string;
  apiPath: string;
  model: string;
  fetchImpl: typeof fetch;
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
  providerFallback?: boolean;
  startRuntime?: (launch: KunRuntimeLaunch) => Promise<void> | void;
  fetchImpl?: typeof fetch;
  onSessionUpdate?: (update: AcpSessionUpdate) => Promise<void> | void;
  requestPermission?: (request: AcpPermissionRequest) => Promise<AcpPermissionDecision> | AcpPermissionDecision;
  requestUserInput?: (request: KunUserInputRequest) => Promise<KunUserInputDecision> | KunUserInputDecision;
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
  private readonly providerFallback: ProviderFallbackClient | null;
  private readonly onSessionUpdate?: (update: AcpSessionUpdate) => Promise<void> | void;
  private readonly requestPermission?: (request: AcpPermissionRequest) => Promise<AcpPermissionDecision> | AcpPermissionDecision;
  private readonly requestUserInput?: (request: KunUserInputRequest) => Promise<KunUserInputDecision> | KunUserInputDecision;
  private readonly lastSeqByThread = new Map<string, number>();
  private readonly activeTurns = new Map<string, { turnId: string; abort: AbortController }>();
  private readonly fallbackSessions = new Set<string>();
  private fallbackSessionSeq = 0;
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
    this.providerFallback = isProviderFallbackEnabled(options.providerFallback)
      ? ProviderFallbackClient.fromEnv(this.model, this.fetchImpl)
      : null;
    this.onSessionUpdate = options.onSessionUpdate;
    this.requestPermission = options.requestPermission;
    this.requestUserInput = options.requestUserInput;
  }

  async createSession(input: { cwd?: string } = {}): Promise<KunSession> {
    try {
      await this.health();
    } catch (error) {
      const fallback = this.providerFallback;
      if (!fallback) throw runtimeRequiredError(error);
      const sessionId = `provider-fallback-${Date.now().toString(36)}-${++this.fallbackSessionSeq}`;
      this.fallbackSessions.add(sessionId);
      return { sessionId };
    }
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
    if (this.isProviderFallbackSession(sessionId)) {
      return this.promptWithProviderFallback(sessionId, request);
    }
    const prompt = promptToText(request.prompt || []);
    if (!prompt.trim()) {
      throw new Error('Kun ACP adapter only supports non-empty text prompts in v0.1.5');
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
    if (this.isProviderFallbackSession(sessionId)) return;
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
      await this.resolveInteractiveEvent(sessionId, event);
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

  private async promptWithProviderFallback(sessionId: string, request: AcpPromptRequest): Promise<AcpPromptResponse> {
    const prompt = promptToText(request.prompt || []);
    if (!prompt.trim()) {
      throw new Error('Kun ACP adapter only supports non-empty text prompts in v0.1.5');
    }
    const text = await this.providerFallback!.complete(prompt);
    if (text) {
      await this.onSessionUpdate?.(textUpdate(sessionId, 'agent_message_chunk', text));
    }
    return { stopReason: 'end_turn' };
  }

  private isProviderFallbackSession(sessionId: string): boolean {
    return (
      this.fallbackSessions.has(sessionId) ||
      (this.providerFallback !== null && sessionId.startsWith('provider-fallback-'))
    );
  }

  private async resolveInteractiveEvent(sessionId: string, event: RuntimeEvent): Promise<void> {
    if (event.kind === 'approval_requested') {
      await this.resolveApprovalRequest(sessionId, event);
    } else if (event.kind === 'user_input_requested') {
      await this.resolveUserInputRequest(sessionId, event);
    }
  }

  private async resolveApprovalRequest(sessionId: string, event: RuntimeEvent): Promise<void> {
    const request = permissionRequestFromKunEvent(sessionId, event);
    if (!request) return;
    const decision = this.requestPermission ? await this.requestPermission(request) : { outcome: 'cancelled' as const };
    const body = permissionDecisionToKunBody(decision);
    await this.request(`/v1/approvals/${encodeURIComponent(request.toolCall.toolCallId)}`, {
      method: 'POST',
      body,
    });
  }

  private async resolveUserInputRequest(sessionId: string, event: RuntimeEvent): Promise<void> {
    const request = userInputRequestFromKunEvent(sessionId, event);
    if (!request) return;
    const decision = this.requestUserInput ? await this.requestUserInput(request) : { cancelled: true as const };
    const body = decision.cancelled ? { cancelled: true } : { answers: decision.answers };
    await this.request(`/v1/user-inputs/${encodeURIComponent(request.inputId)}`, {
      method: 'POST',
      body,
    });
  }
}

class ProviderFallbackClient {
  private constructor(private readonly options: ProviderFallbackOptions) {}

  static fromEnv(model: string, fetchImpl: typeof fetch): ProviderFallbackClient | null {
    const provider = (process.env.KUN_PROVIDER || process.env.PROVIDER || 'openai').trim().toLowerCase();
    const apiKey =
      process.env.KUN_API_KEY ||
      process.env.OPENAI_API_KEY ||
      process.env.ANTHROPIC_API_KEY ||
      process.env.API_KEY ||
      '';
    const baseUrl =
      process.env.KUN_BASE_URL ||
      process.env.OPENAI_BASE_URL ||
      process.env.ANTHROPIC_BASE_URL ||
      process.env.BASE_URL ||
      '';
    if (!apiKey.trim() || !baseUrl.trim()) return null;
    return new ProviderFallbackClient({
      provider,
      apiKey,
      baseUrl,
      apiPath: process.env.KUN_API_PATH || defaultProviderApiPath(provider),
      model,
      fetchImpl,
    });
  }

  async complete(prompt: string): Promise<string> {
    if (this.options.provider === 'anthropic') {
      return this.completeAnthropic(prompt);
    }
    return this.completeOpenAICompatible(prompt);
  }

  private async completeOpenAICompatible(prompt: string): Promise<string> {
    const response = await this.options.fetchImpl(providerEndpoint(this.options.baseUrl, this.options.apiPath), {
      method: 'POST',
      headers: {
        authorization: `Bearer ${this.options.apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: this.options.model,
        messages: [{ role: 'user', content: prompt }],
        stream: false,
      }),
    });
    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(`Injected model provider request failed: HTTP ${response.status}${text ? ` ${text}` : ''}`);
    }
    const payload = await response.json();
    const content = firstOpenAICompatibleContent(payload);
    if (!content) throw new Error('Injected model provider returned an empty response');
    return content;
  }

  private async completeAnthropic(prompt: string): Promise<string> {
    const response = await this.options.fetchImpl(providerEndpoint(this.options.baseUrl, this.options.apiPath), {
      method: 'POST',
      headers: {
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
        'x-api-key': this.options.apiKey,
      },
      body: JSON.stringify({
        model: this.options.model,
        max_tokens: 4096,
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(`Injected Anthropic provider request failed: HTTP ${response.status}${text ? ` ${text}` : ''}`);
    }
    const payload = await response.json();
    const content = contentToText((payload as { content?: unknown }).content);
    if (!content) throw new Error('Injected Anthropic provider returned an empty response');
    return content;
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
    case 'tool_call_ready':
      return toolCallReadyUpdate(sessionId, event);
    case 'tool_call_finished':
      return toolCallUpdate(sessionId, event, true);
    case 'item_created':
    case 'item_updated':
      if ((event.item as { kind?: unknown } | undefined)?.kind === 'tool_call') {
        return toolCallUpdate(sessionId, event, false);
      }
      return null;
    case 'item_completed':
      if ((event.item as { kind?: unknown } | undefined)?.kind === 'tool_call') {
        return toolCallUpdate(sessionId, event, true);
      }
      return null;
    default:
      return null;
  }
}

function permissionRequestFromKunEvent(sessionId: string, event: RuntimeEvent): AcpPermissionRequest | null {
  const approvalId = stringField(event, ['approvalId', 'approval_id']) || stringField(event.item, ['approvalId', 'approval_id', 'id']);
  if (!approvalId) return null;
  const toolName = stringField(event, ['toolName', 'tool_name']) || stringField(event.item, ['toolName', 'tool_name']) || 'Kun tool';
  const summary = stringField(event, ['summary', 'displayText', 'message']) || stringField(event.item, ['summary', 'text']);
  const rawInput: Record<string, unknown> = {
    description: summary || `Kun requests permission for ${toolName}`,
    toolName,
  };
  const approvalPolicy = stringField(event, ['approvalPolicy', 'approval_policy']);
  const sandboxMode = stringField(event, ['sandboxMode', 'sandbox_mode']);
  if (approvalPolicy) rawInput.approvalPolicy = approvalPolicy;
  if (sandboxMode) rawInput.sandboxMode = sandboxMode;
  return {
    sessionId,
    toolCall: {
      toolCallId: approvalId,
      title: toolName,
      kind: 'execute',
      status: 'pending',
      rawInput,
    },
    options: [
      { optionId: 'allow_once', name: 'Allow once', kind: 'allow_once' },
      { optionId: 'reject_once', name: 'Reject', kind: 'reject_once' },
    ],
    _meta: {
      kunEventKind: event.kind,
      ...(typeof event.seq === 'number' ? { kunSeq: event.seq } : {}),
    },
  };
}

function userInputRequestFromKunEvent(sessionId: string, event: RuntimeEvent): KunUserInputRequest | null {
  const inputId = stringField(event, ['inputId', 'input_id']) || stringField(event.item, ['inputId', 'input_id', 'id']);
  if (!inputId) return null;
  return {
    sessionId,
    inputId,
    prompt: stringField(event, ['prompt']) || stringField(event.item, ['prompt']),
    questions: questionsFromKunEvent(event),
  };
}

function questionsFromKunEvent(event: RuntimeEvent): KunUserInputRequest['questions'] {
  const questions = (event.questions || (event.item as { questions?: unknown } | undefined)?.questions) as unknown;
  if (!Array.isArray(questions)) return undefined;
  return questions
    .filter((question): question is Record<string, unknown> => Boolean(question && typeof question === 'object'))
    .map((question) => ({
      header: stringField(question, ['header']),
      id: stringField(question, ['id']),
      question: stringField(question, ['question']),
      options: optionsFromQuestion(question),
    }));
}

function optionsFromQuestion(question: Record<string, unknown>): Array<{ label?: string; description?: string }> | undefined {
  const options = question.options;
  if (!Array.isArray(options)) return undefined;
  return options
    .filter((option): option is Record<string, unknown> => Boolean(option && typeof option === 'object'))
    .map((option) => ({
      label: stringField(option, ['label']),
      description: stringField(option, ['description']) || '',
    }));
}

function permissionDecisionToKunBody(decision: AcpPermissionDecision): { decision: 'allow' | 'deny'; reason?: string } {
  if (decision.outcome !== 'selected') {
    return { decision: 'deny', reason: 'cancelled' };
  }
  const option = decision.optionId.toLowerCase();
  if (option.includes('allow')) return { decision: 'allow' };
  return { decision: 'deny' };
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

function toolCallReadyUpdate(sessionId: string, event: RuntimeEvent): AcpSessionUpdate | null {
  const toolCallId = stringField(event, ['callId', 'call_id', 'itemId']);
  if (!toolCallId) return null;
  const title = stringField(event, ['toolName', 'tool_name']) || 'Kun tool';
  return {
    sessionId,
    update: {
      sessionUpdate: 'tool_call',
      toolCallId,
      title,
      kind: 'execute',
      status: 'pending',
      rawInput: { readyCount: numberField(event, ['readyCount', 'ready_count']) ?? 1 },
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

function numberField(source: unknown, keys: string[]): number | undefined {
  if (!source || typeof source !== 'object') return undefined;
  const obj = source as Record<string, unknown>;
  for (const key of keys) {
    const value = obj[key];
    if (typeof value === 'number' && Number.isFinite(value)) return value;
  }
  return undefined;
}

function firstOpenAICompatibleContent(payload: unknown): string {
  const choices = (payload as { choices?: unknown[] })?.choices;
  const first = Array.isArray(choices) ? (choices[0] as Record<string, unknown> | undefined) : undefined;
  if (!first) return '';
  const message = first.message as Record<string, unknown> | undefined;
  return (
    contentToText(message?.content) ||
    contentToText(first.text) ||
    contentToText((first.delta as Record<string, unknown> | undefined)?.content)
  );
}

function contentToText(value: unknown): string {
  if (typeof value === 'string') return value;
  if (!Array.isArray(value)) return '';
  return value
    .map((part) => {
      if (typeof part === 'string') return part;
      if (!part || typeof part !== 'object') return '';
      const obj = part as Record<string, unknown>;
      return typeof obj.text === 'string' ? obj.text : '';
    })
    .filter(Boolean)
    .join('');
}

function stripTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

function defaultProviderApiPath(provider: string): string {
  return provider === 'anthropic' ? '/v1/messages' : '/v1/chat/completions';
}

function providerEndpoint(baseUrl: string, apiPath: string): string {
  const base = stripTrailingSlash(baseUrl.trim());
  const path = apiPath.trim();
  if (!path) return base;
  if (/^https?:\/\//i.test(path)) return stripTrailingSlash(path);
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  if (base.endsWith('/chat/completions') || base.endsWith('/messages')) return base;
  if (base.endsWith('/v1') && normalizedPath.startsWith('/v1/')) {
    return `${base}${normalizedPath.slice('/v1'.length)}`;
  }
  return `${base}${normalizedPath}`;
}

function parseBool(raw: string | undefined, fallback: boolean): boolean {
  if (raw === undefined) return fallback;
  return !['0', 'false', 'no', 'off'].includes(raw.trim().toLowerCase());
}

function isProviderFallbackEnabled(option?: boolean): boolean {
  if (option !== undefined) return option;
  return parseBool(process.env.KUN_PROVIDER_FALLBACK ?? process.env.KUN_ALLOW_PROVIDER_FALLBACK, false);
}

function runtimeRequiredError(error: unknown): Error {
  if (!hasInjectedProviderEnv() || !(error instanceof Error)) {
    return error instanceof Error ? error : new Error(String(error));
  }
  const wrapped = new Error(
    `${error.message} System model provider settings were injected for Kun runtime, but HangCore will not bypass the native Kun Agent loop by default. Start Kun runtime, or set KUN_PROVIDER_FALLBACK=1 only for a provider-only diagnostic fallback.`,
    { cause: error }
  );
  (wrapped as Error & { code?: unknown }).code = (error as Error & { code?: unknown }).code;
  return wrapped;
}

function hasInjectedProviderEnv(): boolean {
  return Boolean(
    process.env.KUN_API_KEY ||
      process.env.KUN_BASE_URL ||
      process.env.OPENAI_API_KEY ||
      process.env.ANTHROPIC_API_KEY ||
      process.env.API_KEY ||
      process.env.BASE_URL
  );
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
