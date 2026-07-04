import { afterEach, describe, expect, test } from 'bun:test';
import { mkdtempSync, mkdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { KunRuntimeClient } from '../src/kunClient';

const servers: Array<{ stop: () => Promise<void> }> = [];
const tempDirs: string[] = [];
const envKeys = [
  'KUN_PROVIDER',
  'KUN_API_KEY',
  'KUN_BASE_URL',
  'KUN_API_PATH',
  'KUN_MODEL',
  'KUN_PROVIDER_FALLBACK',
  'KUN_SOURCE_DIR',
  'HANGCORE_MANAGED_KUN_RUNTIME_DIR',
  'KUN_DATA_DIR',
  'KUN_RUNTIME_COMMAND',
  'KUN_RUNTIME_ARGS',
  'LOCALAPPDATA',
];
const originalPlatform = process.platform;
const originalCwd = process.cwd();

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.stop()));
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
  for (const key of envKeys) {
    delete process.env[key];
  }
  process.chdir(originalCwd);
  Object.defineProperty(process, 'platform', { value: originalPlatform });
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
      if (url.pathname === '/v1/approvals/approval-1' && request.method === 'POST') {
        return Response.json({ approvalId: 'approval-1', decision: body?.decision, status: body?.decision === 'allow' ? 'allowed' : 'denied' });
      }
      if (url.pathname === '/v1/user-inputs/input-1' && request.method === 'POST') {
        return Response.json({ inputId: 'input-1', status: body?.cancelled ? 'cancelled' : 'submitted', answers: body?.answers ?? [] });
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
      autoStartRuntime: false,
    });

    await expect(client.createSession({ cwd: '/tmp/project' })).rejects.toThrow(
      'Kun runtime is not reachable at http://127.0.0.1:9. Start Kun with `kun serve --host 127.0.0.1 --port 18899` or set KUN_RUNTIME_URL.'
    );
  });

  test('auto-starts Kun runtime when health is unreachable before creating a session', async () => {
    let online = false;
    let healthAttempts = 0;
    let startCalls = 0;
    const client = new KunRuntimeClient({
      baseUrl: 'http://127.0.0.1:18899',
      runtimeCommand: 'kun',
      runtimeArgs: ['serve', '--host', '127.0.0.1', '--port', '18899'],
      startupPollMs: 1,
      startupTimeoutMs: 50,
      startRuntime: async ({ command, args }) => {
        startCalls += 1;
        expect(command).toBe('kun');
        expect(args).toEqual(['serve', '--host', '127.0.0.1', '--port', '18899']);
        online = true;
      },
      fetchImpl: async (input, init) => {
        const url = new URL(String(input));
        if (url.pathname === '/health') {
          healthAttempts += 1;
          if (!online) throw new Error('connection refused');
          return Response.json({ status: 'ok' });
        }
        if (url.pathname === '/v1/threads' && init?.method === 'POST') {
          return Response.json({ id: 'thread-auto-started' }, { status: 201 });
        }
        return Response.json({ message: 'not found' }, { status: 404 });
      },
    });

    const session = await client.createSession({ cwd: '/tmp/project' });

    expect(session.sessionId).toBe('thread-auto-started');
    expect(startCalls).toBe(1);
    expect(healthAttempts).toBeGreaterThanOrEqual(2);
  });

  test('auto-starts a discovered Kun source runtime when no explicit runtime command is configured', async () => {
    const sourceRoot = mkdtempSync(join(tmpdir(), 'kun-source-'));
    tempDirs.push(sourceRoot);
    mkdirSync(join(sourceRoot, 'kun'), { recursive: true });
    writeFileSync(
      join(sourceRoot, 'kun', 'package.json'),
      JSON.stringify({ name: 'kun', bin: { kun: './dist/cli/serve-entry.js' } })
    );
    process.env.KUN_SOURCE_DIR = sourceRoot;
    process.env.KUN_API_KEY = 'sk-from-system-settings';
    process.env.KUN_BASE_URL = 'https://api.example.com';
    process.env.KUN_API_PATH = '/v1/chat/completions';
    process.env.KUN_MODEL = 'deepseek-chat';
    const runtimeDataDir = join(sourceRoot, 'runtime-data');
    process.env.KUN_DATA_DIR = runtimeDataDir;

    let online = false;
    let launch: { command: string; args: string[] } | undefined;
    const client = new KunRuntimeClient({
      baseUrl: 'http://127.0.0.1:18899',
      startupPollMs: 1,
      startupTimeoutMs: 50,
      startRuntime: async (input) => {
        launch = { command: input.command, args: input.args };
        online = true;
      },
      fetchImpl: async (input, init) => {
        const url = new URL(String(input));
        if (url.pathname === '/health') {
          if (!online) throw new Error('connection refused');
          return Response.json({ status: 'ok' });
        }
        if (url.pathname === '/v1/threads' && init?.method === 'POST') {
          return Response.json({ id: 'thread-source-runtime' }, { status: 201 });
        }
        return Response.json({ message: 'not found' }, { status: 404 });
      },
    });

    const session = await client.createSession({ cwd: '/tmp/project' });

    expect(session.sessionId).toBe('thread-source-runtime');
    expect(launch?.command).toBe(process.execPath);
    expect(launch?.args[0]).toEndWith('kun-source-runtime.mjs');
    expect(launch?.args).toContain(sourceRoot);
    expect(launch?.args).toContain('--data-dir');
    expect(launch?.args).toContain(runtimeDataDir);
    expect(launch?.args).toContain('--insecure');
    expect(launch?.args).toContain('--api-key');
    expect(launch?.args).toContain('sk-from-system-settings');
    expect(launch?.args).toContain('--base-url');
    expect(launch?.args).toContain('https://api.example.com/v1');
    expect(launch?.args).toContain('--model');
    expect(launch?.args).toContain('deepseek-chat');
  });

  test('auto-starts the bundled managed Kun runtime before falling back to global kun', async () => {
    const managedRoot = mkdtempSync(join(tmpdir(), 'hangcore-managed-kun-'));
    tempDirs.push(managedRoot);
    mkdirSync(join(managedRoot, 'kun', 'dist', 'cli'), { recursive: true });
    writeFileSync(
      join(managedRoot, 'kun', 'package.json'),
      JSON.stringify({ name: 'kun', bin: { kun: './dist/cli/serve-entry.js' } })
    );
    writeFileSync(join(managedRoot, 'kun', 'dist', 'cli', 'serve-entry.js'), 'process.exit(0);\n');
    process.env.HANGCORE_MANAGED_KUN_RUNTIME_DIR = managedRoot;

    let online = false;
    let launch: { command: string; args: string[] } | undefined;
    const client = new KunRuntimeClient({
      baseUrl: 'http://127.0.0.1:18899',
      startupPollMs: 1,
      startupTimeoutMs: 50,
      startRuntime: async (input) => {
        launch = { command: input.command, args: input.args };
        online = true;
      },
      fetchImpl: async (input, init) => {
        const url = new URL(String(input));
        if (url.pathname === '/health') {
          if (!online) throw new Error('connection refused');
          return Response.json({ status: 'ok' });
        }
        if (url.pathname === '/v1/threads' && init?.method === 'POST') {
          return Response.json({ id: 'thread-managed-runtime' }, { status: 201 });
        }
        return Response.json({ message: 'not found' }, { status: 404 });
      },
    });

    const session = await client.createSession({ cwd: '/tmp/project' });

    expect(session.sessionId).toBe('thread-managed-runtime');
    expect(launch?.command).toBe(process.execPath);
    expect(launch?.args[0]).toEndWith('kun-source-runtime.mjs');
    expect(launch?.args).toContain(resolve(managedRoot));
    expect(launch?.args).not.toContain('kun');
  });

  test('discovers the managed Kun runtime from Tauri encoded resources layout', async () => {
    const appRoot = realpathSync(mkdtempSync(join(tmpdir(), 'hangcore-tauri-app-')));
    tempDirs.push(appRoot);
    const managedRoot = join(appRoot, 'resources', '_up_', '_up_', 'managed-runtimes', 'kun');
    mkdirSync(join(managedRoot, 'kun', 'dist', 'cli'), { recursive: true });
    writeFileSync(
      join(managedRoot, 'kun', 'package.json'),
      JSON.stringify({ name: 'kun', bin: { kun: './dist/cli/serve-entry.js' } })
    );
    writeFileSync(join(managedRoot, 'kun', 'dist', 'cli', 'serve-entry.js'), 'process.exit(0);\n');
    process.chdir(appRoot);

    let online = false;
    let launch: { command: string; args: string[] } | undefined;
    const client = new KunRuntimeClient({
      baseUrl: 'http://127.0.0.1:18899',
      startupPollMs: 1,
      startupTimeoutMs: 50,
      startRuntime: async (input) => {
        launch = { command: input.command, args: input.args };
        online = true;
      },
      fetchImpl: async (input, init) => {
        const url = new URL(String(input));
        if (url.pathname === '/health') {
          if (!online) throw new Error('connection refused');
          return Response.json({ status: 'ok' });
        }
        if (url.pathname === '/v1/threads' && init?.method === 'POST') {
          return Response.json({ id: 'thread-encoded-managed-runtime' }, { status: 201 });
        }
        return Response.json({ message: 'not found' }, { status: 404 });
      },
    });

    const session = await client.createSession({ cwd: '/tmp/project' });

    expect(session.sessionId).toBe('thread-encoded-managed-runtime');
    expect(launch?.command).toBe(process.execPath);
    expect(launch?.args[0]).toEndWith('kun-source-runtime.mjs');
    expect(launch?.args).toContain(managedRoot);
    expect(launch?.args).not.toContain('kun');
  });

  test('uses Windows local app data for default managed Kun runtime data dir on Windows', async () => {
    Object.defineProperty(process, 'platform', { value: 'win32' });
    process.env.LOCALAPPDATA = 'C:\\Users\\Admin\\AppData\\Local';
    const managedRoot = mkdtempSync(join(tmpdir(), 'hangcore-managed-kun-'));
    tempDirs.push(managedRoot);
    mkdirSync(join(managedRoot, 'kun', 'dist', 'cli'), { recursive: true });
    writeFileSync(
      join(managedRoot, 'kun', 'package.json'),
      JSON.stringify({ name: 'kun', bin: { kun: './dist/cli/serve-entry.js' } })
    );
    writeFileSync(join(managedRoot, 'kun', 'dist', 'cli', 'serve-entry.js'), 'process.exit(0);\n');
    process.env.HANGCORE_MANAGED_KUN_RUNTIME_DIR = managedRoot;

    let online = false;
    let launch: { args: string[] } | undefined;
    const client = new KunRuntimeClient({
      baseUrl: 'http://127.0.0.1:18899',
      startupPollMs: 1,
      startupTimeoutMs: 50,
      startRuntime: async (input) => {
        launch = { args: input.args };
        online = true;
      },
      fetchImpl: async (input, init) => {
        const url = new URL(String(input));
        if (url.pathname === '/health') {
          if (!online) throw new Error('connection refused');
          return Response.json({ status: 'ok' });
        }
        if (url.pathname === '/v1/threads' && init?.method === 'POST') {
          return Response.json({ id: 'thread-win-data-dir' }, { status: 201 });
        }
        return Response.json({ message: 'not found' }, { status: 404 });
      },
    });

    const session = await client.createSession({ cwd: 'C:\\work\\project' });

    expect(session.sessionId).toBe('thread-win-data-dir');
    expect(launch?.args).toContain('--data-dir');
    expect(launch?.args).toContain('C:\\Users\\Admin\\AppData\\Local\\NomiFun\\Nomi\\kun-runtime');
    expect(launch?.args.join(' ')).not.toContain('Library');
  });

  test('does not bypass Kun runtime with injected provider env unless fallback is explicit', async () => {
    const providerRequests: Array<{ path: string }> = [];
    const provider = Bun.serve({
      port: 0,
      async fetch(request) {
        const url = new URL(request.url);
        providerRequests.push({ path: url.pathname });
        return Response.json({
          choices: [{ message: { content: 'provider-only reply' } }],
        });
      },
    });
    servers.push({ stop: () => provider.stop(true) });
    process.env.KUN_PROVIDER = 'openai';
    process.env.KUN_API_KEY = 'sk-test';
    process.env.KUN_BASE_URL = `http://127.0.0.1:${provider.port}`;
    process.env.KUN_API_PATH = '/v1/chat/completions';
    process.env.KUN_MODEL = 'deepseek-chat';
    const client = new KunRuntimeClient({
      baseUrl: 'http://127.0.0.1:9',
      autoStartRuntime: false,
    });

    await expect(client.createSession({ cwd: '/tmp/project' })).rejects.toThrow(
      'Kun runtime is not reachable at http://127.0.0.1:9'
    );
    expect(providerRequests).toEqual([]);
  });

  test('redacts provider secrets from Kun runtime auto-start errors', async () => {
    process.env.KUN_PROVIDER = 'openai';
    process.env.KUN_API_KEY = 'sk-should-not-leak';
    process.env.KUN_BASE_URL = 'https://api.example.com';
    process.env.KUN_API_PATH = '/v1/chat/completions';
    const client = new KunRuntimeClient({
      baseUrl: 'http://127.0.0.1:9',
      autoStartRuntime: true,
      runtimeCommand: 'kun',
      runtimeArgs: ['serve', '--api-key', 'sk-should-not-leak', '--runtime-token=secret-token'],
      startupPollMs: 1,
      startupTimeoutMs: 20,
      startRuntime: async () => {
        throw new Error('Executable not found in $PATH: "kun"');
      },
    });

    let message = '';
    try {
      await client.createSession({ cwd: '/tmp/project' });
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }

    expect(message).toContain('--api-key [REDACTED_SECRET]');
    expect(message).toContain('--runtime-token=[REDACTED_SECRET]');
    expect(message).not.toContain('sk-should-not-leak');
    expect(message).not.toContain('secret-token');
  });

  test('falls back to injected OpenAI-compatible provider only when explicitly enabled', async () => {
    const providerRequests: Array<{ path: string; auth?: string | null; body?: unknown }> = [];
    const provider = Bun.serve({
      port: 0,
      async fetch(request) {
        const url = new URL(request.url);
        const body = await request.json().catch(() => undefined);
        providerRequests.push({
          path: url.pathname,
          auth: request.headers.get('authorization'),
          body,
        });
        if (url.pathname === '/v1/chat/completions') {
          return Response.json({
            choices: [{ message: { content: 'hello through DeepSeek-compatible provider' } }],
          });
        }
        return Response.json({ message: 'not found' }, { status: 404 });
      },
    });
    servers.push({ stop: () => provider.stop(true) });
    process.env.KUN_PROVIDER = 'openai';
    process.env.KUN_API_KEY = 'sk-test';
    process.env.KUN_BASE_URL = `http://127.0.0.1:${provider.port}`;
    process.env.KUN_API_PATH = '/v1/chat/completions';
    process.env.KUN_MODEL = 'deepseek-chat';
    process.env.KUN_PROVIDER_FALLBACK = '1';
    const updates: unknown[] = [];
    const client = new KunRuntimeClient({
      baseUrl: 'http://127.0.0.1:9',
      autoStartRuntime: true,
      startupPollMs: 1,
      startupTimeoutMs: 20,
      startRuntime: async () => {
        throw new Error('Executable not found in $PATH: "kun"');
      },
      onSessionUpdate: async (update) => updates.push(update),
    });

    const session = await client.createSession({ cwd: '/tmp/project' });
    const result = await client.prompt(session.sessionId, {
      prompt: [{ type: 'text', text: 'ping' }],
    });

    expect(result.stopReason).toBe('end_turn');
    expect(providerRequests).toContainEqual(
      expect.objectContaining({
        path: '/v1/chat/completions',
        auth: 'Bearer sk-test',
        body: expect.objectContaining({
          model: 'deepseek-chat',
          messages: [{ role: 'user', content: 'ping' }],
        }),
      })
    );
    expect(updates).toContainEqual(
      expect.objectContaining({
        sessionId: session.sessionId,
        update: {
          sessionUpdate: 'agent_message_chunk',
          content: { type: 'text', text: 'hello through DeepSeek-compatible provider' },
        },
      })
    );
  });

  test('keeps provider fallback for restored fallback session ids after adapter restart', async () => {
    const providerRequests: Array<{ path: string; body?: unknown }> = [];
    const provider = Bun.serve({
      port: 0,
      async fetch(request) {
        const url = new URL(request.url);
        providerRequests.push({
          path: url.pathname,
          body: await request.json().catch(() => undefined),
        });
        return Response.json({
          choices: [{ message: { content: 'restored fallback reply' } }],
        });
      },
    });
    servers.push({ stop: () => provider.stop(true) });
    process.env.KUN_PROVIDER = 'openai';
    process.env.KUN_API_KEY = 'sk-test';
    process.env.KUN_BASE_URL = `http://127.0.0.1:${provider.port}`;
    process.env.KUN_API_PATH = '/v1/chat/completions';
    process.env.KUN_MODEL = 'deepseek-chat';
    process.env.KUN_PROVIDER_FALLBACK = '1';
    const updates: unknown[] = [];
    const client = new KunRuntimeClient({
      baseUrl: 'http://127.0.0.1:9',
      autoStartRuntime: false,
      onSessionUpdate: async (update) => updates.push(update),
    });

    const result = await client.prompt('provider-fallback-restored-1', {
      prompt: [{ type: 'text', text: 'ping after restart' }],
    });

    expect(result.stopReason).toBe('end_turn');
    expect(providerRequests).toContainEqual(
      expect.objectContaining({
        path: '/v1/chat/completions',
        body: expect.objectContaining({
          model: 'deepseek-chat',
          messages: [{ role: 'user', content: 'ping after restart' }],
        }),
      })
    );
    expect(updates).toContainEqual(
      expect.objectContaining({
        sessionId: 'provider-fallback-restored-1',
        update: {
          sessionUpdate: 'agent_message_chunk',
          content: { type: 'text', text: 'restored fallback reply' },
        },
      })
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

  test('streams CRLF-delimited SSE frames before the connection closes', async () => {
    let controller: ReadableStreamDefaultController<Uint8Array> | undefined;
    const enc = new TextEncoder();
    const server = Bun.serve({
      port: 0,
      async fetch(request) {
        const url = new URL(request.url);
        if (url.pathname === '/health') return Response.json({ status: 'ok' });
        if (url.pathname === '/v1/threads' && request.method === 'POST') {
          return Response.json({ id: 'thread-kun-1' }, { status: 201 });
        }
        if (url.pathname === '/v1/threads/thread-kun-1/turns' && request.method === 'POST') {
          return Response.json({ turnId: 'turn-kun-1' }, { status: 202 });
        }
        if (url.pathname === '/v1/threads/thread-kun-1/events') {
          const stream = new ReadableStream<Uint8Array>({
            start(c) {
              controller = c;
              c.enqueue(
                enc.encode(
                  `id: 1\r\nevent: assistant_text_delta\r\ndata: ${JSON.stringify({
                    kind: 'assistant_text_delta',
                    seq: 1,
                    threadId: 'thread-kun-1',
                    turnId: 'turn-kun-1',
                    item: { text: 'first CRLF chunk' },
                  })}\r\n\r\n`
                )
              );
            },
          });
          return new Response(stream, { headers: { 'content-type': 'text/event-stream' } });
        }
        return Response.json({ message: 'not found' }, { status: 404 });
      },
    });
    servers.push({ stop: () => server.stop(true) });

    const updates: unknown[] = [];
    let promptDone: Promise<unknown> | undefined;
    const firstUpdate = new Promise<void>((resolve) => {
      const client = new KunRuntimeClient({
        baseUrl: `http://127.0.0.1:${server.port}`,
        onSessionUpdate: (update) => {
          updates.push(update);
          resolve();
        },
      });
      promptDone = client.createSession({ cwd: '/tmp/project' }).then((session) =>
        client.prompt(session.sessionId, {
          prompt: [{ type: 'text', text: 'ping' }],
        })
      );
    });

    await expect(
      Promise.race([
        firstUpdate,
        new Promise((_, reject) => setTimeout(() => reject(new Error('CRLF frame stayed buffered')), 80)),
      ])
    ).resolves.toBeUndefined();

    expect(updates).toContainEqual(
      expect.objectContaining({
        sessionId: 'thread-kun-1',
        update: {
          sessionUpdate: 'agent_message_chunk',
          content: { type: 'text', text: 'first CRLF chunk' },
        },
      })
    );

    controller?.enqueue(
      enc.encode(
        `id: 2\r\nevent: turn_completed\r\ndata: ${JSON.stringify({
          kind: 'turn_completed',
          seq: 2,
          threadId: 'thread-kun-1',
          turnId: 'turn-kun-1',
        })}\r\n\r\n`
      )
    );
    await expect(
      Promise.race([
        promptDone,
        new Promise((_, reject) => setTimeout(() => reject(new Error('prompt did not finish')), 100)),
      ])
    ).resolves.toEqual({ stopReason: 'end_turn' });
  });

  test('resolves Kun approval requests through the ACP permission callback', async () => {
    const fake = startFakeKun([
      {
        kind: 'approval_requested',
        seq: 1,
        threadId: 'thread-kun-1',
        turnId: 'turn-kun-1',
        approvalId: 'approval-1',
        toolName: 'shell',
        status: 'pending',
        approvalPolicy: 'on_request',
        sandboxMode: 'workspace-write',
        summary: 'Run npm test',
      },
      {
        kind: 'assistant_text_delta',
        seq: 2,
        threadId: 'thread-kun-1',
        turnId: 'turn-kun-1',
        item: { text: 'approval accepted' },
      },
      { kind: 'turn_completed', seq: 3, threadId: 'thread-kun-1', turnId: 'turn-kun-1' },
    ]);
    const permissionRequests: unknown[] = [];
    const client = new KunRuntimeClient({
      baseUrl: fake.baseUrl,
      requestPermission: async (request) => {
        permissionRequests.push(request);
        return { outcome: 'selected', optionId: 'allow_once' };
      },
    });

    const session = await client.createSession({ cwd: '/tmp/project' });
    const result = await client.prompt(session.sessionId, {
      prompt: [{ type: 'text', text: 'please run tests' }],
    });

    expect(result.stopReason).toBe('end_turn');
    expect(permissionRequests).toContainEqual(
      expect.objectContaining({
        sessionId: 'thread-kun-1',
        toolCall: expect.objectContaining({
          toolCallId: 'approval-1',
          title: 'shell',
          rawInput: expect.objectContaining({
            description: 'Run npm test',
            approvalPolicy: 'on_request',
            sandboxMode: 'workspace-write',
          }),
        }),
      })
    );
    expect(fake.requests).toContainEqual(
      expect.objectContaining({
        method: 'POST',
        path: '/v1/approvals/approval-1',
        body: { decision: 'allow' },
      })
    );
  });

  test('denies Kun approval requests when the ACP permission callback rejects', async () => {
    const fake = startFakeKun([
      {
        kind: 'approval_requested',
        seq: 1,
        threadId: 'thread-kun-1',
        turnId: 'turn-kun-1',
        approvalId: 'approval-1',
        toolName: 'shell',
        status: 'pending',
        summary: 'Delete generated output',
      },
      { kind: 'turn_aborted', seq: 2, threadId: 'thread-kun-1', turnId: 'turn-kun-1' },
    ]);
    const client = new KunRuntimeClient({
      baseUrl: fake.baseUrl,
      requestPermission: async () => ({ outcome: 'selected', optionId: 'reject_once' }),
    });

    const session = await client.createSession({ cwd: '/tmp/project' });
    const result = await client.prompt(session.sessionId, {
      prompt: [{ type: 'text', text: 'please delete output' }],
    });

    expect(result.stopReason).toBe('cancelled');
    expect(fake.requests).toContainEqual(
      expect.objectContaining({
        method: 'POST',
        path: '/v1/approvals/approval-1',
        body: { decision: 'deny' },
      })
    );
  });

  test('submits Kun user-input requests through the injected callback', async () => {
    const fake = startFakeKun([
      {
        kind: 'user_input_requested',
        seq: 1,
        threadId: 'thread-kun-1',
        turnId: 'turn-kun-1',
        inputId: 'input-1',
        status: 'pending',
        prompt: 'Choose a branch',
        questions: [
          {
            header: 'Branch',
            id: 'branch',
            question: 'Which branch should Kun use?',
            options: [{ label: 'main', description: 'Use main branch' }],
          },
        ],
      },
      { kind: 'turn_completed', seq: 2, threadId: 'thread-kun-1', turnId: 'turn-kun-1' },
    ]);
    const client = new KunRuntimeClient({
      baseUrl: fake.baseUrl,
      requestUserInput: async () => ({
        cancelled: false,
        answers: [{ id: 'branch', label: 'main', value: 'main' }],
      }),
    });

    const session = await client.createSession({ cwd: '/tmp/project' });
    const result = await client.prompt(session.sessionId, {
      prompt: [{ type: 'text', text: 'ask me' }],
    });

    expect(result.stopReason).toBe('end_turn');
    expect(fake.requests).toContainEqual(
      expect.objectContaining({
        method: 'POST',
        path: '/v1/user-inputs/input-1',
        body: { answers: [{ id: 'branch', label: 'main', value: 'main' }] },
      })
    );
  });

  test('maps Kun tool_call_ready events to ACP tool call updates', async () => {
    const fake = startFakeKun([
      {
        kind: 'tool_call_ready',
        seq: 1,
        threadId: 'thread-kun-1',
        turnId: 'turn-kun-1',
        toolName: 'shell',
        callId: 'call-1',
        readyCount: 1,
      },
      { kind: 'turn_completed', seq: 2, threadId: 'thread-kun-1', turnId: 'turn-kun-1' },
    ]);
    const updates: unknown[] = [];
    const client = new KunRuntimeClient({
      baseUrl: fake.baseUrl,
      onSessionUpdate: async (update) => updates.push(update),
    });

    const session = await client.createSession({ cwd: '/tmp/project' });
    await client.prompt(session.sessionId, {
      prompt: [{ type: 'text', text: 'run a tool' }],
    });

    expect(updates).toContainEqual(
      expect.objectContaining({
        sessionId: 'thread-kun-1',
        update: expect.objectContaining({
          sessionUpdate: 'tool_call',
          toolCallId: 'call-1',
          title: 'shell',
          status: 'pending',
          rawInput: { readyCount: 1 },
        }),
      })
    );
  });
});
