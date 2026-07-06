import { afterEach, describe, expect, test } from 'bun:test';
import { handleLine, KunAcpAgent } from '../src/acpServer';

const servers: Array<{ stop: () => Promise<void> }> = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.stop()));
});

function startFakeKun(events: unknown[]) {
  const server = Bun.serve({
    port: 0,
    async fetch(request) {
      const url = new URL(request.url);
      if (url.pathname === '/health') {
        return Response.json({ status: 'ok' });
      }
      if (url.pathname === '/v1/threads' && request.method === 'POST') {
        return Response.json({ id: 'thread-kun-1' }, { status: 201 });
      }
      if (url.pathname === '/v1/threads/thread-kun-1/turns' && request.method === 'POST') {
        return Response.json({ turnId: 'turn-kun-1' }, { status: 202 });
      }
      if (url.pathname === '/v1/threads/thread-kun-1/events') {
        const stream = new ReadableStream<Uint8Array>({
          start(controller) {
            const enc = new TextEncoder();
            for (const event of events) {
              controller.enqueue(enc.encode(`id: ${(event as { seq?: number }).seq ?? 1}\n`));
              controller.enqueue(enc.encode(`event: ${(event as { kind?: string }).kind || 'message'}\n`));
              controller.enqueue(enc.encode(`data: ${JSON.stringify(event)}\n\n`));
            }
            controller.close();
          },
        });
        return new Response(stream, { headers: { 'content-type': 'text/event-stream' } });
      }
      if (url.pathname === '/v1/approvals/approval-1' && request.method === 'POST') {
        return Response.json({ approvalId: 'approval-1', decision: 'allow', status: 'allowed' });
      }
      return Response.json({ message: 'not found' }, { status: 404 });
    },
  });
  servers.push({ stop: () => server.stop(true) });
  return `http://127.0.0.1:${server.port}`;
}

function makeWriter() {
  const lines: string[] = [];
  return {
    lines,
    writer: {
      write(chunk: string) {
        lines.push(...chunk.trim().split('\n').filter(Boolean));
        return true;
      },
    },
  };
}

async function waitForMessage(lines: string[], predicate: (message: Record<string, unknown>) => boolean) {
  const deadline = Date.now() + 250;
  while (Date.now() <= deadline) {
    for (const line of lines) {
      const message = JSON.parse(line) as Record<string, unknown>;
      if (predicate(message)) return message;
    }
    await Bun.sleep(5);
  }
  throw new Error('timed out waiting for JSON-RPC message');
}

describe('KunAcpAgent JSON-RPC stdio bridge', () => {
  test('writes JSON-RPC 2.0 responses for client requests', async () => {
    const { lines, writer } = makeWriter();
    const agent = new KunAcpAgent(writer);

    await handleLine(
      JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: 1 } }),
      agent,
      writer
    );

    expect(JSON.parse(lines[0])).toEqual(
      expect.objectContaining({
        jsonrpc: '2.0',
        id: 1,
        result: expect.objectContaining({
          protocolVersion: 1,
          agentInfo: { name: 'Kun ACP Adapter', version: '0.1.9' },
        }),
      })
    );
  });

  test('writes JSON-RPC 2.0 session/update notifications while streaming Kun output', async () => {
    const baseUrl = startFakeKun([
      {
        kind: 'assistant_text_delta',
        seq: 1,
        turnId: 'turn-kun-1',
        item: { text: 'hello from Kun loop' },
      },
      { kind: 'turn_completed', seq: 2, turnId: 'turn-kun-1' },
    ]);
    const { lines, writer } = makeWriter();
    const agent = new KunAcpAgent(writer, { baseUrl });

    await handleLine(
      JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'session/new', params: { cwd: '/tmp/project' } }),
      agent,
      writer
    );
    await handleLine(
      JSON.stringify({
        jsonrpc: '2.0',
        id: 2,
        method: 'session/prompt',
        params: { sessionId: 'thread-kun-1', prompt: [{ type: 'text', text: 'ping' }] },
      }),
      agent,
      writer
    );

    const messages = lines.map((line) => JSON.parse(line));
    expect(messages.every((message) => message.jsonrpc === '2.0')).toBe(true);
    expect(messages).toContainEqual(
      expect.objectContaining({
        jsonrpc: '2.0',
        method: 'session/update',
        params: {
          sessionId: 'thread-kun-1',
          update: {
            sessionUpdate: 'agent_message_chunk',
            content: { type: 'text', text: 'hello from Kun loop' },
          },
        },
      })
    );
    expect(messages).toContainEqual(
      expect.objectContaining({
        jsonrpc: '2.0',
        id: 2,
        result: { stopReason: 'end_turn' },
      })
    );
  });

  test('sends ACP permission requests and resolves them from client JSON-RPC responses', async () => {
    const baseUrl = startFakeKun([
      {
        kind: 'approval_requested',
        seq: 1,
        threadId: 'thread-kun-1',
        turnId: 'turn-kun-1',
        approvalId: 'approval-1',
        toolName: 'shell',
        status: 'pending',
        summary: 'Run npm test',
      },
      { kind: 'turn_completed', seq: 2, threadId: 'turn-kun-1' },
    ]);
    const { lines, writer } = makeWriter();
    const agent = new KunAcpAgent(writer, { baseUrl });

    const promptCall = handleLine(
      JSON.stringify({
        jsonrpc: '2.0',
        id: 2,
        method: 'session/prompt',
        params: { sessionId: 'thread-kun-1', prompt: [{ type: 'text', text: 'ping' }] },
      }),
      agent,
      writer
    );

    const permissionRequest = await waitForMessage(
      lines,
      (message) => message.method === 'session/request_permission'
    );
    expect(permissionRequest).toEqual(
      expect.objectContaining({
        jsonrpc: '2.0',
        method: 'session/request_permission',
        params: expect.objectContaining({
          sessionId: 'thread-kun-1',
          toolCall: expect.objectContaining({
            toolCallId: 'approval-1',
            title: 'shell',
          }),
        }),
      })
    );

    await handleLine(
      JSON.stringify({
        jsonrpc: '2.0',
        id: permissionRequest.id,
        result: { outcome: { outcome: 'selected', optionId: 'allow_once' } },
      }),
      agent,
      writer
    );
    await promptCall;

    const messages = lines.map((line) => JSON.parse(line));
    expect(messages).toContainEqual(
      expect.objectContaining({
        jsonrpc: '2.0',
        id: 2,
        result: { stopReason: 'end_turn' },
      })
    );
    expect(messages).not.toContainEqual(
      expect.objectContaining({
        error: expect.objectContaining({ message: 'Invalid JSON-RPC request' }),
      })
    );
  });
});
