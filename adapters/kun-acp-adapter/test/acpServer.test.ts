import { afterEach, describe, expect, test } from 'bun:test';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
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
      if (url.pathname.startsWith('/v1/user-inputs/') && request.method === 'POST') {
        const body = await request.json().catch(() => undefined);
        return Response.json({
          inputId: decodeURIComponent(url.pathname.split('/').pop() || ''),
          status: body?.cancelled ? 'cancelled' : 'submitted',
          answers: body?.answers ?? [],
        });
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

async function waitForMessage(
  lines: string[],
  predicate: (message: Record<string, unknown>) => boolean,
  timeoutMs = 250
) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() <= deadline) {
    for (const line of lines) {
      const message = JSON.parse(line) as Record<string, unknown>;
      if (predicate(message)) return message;
    }
    await Bun.sleep(5);
  }
  throw new Error('timed out waiting for JSON-RPC message');
}

function startAdapterCli(baseUrl: string) {
  const child = spawn(
    process.execPath,
    [fileURLToPath(new URL('../src/cli.ts', import.meta.url)), '--stdio', '--runtime-url', baseUrl],
    {
      cwd: fileURLToPath(new URL('..', import.meta.url)),
      env: { ...process.env, KUN_RUNTIME_AUTO_START: '0' },
      stdio: ['pipe', 'pipe', 'pipe'],
    }
  );
  const lines: string[] = [];
  let buffer = '';
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', (chunk: string) => {
    buffer += chunk;
    while (buffer.includes('\n')) {
      const newline = buffer.indexOf('\n');
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      if (line) lines.push(line);
    }
  });
  return { child, lines };
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
          agentInfo: { name: 'Kun ACP Adapter', version: '0.1.13' },
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

  test('converts Kun user_input tool calls into selectable ACP permission cards', async () => {
    const baseUrl = startFakeKun([
      {
        kind: 'item_created',
        seq: 1,
        threadId: 'thread-kun-1',
        turnId: 'turn-kun-1',
        item: {
          kind: 'tool_call',
          id: 'call-user-input-1',
          summary: 'user_input',
          arguments: {
            question: '你想在什么平台上跑这个 LED 轮流亮灯的程序？',
            options: [
              { label: 'Arduino (C++)', description: '用 Arduino 开发板控制物理 LED' },
              { label: 'Web 仿真 (HTML/JS)', description: '在浏览器里模拟 LED 轮流亮灯' },
            ],
          },
        },
      },
      { kind: 'turn_completed', seq: 2, threadId: 'thread-kun-1', turnId: 'turn-kun-1' },
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
            toolCallId: 'call-user-input-1',
            title: '用户输入',
            rawInput: expect.objectContaining({
              inputKind: 'user_input',
              question: '你想在什么平台上跑这个 LED 轮流亮灯的程序？',
              options: [
                { label: 'Arduino (C++)', description: '用 Arduino 开发板控制物理 LED' },
                { label: 'Web 仿真 (HTML/JS)', description: '在浏览器里模拟 LED 轮流亮灯' },
              ],
            }),
          }),
          options: [
            expect.objectContaining({ optionId: 'answer:answer:0', name: 'Arduino (C++)' }),
            expect.objectContaining({ optionId: 'answer:answer:1', name: 'Web 仿真 (HTML/JS)' }),
            expect.objectContaining({ optionId: 'cancel', name: '取消' }),
          ],
        }),
      })
    );
    expect(lines.map((line) => JSON.parse(line))).not.toContainEqual(
      expect.objectContaining({
        method: 'session/update',
        params: expect.objectContaining({
          update: expect.objectContaining({
            sessionUpdate: 'tool_call',
            title: 'user_input',
          }),
        }),
      })
    );

    await handleLine(
      JSON.stringify({
        jsonrpc: '2.0',
        id: permissionRequest.id,
        result: { outcome: { outcome: 'selected', optionId: 'answer:answer:0' } },
      }),
      agent,
      writer
    );
    await promptCall;

    expect(lines.map((line) => JSON.parse(line))).toContainEqual(
      expect.objectContaining({
        jsonrpc: '2.0',
        id: 2,
        result: { stopReason: 'end_turn' },
      })
    );
  });

  test('processes permission responses while a stdio session/prompt request is still running', async () => {
    const baseUrl = startFakeKun([
      {
        kind: 'item_created',
        seq: 1,
        threadId: 'thread-kun-1',
        turnId: 'turn-kun-1',
        item: {
          kind: 'tool_call',
          id: 'call-user-input-1',
          toolName: 'user_input',
          arguments: {
            question: '目标芯片/平台是什么？',
            options: [{ label: 'HK64S825', description: '航顺 8 位 MCU' }],
          },
        },
      },
      {
        kind: 'user_input_requested',
        seq: 2,
        threadId: 'thread-kun-1',
        turnId: 'turn-kun-1',
        inputId: 'input-native-1',
        prompt: '目标芯片/平台是什么？',
        questions: [
          {
            id: 'input-native-1',
            question: '目标芯片/平台是什么？',
            options: [{ label: 'HK64S825', description: '航顺 8 位 MCU' }],
          },
        ],
      },
      { kind: 'turn_completed', seq: 3, threadId: 'thread-kun-1', turnId: 'turn-kun-1' },
    ]);
    const { child, lines } = startAdapterCli(baseUrl);

    try {
      child.stdin.write(
        `${JSON.stringify({
          jsonrpc: '2.0',
          id: 2,
          method: 'session/prompt',
          params: { sessionId: 'thread-kun-1', prompt: [{ type: 'text', text: 'ping' }] },
        })}\n`
      );

      const permissionRequest = await waitForMessage(
        lines,
        (message) => message.method === 'session/request_permission',
        2_000
      );
      child.stdin.write(
        `${JSON.stringify({
          jsonrpc: '2.0',
          id: permissionRequest.id,
          result: { outcome: { outcome: 'selected', optionId: 'answer:input-native-1:0' } },
        })}\n`
      );

      const promptResponse = await waitForMessage(
        lines,
        (message) => message.id === 2 && Boolean(message.result),
        500
      );
      expect(promptResponse).toEqual(
        expect.objectContaining({
          jsonrpc: '2.0',
          id: 2,
          result: { stopReason: 'end_turn' },
        })
      );
    } finally {
      child.kill();
    }
  });
});
