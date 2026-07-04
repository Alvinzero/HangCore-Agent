#!/usr/bin/env node
import { closeSync, existsSync, mkdirSync, openSync, writeSync } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import { homedir } from 'node:os';
import path from 'node:path';
import process from 'node:process';

const { sourceDir, runtimeArgs } = parseArgs(process.argv.slice(2));
const sourceRoot = normalizeKunSourceRoot(sourceDir || process.env.KUN_SOURCE_DIR || '');
const foreground = parseBool(process.env.KUN_RUNTIME_FOREGROUND, false);

if (!sourceRoot) {
  logMessage('[kun-source-runtime] Kun source was not found. Set KUN_SOURCE_DIR to a Kun checkout that contains kun/package.json.\n');
  process.exit(127);
}

const packageDir = path.join(sourceRoot, 'kun');
const distEntry = path.join(packageDir, 'dist', 'cli', 'serve-entry.js');

if (!existsSync(distEntry)) {
  const buildFromRoot = existsSync(path.join(sourceRoot, 'package-lock.json')) && existsSync(path.join(sourceRoot, 'package.json'));
  const installPrefix = buildFromRoot ? sourceRoot : packageDir;
  const install = run('npm', ['--prefix', installPrefix, 'ci'], foreground);
  if (install.status !== 0) process.exit(install.status || 1);
  const build = buildFromRoot
    ? run('npm', ['--prefix', sourceRoot, 'run', 'build:kun'], foreground)
    : run('npm', ['--prefix', packageDir, 'run', 'build'], foreground);
  if (build.status !== 0) process.exit(build.status || 1);
}

const env = {
  ...process.env,
  KUN_SOURCE_DIR: sourceRoot,
};
if (env.KUN_API_KEY && !env.DEEPSEEK_API_KEY) env.DEEPSEEK_API_KEY = env.KUN_API_KEY;
if (env.KUN_BASE_URL && !env.DEEPSEEK_BASE_URL) env.DEEPSEEK_BASE_URL = env.KUN_BASE_URL;

const jsRuntime = process.env.KUN_JS_RUNTIME_COMMAND || process.env.KUN_NODE_COMMAND || process.execPath;
const childStdio = foreground ? 'inherit' : managedLogStdio();
const child = spawn(jsRuntime, [distEntry, ...runtimeArgs], {
  cwd: packageDir,
  env,
  stdio: childStdio,
  windowsHide: true,
});
closeManagedLogStdio(childStdio);

child.once('error', (error) => {
  logMessage(`[kun-source-runtime] failed to start Kun runtime: ${error.message}\n`);
  process.exit(127);
});

child.once('exit', (code, signal) => {
  if (signal) {
    logMessage(`[kun-source-runtime] Kun runtime exited from signal ${signal}\n`);
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

function run(command, args, foregroundMode) {
  const stdio = foregroundMode ? 'inherit' : managedLogStdio();
  try {
    return spawnSync(command, args, {
      cwd: sourceRoot,
      stdio,
      shell: process.platform === 'win32',
      windowsHide: true,
      env: {
        ...process.env,
        ELECTRON_SKIP_BINARY_DOWNLOAD: process.env.ELECTRON_SKIP_BINARY_DOWNLOAD || '1',
        npm_config_audit: 'false',
        npm_config_fund: 'false',
      },
    });
  } finally {
    closeManagedLogStdio(stdio);
  }
}

function parseBool(value, fallback) {
  if (value == null || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).trim().toLowerCase());
}

function managedLogStdio() {
  const fd = openManagedLog();
  return ['ignore', fd, fd];
}

function closeManagedLogStdio(stdio) {
  if (!Array.isArray(stdio)) return;
  const fd = stdio[1];
  if (typeof fd === 'number') {
    try {
      closeSync(fd);
    } catch {
      // Best effort; the child already has its own duplicated handle.
    }
  }
}

function openManagedLog() {
  const logDir = runtimeLogDir();
  mkdirSync(logDir, { recursive: true });
  return openSync(path.join(logDir, 'kun-runtime.log'), 'a');
}

function runtimeLogDir() {
  const explicit = process.env.KUN_RUNTIME_LOG_DIR?.trim();
  if (explicit) return path.resolve(explicit);
  const dataDir =
    runtimeArgValue('--data-dir') ||
    process.env.KUN_DATA_DIR ||
    process.env.KUN_RUNTIME_DATA_DIR ||
    path.join(sourceRoot || process.cwd(), '.kun-runtime');
  return path.join(path.resolve(dataDir), 'logs');
}

function runtimeArgValue(name) {
  for (let i = 0; i < runtimeArgs.length; i += 1) {
    const arg = runtimeArgs[i];
    if (arg === name) return runtimeArgs[i + 1] || '';
    if (arg.startsWith(`${name}=`)) return arg.slice(name.length + 1);
  }
  return '';
}

function logMessage(message) {
  if (foreground) {
    process.stderr.write(message);
    return;
  }
  const fd = openManagedLog();
  try {
    writeSync(fd, message);
  } catch {
    // Logging must never prevent the wrapper from returning its real exit code.
  } finally {
    closeManagedLogStdio(['ignore', fd, fd]);
  }
}
