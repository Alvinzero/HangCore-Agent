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

  test('rebuilds an existing managed runtime when its cleanup manifest is stale', () => {
    const root = mkTemp('kun-managed-stale-test-');
    const source = join(root, 'Kun');
    const output = join(root, 'managed-runtimes', 'kun');
    mkdirSync(join(source, 'kun', 'dist', 'cli'), { recursive: true });
    mkdirSync(join(source, 'kun', 'node_modules', 'zod'), { recursive: true });
    mkdirSync(join(output, 'kun', 'dist', 'cli'), { recursive: true });
    mkdirSync(join(output, 'kun', 'node_modules'), { recursive: true });
    writeFileSync(join(source, 'kun', 'package.json'), JSON.stringify({ name: 'kun', version: '0.1.0' }));
    writeFileSync(join(source, 'kun', 'dist', 'cli', 'serve-entry.js'), 'process.exit(0);\n');
    writeFileSync(join(source, 'kun', 'node_modules', 'zod', 'package.json'), JSON.stringify({ name: 'zod' }));
    writeFileSync(join(output, 'kun', 'package.json'), JSON.stringify({ name: 'kun', version: 'stale' }));
    writeFileSync(join(output, 'kun', 'dist', 'cli', 'serve-entry.js'), 'throw new Error("stale");\n');
    writeFileSync(join(output, 'stale-marker.txt'), 'old output\n');
    writeFileSync(join(output, 'hangcore-managed-runtime.json'), JSON.stringify({ runtime: 'kun', layoutVersion: 1 }));

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
    expect(existsSync(join(output, 'stale-marker.txt'))).toBe(false);
    expect(readFileSync(join(output, 'kun', 'package.json'), 'utf8')).toContain('"version":"0.1.0"');
    const manifest = JSON.parse(readFileSync(join(output, 'hangcore-managed-runtime.json'), 'utf8'));
    expect(manifest.bundleCleanupVersion).toBe(1);
  });

  test('rebuilds when the managed Kun source ref changes', () => {
    const root = mkTemp('kun-managed-ref-test-');
    const source = join(root, 'Kun');
    const output = join(root, 'managed-runtimes', 'kun');
    mkdirSync(join(source, 'kun', 'dist', 'cli'), { recursive: true });
    mkdirSync(join(source, 'kun', 'node_modules', 'zod'), { recursive: true });
    mkdirSync(join(output, 'kun', 'dist', 'cli'), { recursive: true });
    mkdirSync(join(output, 'kun', 'node_modules'), { recursive: true });
    writeFileSync(join(source, 'kun', 'package.json'), JSON.stringify({ name: 'kun', version: 'new' }));
    writeFileSync(join(source, 'kun', 'dist', 'cli', 'serve-entry.js'), 'process.exit(0);\n');
    writeFileSync(join(source, 'kun', 'node_modules', 'zod', 'package.json'), JSON.stringify({ name: 'zod' }));
    writeFileSync(join(output, 'kun', 'package.json'), JSON.stringify({ name: 'kun', version: 'old' }));
    writeFileSync(join(output, 'kun', 'dist', 'cli', 'serve-entry.js'), 'throw new Error("stale");\n');
    writeFileSync(
      join(output, 'hangcore-managed-runtime.json'),
      JSON.stringify({ runtime: 'kun', layoutVersion: 1, bundleCleanupVersion: 1, ref: 'old-ref' })
    );

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
      {
        encoding: 'utf8',
        env: { ...process.env, KUN_MANAGED_REF: 'new-ref' },
      }
    );

    expect(result.status).toBe(0);
    expect(readFileSync(join(output, 'kun', 'package.json'), 'utf8')).toContain('"version":"new"');
    const manifest = JSON.parse(readFileSync(join(output, 'hangcore-managed-runtime.json'), 'utf8'));
    expect(manifest.ref).toBe('new-ref');
  });

  test('removes non-runtime package clutter from copied node_modules', () => {
    const root = mkTemp('kun-managed-clean-test-');
    const source = join(root, 'Kun');
    const output = join(root, 'managed-runtimes', 'kun');
    const packageRoot = join(source, 'kun', 'node_modules', 'runtime-pkg');
    const sourceEntryPackageRoot = join(source, 'kun', 'node_modules', 'source-entry-pkg');
    const scopedPackageRoot = join(source, 'kun', 'node_modules', '@scope', 'runtime-pkg');

    mkdirSync(join(source, 'kun', 'dist', 'cli'), { recursive: true });
    mkdirSync(join(packageRoot, 'dist'), { recursive: true });
    mkdirSync(join(packageRoot, 'src'), { recursive: true });
    mkdirSync(join(packageRoot, 'test'), { recursive: true });
    mkdirSync(join(packageRoot, 'docs'), { recursive: true });
    mkdirSync(join(packageRoot, '.github'), { recursive: true });
    mkdirSync(join(packageRoot, 'types', 'nested'), { recursive: true });
    mkdirSync(join(sourceEntryPackageRoot, 'src'), { recursive: true });
    mkdirSync(join(scopedPackageRoot, 'dist'), { recursive: true });
    mkdirSync(join(scopedPackageRoot, 'examples'), { recursive: true });

    writeFileSync(join(source, 'kun', 'package.json'), JSON.stringify({ name: 'kun', version: '0.1.0' }));
    writeFileSync(join(source, 'kun', 'dist', 'cli', 'serve-entry.js'), 'process.exit(0);\n');
    writeFileSync(join(packageRoot, 'package.json'), JSON.stringify({ name: 'runtime-pkg', main: 'dist/index.js' }));
    writeFileSync(join(packageRoot, 'dist', 'index.js'), 'export const ok = true;\n');
    writeFileSync(join(packageRoot, 'dist', 'index.js.map'), '{}\n');
    writeFileSync(join(packageRoot, 'dist', 'index.d.ts'), 'export declare const ok: boolean;\n');
    writeFileSync(join(packageRoot, 'README.md'), '# runtime-pkg\n');
    writeFileSync(join(packageRoot, 'CHANGELOG.md'), '# changes\n');
    writeFileSync(join(packageRoot, 'src', 'index.ts'), 'export const source = true;\n');
    writeFileSync(join(packageRoot, 'test', 'index.test.js'), 'throw new Error("not runtime");\n');
    writeFileSync(join(packageRoot, 'docs', 'usage.md'), '# docs\n');
    writeFileSync(join(packageRoot, '.github', 'workflow.yml'), 'name: ci\n');
    writeFileSync(join(packageRoot, 'types', 'nested', 'index.d.ts'), 'export declare const nested: boolean;\n');
    writeFileSync(join(sourceEntryPackageRoot, 'package.json'), JSON.stringify({ name: 'source-entry-pkg', main: 'src/index.js' }));
    writeFileSync(join(sourceEntryPackageRoot, 'src', 'index.js'), 'export const sourceEntry = true;\n');
    writeFileSync(join(scopedPackageRoot, 'package.json'), JSON.stringify({ name: '@scope/runtime-pkg' }));
    writeFileSync(join(scopedPackageRoot, 'dist', 'index.js'), 'export const scoped = true;\n');
    writeFileSync(join(scopedPackageRoot, 'examples', 'demo.js'), 'console.log("demo");\n');

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

    const outputPackageRoot = join(output, 'kun', 'node_modules', 'runtime-pkg');
    const outputScopedPackageRoot = join(output, 'kun', 'node_modules', '@scope', 'runtime-pkg');
    expect(result.status).toBe(0);
    expect(existsSync(join(outputPackageRoot, 'package.json'))).toBe(true);
    expect(existsSync(join(outputPackageRoot, 'dist', 'index.js'))).toBe(true);
    expect(existsSync(join(outputScopedPackageRoot, 'dist', 'index.js'))).toBe(true);
    expect(existsSync(join(outputPackageRoot, 'dist', 'index.js.map'))).toBe(false);
    expect(existsSync(join(outputPackageRoot, 'dist', 'index.d.ts'))).toBe(false);
    expect(existsSync(join(outputPackageRoot, 'README.md'))).toBe(false);
    expect(existsSync(join(outputPackageRoot, 'CHANGELOG.md'))).toBe(false);
    expect(existsSync(join(outputPackageRoot, 'src'))).toBe(false);
    expect(existsSync(join(outputPackageRoot, 'test'))).toBe(false);
    expect(existsSync(join(outputPackageRoot, 'docs'))).toBe(false);
    expect(existsSync(join(outputPackageRoot, '.github'))).toBe(false);
    expect(existsSync(join(outputPackageRoot, 'types'))).toBe(false);
    expect(existsSync(join(output, 'kun', 'node_modules', 'source-entry-pkg', 'src', 'index.js'))).toBe(true);
    expect(existsSync(join(outputScopedPackageRoot, 'examples'))).toBe(false);
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
