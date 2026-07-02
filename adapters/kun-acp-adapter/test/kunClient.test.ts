import { afterEach, describe, expect, test } from 'bun:test';
import { KunRuntimeClient } from '../src/kunClient';

const servers: Array<{ stop: () => Promise<void> }> = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.stop()));
});

function startFakeKun(events: unknown[], options: { keepSseOpen?: boolean } = {}) {
  const requests: Array<{ method: string; path: string; body?: unknown; auth?: string | null }> = [];
  const server = Bun.serve({
    port: 0,
    async fetch(request) {
      const url = new URL(request.url);
      const body = request.method === 'POST' ? await request.json().catch(() => undefined) : undefined;
      requests.push({
        method: request.method,
        path: `${url.pathname}${url.search}`,
        body,
        auth: request.headers.get('authorization'),
      });

      if (url.pathname === '/health') {
        return Response.json({ status: 'ok' });
      }
      if (url.pathname === '/v1/threads' && request.method === 'POST') {
        return Response.json({ id: 'thread-kun-1', title: 'HangCore ACP', workspace: '/tmp/project' }, { status: 201 });
      }
      if (url.pathname === '/v1/threads/thread-kun-1/turns' && request.method === 'POST') {
        return Response.json({ threadId: 'thread-kun-1', turnId: 'turn-kun-1', userMessageItemId: 'item-user-1' }, { status: 202 });
      }
      if (url.pathname === '/v1/threads/thread-kun-1/events') {
        const stream = new ReadableStream<Uint8Array>({
          start(controller) {
            const enc = new TextEncoder();
            for (const event of events) {
              const kind = typeof event === 'object' && event && 'kind' in event ? String((event as { kind: unknown }).kind) : 'message';
              controller.enqueue(enc.encode(`id: ${(event as { seq?: number }).seq ?? 1}\n`));
              controller.enqueue(enc.encode(`event: ${kind}\n`));
              controller.enqueue(enc.encode(`data: ${JSON.stringify(event)}\n\n`));
            }
            if (!options.keepSseOpen) controller.close();
          },
        });
        return new Response(stream, { headers: { 'content-type': 'text/event-stream' } });
      }
      return Response.json({ message: 'not found' }, { status: 404 });
    },
  });

  servers.push({ stop: () => server.stop(true) });
  return { baseUrl: `http://127.0.0.1:${server.port}`, requests };
}

describe('KunRuntimeClient', () => {
  test('explains how to start Kun when the runtime is unreachable', async () => {
    const client = new KunRuntimeClient({
      baseUrl: 'http://127.0.0.1:9',
    });

    await expect(client.createSession({ cwd: '/tmp/project' })).rejects.toThrow(
      'Kun runtime is not reachable at http://127.0.0.1:9. Start Kun with `kun serve --host 127.0.0.1 --port 18899` or set KUN_RUNTIME_URL.'
    );
  });

  test('creates a Kun thread and streams Kun loop output for an ACP prompt', async () => {
    const fake = startFakeKun([
      {
        kind: 'assistant_reasoning_delta',
        seq: 1,
        threadId: 'thread-kun-1',
        turnId: 'turn-kun-1',
        item: { text: 'thinking with Kun loop' },
      },
      {
        kind: 'assistant_text_delta',
        seq: 2,
        threadId: 'thread-kun-1',
        turnId: 'turn-kun-1',
        item: { text: 'hello from Kun' },
      },
      {
        kind: 'turn_completed',
        seq: 3,
        threadId: 'thread-kun-1',
        turnId: 'turn-kun-1',
      },
    ]);
    const updates: unknown[] = [];
    const client = new KunRuntimeClient({
      baseUrl: fake.baseUrl,
      runtimeToken: 'secret',
      model: 'deepseek-v4-flash',
      onSessionUpdate: async (update) => updates.push(update),
    });

    const session = await client.createSession({ cwd: '/tmp/project' });
    const result = await client.prompt(session.sessionId, {
      prompt: [{ type: 'text', text: 'ping' }],
    });

    expect(session.sessionId).toBe('thread-kun-1');
    expect(result.stopReason).toBe('end_turn');
    expect(fake.requests).toContainEqual(
      expect.objectContaining({
        method: 'POST',
        path: '/v1/threads',
        auth: 'Bearer secret',
        body: expect.objectContaining({
          workspace: '/tmp/project',
          model: 'deepseek-v4-flash',
        }),
      })
    );
    expect(fake.requests).toContainEqual(
      expect.objectContaining({
        method: 'POST',
        path: '/v1/threads/thread-kun-1/turns',
        body: expect.objectContaining({ prompt: 'ping' }),
      })
    );
    expect(updates).toContainEqual(
      expect.objectContaining({
        sessionId: 'thread-kun-1',
        update: {
          sessionUpdate: 'agent_thought_chunk',
          content: { type: 'text', text: 'thinking with Kun loop' },
        },
      })
    );
    expect(updates).toContainEqual(
      expect.objectContaining({
        sessionId: 'thread-kun-1',
        update: {
          sessionUpdate: 'agent_message_chunk',
          content: { type: 'text', text: 'hello from Kun' },
        },
      })
    );
  });

  test('finishes a prompt after Kun emits a terminal event on a long-lived SSE stream', async () => {
    const fake = startFakeKun(
      [
        {
          kind: 'assistant_text_delta',
          seq: 1,
          threadId: 'thread-kun-1',
          turnId: 'turn-kun-1',
          item: { text: 'stream stays open' },
        },
        {
          kind: 'turn_completed',
          seq: 2,
          threadId: 'thread-kun-1',
          turnId: 'turn-kun-1',
        },
      ],
      { keepSseOpen: true }
    );
    const client = new KunRuntimeClient({ baseUrl: fake.baseUrl });

    const session = await client.createSession({ cwd: '/tmp/project' });
    const prompt = client.prompt(session.sessionId, {
      prompt: [{ type: 'text', text: 'ping' }],
    });
    prompt.catch(() => undefined);

    await expect(
      Promise.race([
        prompt,
        new Promise((_, reject) => setTimeout(() => reject(new Error('prompt did not finish')), 100)),
      ])
    ).resolves.toEqual({ stopReason: 'end_turn' });
  });
});
