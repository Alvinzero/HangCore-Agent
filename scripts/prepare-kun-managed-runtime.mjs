#!/usr/bin/env node
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_OUTPUT_DIR = path.join(ROOT, 'managed-runtimes', 'kun');
const DEFAULT_BUILD_DIR = path.join(ROOT, '.managed-runtime-build', 'Kun');
const DEFAULT_REPO = 'https://github.com/KunAgent/Kun.git';
const DEFAULT_REF = 'master';

const options = parseArgs(process.argv.slice(2));
const outputDir = path.resolve(options.outputDir || process.env.KUN_MANAGED_RUNTIME_OUTPUT_DIR || DEFAULT_OUTPUT_DIR);
const sourceRoot = resolveSourceRoot(options);
const packageDir = path.join(sourceRoot, 'kun');
const distEntry = path.join(packageDir, 'dist', 'cli', 'serve-entry.js');
const nodeModules = path.join(packageDir, 'node_modules');
const buildFromRoot = existsSync(path.join(sourceRoot, 'package-lock.json')) && existsSync(path.join(sourceRoot, 'package.json'));
const installPrefix = buildFromRoot ? sourceRoot : packageDir;

if (!options.force && isPrepared(outputDir)) {
  log(`managed Kun runtime already prepared at ${outputDir}`);
  process.exit(0);
}

if (!options.skipBuild) {
  run('npm', ['--prefix', installPrefix, 'ci']);
  if (buildFromRoot) {
    run('npm', ['--prefix', sourceRoot, 'run', 'build:kun']);
  } else {
    run('npm', ['--prefix', packageDir, 'run', 'build']);
  }
}

if (!existsSync(distEntry)) {
  fail(`Kun runtime dist entry is missing: ${distEntry}`);
}
if (!existsSync(nodeModules)) {
  fail(`Kun runtime node_modules is missing: ${nodeModules}`);
}

rmSync(outputDir, { recursive: true, force: true });
mkdirSync(path.join(outputDir, 'kun'), { recursive: true });
copyRequired(path.join(packageDir, 'package.json'), path.join(outputDir, 'kun', 'package.json'));
copyOptional(path.join(packageDir, 'package-lock.json'), path.join(outputDir, 'kun', 'package-lock.json'));
copyRequired(path.join(packageDir, 'dist'), path.join(outputDir, 'kun', 'dist'));
copyRequired(nodeModules, path.join(outputDir, 'kun', 'node_modules'));
if (!options.skipBuild) {
  run('npm', ['--prefix', path.join(outputDir, 'kun'), 'prune', '--omit=dev']);
}

const manifest = {
  runtime: 'kun',
  layoutVersion: 1,
  source: redactHome(sourceRoot),
  repo: process.env.KUN_MANAGED_REPO || DEFAULT_REPO,
  ref: process.env.KUN_MANAGED_REF || DEFAULT_REF,
  preparedAt: new Date().toISOString(),
};
writeFileSync(path.join(outputDir, 'hangcore-managed-runtime.json'), `${JSON.stringify(manifest, null, 2)}\n`);
log(`prepared managed Kun runtime at ${outputDir}`);

function parseArgs(argv) {
  const parsed = {
    sourceDir: '',
    outputDir: '',
    skipBuild: false,
    force: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--source-dir') parsed.sourceDir = argv[++i] || '';
    else if (arg.startsWith('--source-dir=')) parsed.sourceDir = arg.slice('--source-dir='.length);
    else if (arg === '--output-dir') parsed.outputDir = argv[++i] || '';
    else if (arg.startsWith('--output-dir=')) parsed.outputDir = arg.slice('--output-dir='.length);
    else if (arg === '--skip-build') parsed.skipBuild = true;
    else if (arg === '--force') parsed.force = true;
    else if (arg === '--help' || arg === '-h') {
      process.stdout.write(`Usage: prepare-kun-managed-runtime [--source-dir DIR] [--output-dir DIR] [--skip-build] [--force]\n`);
      process.exit(0);
    } else {
      fail(`Unknown argument: ${arg}`);
    }
  }
  return parsed;
}

