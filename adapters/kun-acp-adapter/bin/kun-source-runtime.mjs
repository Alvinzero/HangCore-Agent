#!/usr/bin/env node
import { existsSync } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import { homedir } from 'node:os';
import path from 'node:path';
import process from 'node:process';

const { sourceDir, runtimeArgs } = parseArgs(process.argv.slice(2));
const sourceRoot = normalizeKunSourceRoot(sourceDir || process.env.KUN_SOURCE_DIR || '');

if (!sourceRoot) {
  process.stderr.write(
    '[kun-source-runtime] Kun source was not found. Set KUN_SOURCE_DIR to a Kun checkout that contains kun/package.json.\n'
  );
  process.exit(127);
}

const packageDir = path.join(sourceRoot, 'kun');
const distEntry = path.join(packageDir, 'dist', 'cli', 'serve-entry.js');

if (!existsSync(distEntry)) {
  const buildFromRoot = existsSync(path.join(sourceRoot, 'package-lock.json')) && existsSync(path.join(sourceRoot, 'package.json'));
  const installPrefix = buildFromRoot ? sourceRoot : packageDir;
  const install = run('npm', ['--prefix', installPrefix, 'ci']);
  if (install.status !== 0) process.exit(install.status || 1);
  const build = buildFromRoot
    ? run('npm', ['--prefix', sourceRoot, 'run', 'build:kun'])
    : run('npm', ['--prefix', packageDir, 'run', 'build']);
  if (build.status !== 0) process.exit(build.status || 1);
}

const env = {
  ...process.env,
  KUN_SOURCE_DIR: sourceRoot,
};
if (env.KUN_API_KEY && !env.DEEPSEEK_API_KEY) env.DEEPSEEK_API_KEY = env.KUN_API_KEY;
if (env.KUN_BASE_URL && !env.DEEPSEEK_BASE_URL) env.DEEPSEEK_BASE_URL = env.KUN_BASE_URL;

const jsRuntime = process.env.KUN_JS_RUNTIME_COMMAND || process.env.KUN_NODE_COMMAND || process.execPath;
const child = spawn(jsRuntime, [distEntry, ...runtimeArgs], {
  cwd: packageDir,
  env,
  stdio: 'inherit',
});

child.once('error', (error) => {
  process.stderr.write(`[kun-source-runtime] failed to start Kun runtime: ${error.message}\n`);
  process.exit(127);
});

child.once('exit', (code, signal) => {
  if (signal) {
    process.stderr.write(`[kun-source-runtime] Kun runtime exited from signal ${signal}\n`);
    process.exit(128);
  }
  process.exit(code ?? 0);
});

function parseArgs(argv) {
  let sourceDir = '';
  const runtimeArgs = [];
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--source-dir') {
      sourceDir = argv[++i] || '';
    } else if (arg.startsWith('--source-dir=')) {
      sourceDir = arg.slice('--source-dir='.length);
    } else {
      runtimeArgs.push(arg);
    }
  }
  return { sourceDir, runtimeArgs };
}

function normalizeKunSourceRoot(candidate) {
  const expanded = expandHome(candidate.trim());
  if (!expanded) return null;
  if (existsSync(path.join(expanded, 'kun', 'package.json'))) return path.resolve(expanded);
  if (existsSync(path.join(expanded, 'package.json')) && path.basename(expanded) === 'kun') {
    return path.dirname(path.resolve(expanded));
  }
  return null;
}

function expandHome(value) {
  if (value === '~') return homedir();
  if (value.startsWith('~/') || value.startsWith(`~${path.sep}`)) {
    return path.join(homedir(), value.slice(2));
  }
  return value;
}

function run(command, args) {
  return spawnSync(command, args, {
    cwd: sourceRoot,
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: {
      ...process.env,
      ELECTRON_SKIP_BINARY_DOWNLOAD: process.env.ELECTRON_SKIP_BINARY_DOWNLOAD || '1',
      npm_config_audit: 'false',
      npm_config_fund: 'false',
    },
  });
}
