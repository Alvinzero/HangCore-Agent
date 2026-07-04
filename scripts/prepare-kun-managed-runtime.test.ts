import { afterEach, describe, expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe('prepare-kun-managed-runtime', () => {
  test('copies a built Kun runtime into the managed runtime resource layout', () => {
    const root = mkTemp('kun-managed-test-');
    const source = join(root, 'Kun');
    const output = join(root, 'managed-runtimes', 'kun');
    mkdirSync(join(source, 'kun', 'dist', 'cli'), { recursive: true });
    mkdirSync(join(source, 'kun', 'node_modules', 'zod'), { recursive: true });
    writeFileSync(join(source, 'kun', 'package.json'), JSON.stringify({ name: 'kun', version: '0.1.0' }));
    writeFileSync(join(source, 'kun', 'package-lock.json'), JSON.stringify({ name: 'kun', lockfileVersion: 3 }));
    writeFileSync(join(source, 'kun', 'dist', 'cli', 'serve-entry.js'), 'process.exit(0);\n');
    writeFileSync(join(source, 'kun', 'node_modules', 'zod', 'package.json'), JSON.stringify({ name: 'zod' }));

    const result = spawnSync(
      process.execPath,
      [
        resolve('scripts/prepare-kun-managed-runtime.mjs'),
        '--source-dir',
        source,
        '--output-dir',
        output,
        '--skip-build',
      ],
      { encoding: 'utf8' }
    );

    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');
    expect(existsSync(join(output, 'kun', 'package.json'))).toBe(true);
    expect(existsSync(join(output, 'kun', 'dist', 'cli', 'serve-entry.js'))).toBe(true);
    expect(existsSync(join(output, 'kun', 'node_modules', 'zod', 'package.json'))).toBe(true);
    const manifest = JSON.parse(readFileSync(join(output, 'hangcore-managed-runtime.json'), 'utf8'));
    expect(manifest.runtime).toBe('kun');
    expect(manifest.layoutVersion).toBe(1);
  });

  test('prunes the copied managed runtime instead of the source checkout', () => {
    const root = mkTemp('kun-managed-prune-test-');
    const source = join(root, 'Kun');
    const output = join(root, 'managed-runtimes', 'kun');
    const bin = join(root, 'bin');
    const log = join(root, 'npm.log');
    mkdirSync(join(source, 'kun', 'dist', 'cli'), { recursive: true });
    mkdirSync(join(source, 'kun', 'node_modules', 'dev-only'), { recursive: true });
    mkdirSync(bin, { recursive: true });
    writeFileSync(join(source, 'kun', 'package.json'), JSON.stringify({ name: 'kun', version: '0.1.0' }));
    writeFileSync(join(source, 'kun', 'package-lock.json'), JSON.stringify({ name: 'kun', lockfileVersion: 3 }));
    writeFileSync(join(source, 'kun', 'dist', 'cli', 'serve-entry.js'), 'process.exit(0);\n');
    writeFileSync(join(source, 'kun', 'node_modules', 'dev-only', 'package.json'), JSON.stringify({ name: 'dev-only' }));
    writeFakeNpm(bin, log);

    const result = spawnSync(
      process.execPath,
      [
        resolve('scripts/prepare-kun-managed-runtime.mjs'),
        '--source-dir',
        source,
        '--output-dir',
        output,
        '--force',
      ],
      {
        encoding: 'utf8',
        env: {
          ...process.env,
          PATH: `${bin}${process.platform === 'win32' ? ';' : ':'}${process.env.PATH || ''}`,
        },
      }
    );

    expect(result.status).toBe(0);
    const calls = readFileSync(log, 'utf8');
    expect(calls).toContain(`--prefix ${join(source, 'kun')} ci`);
    expect(calls).toContain(`--prefix ${join(source, 'kun')} run build`);
    expect(calls).toContain(`--prefix ${join(output, 'kun')} prune --omit=dev`);
    expect(calls).not.toContain(`--prefix ${join(source, 'kun')} prune --omit=dev`);
  });

  test('builds Kun from the repository root when root package metadata is present', () => {
    const root = mkTemp('kun-managed-root-build-test-');
    const source = join(root, 'Kun');
    const output = join(root, 'managed-runtimes', 'kun');
    const bin = join(root, 'bin');
    const log = join(root, 'npm.log');
    mkdirSync(join(source, 'kun', 'dist', 'cli'), { recursive: true });
    mkdirSync(join(source, 'kun', 'node_modules', 'zod'), { recursive: true });
    mkdirSync(bin, { recursive: true });
    writeFileSync(join(source, 'package.json'), JSON.stringify({ name: 'kun-gui', scripts: { 'build:kun': 'echo build' } }));
    writeFileSync(join(source, 'package-lock.json'), JSON.stringify({ name: 'kun-gui', lockfileVersion: 3 }));
    writeFileSync(join(source, 'kun', 'package.json'), JSON.stringify({ name: 'kun', version: '0.1.0' }));
    writeFileSync(join(source, 'kun', 'package-lock.json'), JSON.stringify({ name: 'kun', lockfileVersion: 3 }));
    writeFileSync(join(source, 'kun', 'dist', 'cli', 'serve-entry.js'), 'process.exit(0);\n');
    writeFileSync(join(source, 'kun', 'node_modules', 'zod', 'package.json'), JSON.stringify({ name: 'zod' }));
    writeFakeNpm(bin, log);

    const result = spawnSync(
      process.execPath,
      [
        resolve('scripts/prepare-kun-managed-runtime.mjs'),
        '--source-dir',
        source,
        '--output-dir',
        output,
        '--force',
      ],
      {
        encoding: 'utf8',
        env: {
          ...process.env,
          PATH: `${bin}${process.platform === 'win32' ? ';' : ':'}${process.env.PATH || ''}`,
        },
      }
    );

    expect(result.status).toBe(0);
    const calls = readFileSync(log, 'utf8');
    expect(calls).toContain(`--prefix ${source} ci`);
    expect(calls).toContain(`--prefix ${source} run build:kun`);
    expect(calls).not.toContain(`--prefix ${join(source, 'kun')} run build`);
    expect(calls).toContain(`--prefix ${join(output, 'kun')} prune --omit=dev`);
  });
});

function mkTemp(prefix: string): string {
  const dir = join(tmpdir(), `${prefix}${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  tempDirs.push(dir);
  return dir;
}

function writeFakeNpm(bin: string, log: string): void {
  if (process.platform === 'win32') {
    const npm = join(bin, 'npm.cmd');
    writeFileSync(npm, `@echo off\r\necho %*>>"${log}"\r\nexit /b 0\r\n`);
    return;
  }
  const npm = join(bin, 'npm');
  writeFileSync(npm, `#!/bin/sh\nprintf '%s\\n' "$*" >> "${log}"\n`);
  chmodSync(npm, 0o755);
}
