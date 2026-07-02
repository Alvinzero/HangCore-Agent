import { createInterface } from 'node:readline';
import { KunRuntimeClient } from './kunClient';

type JsonRpcRequest = {
  id?: string | number | null;
  method?: string;
  params?: Record<string, unknown>;
};

type RpcWriter = {
  write: (chunk: string) => boolean;
};

const PROTOCOL_VERSION = 1;

export class KunAcpAgent {
  private readonly client: KunRuntimeClient;

  constructor(writer: RpcWriter, options: ConstructorParameters<typeof KunRuntimeClient>[0] = {}) {
    this.client = new KunRuntimeClient({
      ...options,
      onSessionUpdate: async (params) => {
        writeNotification(writer, 'session/update', params);
      },
    });
  }

  async handle(method: string, params: Record<string, unknown> = {}): Promise<unknown> {
    switch (method) {
      case 'initialize':
        return {
          protocolVersion: typeof params.protocolVersion === 'number' ? params.protocolVersion : PROTOCOL_VERSION,
          agentInfo: { name: 'Kun ACP Adapter', version: '0.1.2' },
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
    if (request.id !== undefined) {
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

function requireString(value: unknown, name: string): string {
  if (typeof value === 'string' && value.trim()) return value;
  throw Object.assign(new Error(`Missing required ACP field: ${name}`), { code: -32602 });
}

function toRpcError(error: unknown, fallbackCode = -32603): { code: number; message: string } {
  const code = typeof (error as { code?: unknown })?.code === 'number' ? (error as { code: number }).code : fallbackCode;
  const message = error instanceof Error ? error.message : String(error);
  return { code, message };
}
