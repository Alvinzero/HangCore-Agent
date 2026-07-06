import { createInterface } from 'node:readline';
import { KunRuntimeClient } from './kunClient';

type JsonRpcRequest = {
  id?: string | number | null;
  method?: string;
  params?: Record<string, unknown>;
  result?: unknown;
  error?: unknown;
};

type RpcWriter = {
  write: (chunk: string) => boolean;
};

const PROTOCOL_VERSION = 1;

export class KunAcpAgent {
  private readonly client: KunRuntimeClient;
  private readonly peer: JsonRpcPeer;

  constructor(writer: RpcWriter, options: ConstructorParameters<typeof KunRuntimeClient>[0] = {}) {
    this.peer = new JsonRpcPeer(writer);
    this.client = new KunRuntimeClient({
      ...options,
      onSessionUpdate: async (params) => {
        this.peer.notify('session/update', params);
      },
      requestPermission: async (request) => {
        const response = await this.peer.request('session/request_permission', request);
        return parsePermissionResponse(response);
      },
      requestUserInput: async (request) => {
        return requestUserInputWithPermissionCard(this.peer, request);
      },
    });
  }

  receiveResponse(response: JsonRpcRequest): boolean {
    return this.peer.receiveResponse(response);
  }

  async handle(method: string, params: Record<string, unknown> = {}): Promise<unknown> {
    switch (method) {
      case 'initialize':
        return {
          protocolVersion: typeof params.protocolVersion === 'number' ? params.protocolVersion : PROTOCOL_VERSION,
          agentInfo: { name: 'Kun ACP Adapter', version: '0.1.10' },
          agentCapabilities: {
            loadSession: false,
            promptCapabilities: {},
            sessionCapabilities: {},
          },
          authMethods: [],
        };
      case 'authenticate':
        return {};
      case 'session/new': {
        const session = await this.client.createSession({ cwd: typeof params.cwd === 'string' ? params.cwd : undefined });
        return { sessionId: session.sessionId };
      }
      case 'session/prompt': {
        const sessionId = requireString(params.sessionId, 'sessionId');
        return this.client.prompt(sessionId, params);
      }
      case 'session/cancel': {
        const sessionId = requireString(params.sessionId, 'sessionId');
        await this.client.cancel(sessionId);
        return {};
      }
      case 'session/set_mode':
      case 'session/set_model':
      case 'session/set_config_option':
        return {};
      default:
        throw Object.assign(new Error(`Kun ACP adapter does not implement method: ${method}`), {
          code: -32601,
        });
    }
  }
}

export async function startStdio(options: ConstructorParameters<typeof KunRuntimeClient>[0] = {}): Promise<void> {
  const writer = process.stdout;
  const agent = new KunAcpAgent(writer, options);
  const rl = createInterface({ input: process.stdin, crlfDelay: Infinity });
  for await (const line of rl) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    await handleLine(trimmed, agent, writer);
  }
}

export async function handleLine(line: string, agent: KunAcpAgent, writer: RpcWriter): Promise<void> {
  let request: JsonRpcRequest;
  try {
    request = JSON.parse(line) as JsonRpcRequest;
  } catch (error) {
    writeError(writer, null, error, -32700);
    return;
  }
  if (!request.method) {
    if (agent.receiveResponse(request)) return;
    if (request.id !== undefined && request.id !== null) {
      writeError(writer, request.id, Object.assign(new Error('Invalid JSON-RPC request'), { code: -32600 }));
    }
    return;
  }
  try {
    const result = await agent.handle(request.method, request.params || {});
    if (request.id !== undefined && request.id !== null) {
      writeResponse(writer, request.id, result);
    }
  } catch (error) {
    if (request.id !== undefined && request.id !== null) {
      writeError(writer, request.id, error);
    }
  }
}

function writeResponse(writer: RpcWriter, id: string | number | null, result: unknown): void {
  writer.write(`${JSON.stringify({ jsonrpc: '2.0', id, result })}\n`);
}

function writeError(writer: RpcWriter, id: string | number | null, error: unknown, fallbackCode = -32603): void {
  writer.write(`${JSON.stringify({ jsonrpc: '2.0', id, error: toRpcError(error, fallbackCode) })}\n`);
}

function writeNotification(writer: RpcWriter, method: string, params: unknown): void {
  writer.write(`${JSON.stringify({ jsonrpc: '2.0', method, params })}\n`);
}