function resolveSourceRoot(input) {
  const candidates = [
    input.sourceDir,
    process.env.KUN_MANAGED_SOURCE_DIR,
    process.env.KUN_SOURCE_DIR,
    path.join(ROOT, 'Kun'),
    path.join(ROOT, '..', 'Kun'),
    path.join(ROOT.replace(/_副本$/, ''), 'Kun'),
    path.join(path.dirname(ROOT), '航顺AI智能体', 'Kun'),
  ].filter(Boolean);

  for (const candidate of candidates) {
    const normalized = normalizeKunSourceRoot(String(candidate));
    if (normalized) return normalized;
  }

  return cloneKunSource();
}

function cloneKunSource() {
  const repo = process.env.KUN_MANAGED_REPO || DEFAULT_REPO;
  const ref = process.env.KUN_MANAGED_REF || DEFAULT_REF;
  rmSync(DEFAULT_BUILD_DIR, { recursive: true, force: true });
  mkdirSync(path.dirname(DEFAULT_BUILD_DIR), { recursive: true });
  run('git', ['clone', '--depth=1', repo, DEFAULT_BUILD_DIR], { cwd: ROOT });
  run('git', ['checkout', ref], { cwd: DEFAULT_BUILD_DIR });
  const normalized = normalizeKunSourceRoot(DEFAULT_BUILD_DIR);
  if (!normalized) fail(`Cloned Kun source does not contain kun/package.json: ${DEFAULT_BUILD_DIR}`);
  return normalized;
}

function normalizeKunSourceRoot(candidate) {
  const expanded = expandHome(candidate.trim());
  if (!expanded) return null;
  if (existsSync(path.join(expanded, 'kun', 'package.json'))) return path.resolve(expanded);
  if (existsSync(path.join(expanded, 'package.json')) && path.basename(expanded) === 'kun') return path.dirname(path.resolve(expanded));
  return null;
}

function expandHome(value) {
  if (value === '~') return homedir();
  if (value.startsWith('~/') || value.startsWith(`~${path.sep}`)) return path.join(homedir(), value.slice(2));
  return value;
}

function isPrepared(dir) {
  return (
    existsSync(path.join(dir, 'kun', 'package.json')) &&
    existsSync(path.join(dir, 'kun', 'dist', 'cli', 'serve-entry.js')) &&
    existsSync(path.join(dir, 'kun', 'node_modules')) &&
    existsSync(path.join(dir, 'hangcore-managed-runtime.json'))
  );
}

function copyRequired(from, to) {
  if (!existsSync(from)) fail(`Required runtime path is missing: ${from}`);
  cpSync(from, to, { recursive: true, force: true, dereference: true });
}

function copyOptional(from, to) {
  if (existsSync(from)) cpSync(from, to, { recursive: true, force: true, dereference: true });
}

function run(command, args, overrides = {}) {
  const result = spawnSync(command, args, {
    cwd: overrides.cwd || ROOT,
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: {
      ...process.env,
      ELECTRON_SKIP_BINARY_DOWNLOAD: process.env.ELECTRON_SKIP_BINARY_DOWNLOAD || '1',
      npm_config_audit: 'false',
      npm_config_fund: 'false',
    },
  });
  if (result.error) fail(`${command} failed: ${result.error.message}`);
  if (result.status !== 0) fail(`${command} ${args.join(' ')} exited with ${result.status}`);
}

function redactHome(value) {
  const home = homedir();
  return value.startsWith(home) ? `~${value.slice(home.length)}` : value;
}

function log(message) {
  process.stdout.write(`[prepare-kun-managed-runtime] ${message}\n`);
}

function fail(message) {
  process.stderr.write(`[prepare-kun-managed-runtime] ${message}\n`);
  process.exit(1);
}
