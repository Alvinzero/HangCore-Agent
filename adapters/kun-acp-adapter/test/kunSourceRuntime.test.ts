import { afterEach, describe, expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
  delete process.env.KUN_NODE_COMMAND;
  delete process.env.KUN_JS_RUNTIME_COMMAND;
  delete process.env.KUN_RUNTIME_FOREGROUND;
  delete process.env.KUN_RUNTIME_LOG_DIR;
});

describe('kun-source-runtime wrapper', () => {
  test('launches Kun with the current JS runtime when no explicit runtime command is configured', () => {
    const sourceRoot = mkdtempSync(join(tmpdir(), 'kun-wrapper-'));
    tempDirs.push(sourceRoot);
    mkdirSync(join(sourceRoot, 'kun', 'dist', 'cli'), { recursive: true });
    writeFileSync(join(sourceRoot, 'kun', 'package.json'), JSON.stringify({ name: 'kun' }));
    writeFileSync(
      join(sourceRoot, 'kun', 'dist', 'cli', 'serve-entry.js'),
      [
        "import process from 'node:process';",
        "process.stdout.write(JSON.stringify({ execPath: process.execPath, argv: process.argv.slice(2) }));",
        '',
      ].join('\n')
    );
    const wrapper = resolve('adapters/kun-acp-adapter/bin/kun-source-runtime.mjs');

    const result = spawnSync(process.execPath, [wrapper, '--source-dir', sourceRoot, 'serve', '--host', '127.0.0.1'], {
      encoding: 'utf8',
      env: {
        ...process.env,
        KUN_NODE_COMMAND: '',
        KUN_JS_RUNTIME_COMMAND: '',
        KUN_RUNTIME_FOREGROUND: '1',
      },
    });

    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');
    const output = JSON.parse(result.stdout);
    expect(output.execPath).toBe(process.execPath);
    expect(output.argv).toEqual(['serve', '--host', '127.0.0.1']);
  });

  test('normalizes a relative source dir before launching Kun', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'kun-wrapper-relative-'));
    tempDirs.push(cwd);
    mkdirSync(join(cwd, 'managed-runtimes', 'kun', 'kun', 'dist', 'cli'), { recursive: true });
    writeFileSync(join(cwd, 'managed-runtimes', 'kun', 'kun', 'package.json'), JSON.stringify({ name: 'kun' }));
    writeFileSync(
      join(cwd, 'managed-runtimes', 'kun', 'kun', 'dist', 'cli', 'serve-entry.js'),
      [
        "import process from 'node:process';",
        "process.stdout.write(JSON.stringify({ execPath: process.execPath, argv: process.argv.slice(2) }));",
        '',
      ].join('\n')
    );
    const wrapper = resolve('adapters/kun-acp-adapter/bin/kun-source-runtime.mjs');

    const result = spawnSync(process.execPath, [wrapper, '--source-dir', 'managed-runtimes/kun', 'serve'], {
      cwd,
      encoding: 'utf8',
      env: {
        ...process.env,
        KUN_NODE_COMMAND: '',
        KUN_JS_RUNTIME_COMMAND: '',
        KUN_RUNTIME_FOREGROUND: '1',
      },
    });

    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');
    const output = JSON.parse(result.stdout);
    expect(output.execPath).toBe(process.execPath);
    expect(output.argv).toEqual(['serve']);
  });

  test('runs managed Kun runtime in background log mode by default', () => {
    const sourceRoot = mkdtempSync(join(tmpdir(), 'kun-wrapper-log-'));
    const logDir = join(sourceRoot, 'logs');
    tempDirs.push(sourceRoot);
    mkdirSync(join(sourceRoot, 'kun', 'dist', 'cli'), { recursive: true });
    writeFileSync(join(sourceRoot, 'kun', 'package.json'), JSON.stringify({ name: 'kun' }));
    writeFileSync(
      join(sourceRoot, 'kun', 'dist', 'cli', 'serve-entry.js'),
      [
        "import process from 'node:process';",
        "process.stdout.write(JSON.stringify({ execPath: process.execPath, argv: process.argv.slice(2) }));",
        "process.stderr.write('\\nmanaged-stderr');",
        '',
      ].join('\n')
    );
    const wrapper = resolve('adapters/kun-acp-adapter/bin/kun-source-runtime.mjs');

    const result = spawnSync(process.execPath, [wrapper, '--source-dir', sourceRoot, 'serve', '--data-dir', join(sourceRoot, 'data')], {
      encoding: 'utf8',
      env: {
        ...process.env,
        KUN_NODE_COMMAND: '',
        KUN_JS_RUNTIME_COMMAND: '',
        KUN_RUNTIME_LOG_DIR: logDir,
      },
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toBe('');
    expect(result.stderr).toBe('');
    const logPath = join(logDir, 'kun-runtime.log');
    expect(existsSync(logPath)).toBe(true);
    const log = readFileSync(logPath, 'utf8');
    expect(log).toContain('"argv":["serve","--data-dir"');
    expect(log).toContain('managed-stderr');
  });
});