type PendingRpc = {
  resolve: (value: unknown) => void;
  reject: (error: unknown) => void;
};

class JsonRpcPeer {
  private nextId = 1;
  private readonly pending = new Map<string | number, PendingRpc>();

  constructor(private readonly writer: RpcWriter) {}

  notify(method: string, params: unknown): void {
    writeNotification(this.writer, method, params);
  }

  request(method: string, params: unknown): Promise<unknown> {
    const id = this.nextId++;
    this.writer.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
    });
  }

  receiveResponse(message: JsonRpcRequest): boolean {
    if (message.id === undefined || message.id === null) return false;
    if (!Object.prototype.hasOwnProperty.call(message, 'result') && !Object.prototype.hasOwnProperty.call(message, 'error')) {
      return false;
    }
    const pending = this.pending.get(message.id);
    if (!pending) return false;
    this.pending.delete(message.id);
    if (message.error !== undefined && message.error !== null) {
      pending.reject(rpcResponseError(message.error));
    } else {
      pending.resolve(message.result);
    }
    return true;
  }
}

function parsePermissionResponse(response: unknown):
  | { outcome: 'selected'; optionId: string }
  | { outcome: 'cancelled' } {
  const outcome = objectField(response, ['outcome']);
  const outcomeKind = stringField(outcome, ['outcome']);
  if (outcomeKind === 'selected') {
    const optionId = stringField(outcome, ['optionId', 'option_id']);
    if (optionId) return { outcome: 'selected', optionId };
  }
  return { outcome: 'cancelled' };
}

async function requestUserInputWithPermissionCard(
  peer: JsonRpcPeer,
  request: {
    sessionId: string;
    inputId: string;
    prompt?: string;
    questions?: Array<{
      header?: string;
      id?: string;
      question?: string;
      options?: Array<{ label?: string; description?: string }>;
    }>;
  }
): Promise<{ cancelled: boolean; answers?: Array<{ id: string; label: string; value: string }> }> {
  const question = request.questions?.find((item) => item?.id && item.options?.length);
  if (!question || !question.id || !question.options?.length) return { cancelled: true };
  const options = question.options.map((option, index) => ({
    optionId: `answer:${question.id}:${index}`,
    name: option.label || `Option ${index + 1}`,
    kind: 'allow_once' as const,
  }));
  options.push({ optionId: 'cancel', name: 'Cancel', kind: 'reject_once' as const });

  const response = await peer.request('session/request_permission', {
    sessionId: request.sessionId,
    toolCall: {
      toolCallId: request.inputId,
      title: question.header || 'Kun user input',
      kind: 'execute',
      status: 'pending',
      rawInput: {
        description: request.prompt || question.question || 'Kun requested user input',
        prompt: request.prompt,
        question: question.question,
      },
    },
    options,
  });
  const parsed = parsePermissionResponse(response);
  if (parsed.outcome !== 'selected' || parsed.optionId === 'cancel') return { cancelled: true };
  const [, questionId, rawIndex] = parsed.optionId.split(':');
  const index = Number(rawIndex);
  const selected = Number.isInteger(index) ? question.options[index] : undefined;
  if (!questionId || !selected) return { cancelled: true };
  const label = selected.label || `Option ${index + 1}`;
  return {
    cancelled: false,
    answers: [{ id: questionId, label, value: label }],
  };
}

function rpcResponseError(error: unknown): Error {
  if (error && typeof error === 'object') {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string') return new Error(message);
  }
  return new Error(String(error));
}

function objectField(source: unknown, keys: string[]): Record<string, unknown> | undefined {
  if (!source || typeof source !== 'object') return undefined;
  const obj = source as Record<string, unknown>;
  for (const key of keys) {
    const value = obj[key];
    if (value && typeof value === 'object') return value as Record<string, unknown>;
  }
  return undefined;
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

function requireString(value: unknown, name: string): string {
  if (typeof value === 'string' && value.trim()) return value;
  throw Object.assign(new Error(`Missing required ACP field: ${name}`), { code: -32602 });
}

function toRpcError(error: unknown, fallbackCode = -32603): { code: number; message: string } {
  const code = typeof (error as { code?: unknown })?.code === 'number' ? (error as { code: number }).code : fallbackCode;
  const message = error instanceof Error ? error.message : String(error);
  return { code, message };
}
