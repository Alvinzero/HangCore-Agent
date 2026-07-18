#!/usr/bin/env node
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_OUTPUT_DIR = path.join(ROOT, 'managed-runtimes', 'kun');
const DEFAULT_BUILD_DIR = path.join(ROOT, '.managed-runtime-build', 'Kun');
const DEFAULT_REPO = 'https://github.com/KunAgent/Kun.git';
const DEFAULT_REF = 'master';
const BUNDLE_CLEANUP_VERSION = 1;
const CLUTTER_DIR_NAMES = new Set([
  '.bin',
  '.github',
  '.vscode',
  '__tests__',
  'benchmark',
  'benchmarks',
  'coverage',
  'doc',
  'docs',
  'example',
  'examples',
  'test',
  'tests',
]);

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
const cleanup = cleanNodeModulesForBundle(path.join(outputDir, 'kun', 'node_modules'));
if (cleanup.removedFiles > 0 || cleanup.removedDirs > 0) {
  log(`removed ${cleanup.removedFiles} files and ${cleanup.removedDirs} directories from bundled node_modules`);
}

const manifest = {
  runtime: 'kun',
  layoutVersion: 1,
  bundleCleanupVersion: BUNDLE_CLEANUP_VERSION,
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
    hasCurrentManifest(dir)
  );
}

function hasCurrentManifest(dir) {
  const manifestPath = path.join(dir, 'hangcore-managed-runtime.json');
  if (!existsSync(manifestPath)) return false;
  try {
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    return (
      manifest.runtime === 'kun' &&
      manifest.layoutVersion === 1 &&
      manifest.bundleCleanupVersion === BUNDLE_CLEANUP_VERSION
    );
  } catch {
    return false;
  }
}

function copyRequired(from, to) {
  if (!existsSync(from)) fail(`Required runtime path is missing: ${from}`);
  cpSync(from, to, { recursive: true, force: true, dereference: true });
}

function copyOptional(from, to) {
  if (existsSync(from)) cpSync(from, to, { recursive: true, force: true, dereference: true });
}

function cleanNodeModulesForBundle(nodeModulesDir) {
  const stats = { removedFiles: 0, removedDirs: 0 };
  walkAndClean(nodeModulesDir, nodeModulesDir, stats);
  removeEmptyDirs(nodeModulesDir, nodeModulesDir, stats);
  return stats;
}

function walkAndClean(dir, nodeModulesDir, stats) {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const entryPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (shouldRemoveBundleDir(entryPath, entry.name, nodeModulesDir)) {
        rmSync(entryPath, { recursive: true, force: true });
        stats.removedDirs += 1;
        continue;
      }
      walkAndClean(entryPath, nodeModulesDir, stats);
    } else if (entry.isFile() && shouldRemoveBundleFile(entry.name)) {
      rmSync(entryPath, { force: true });
      stats.removedFiles += 1;
    }
  }
}

function shouldRemoveBundleDir(dir, name, nodeModulesDir) {
  if (CLUTTER_DIR_NAMES.has(name)) return true;
  if (name !== 'src') return false;
  const packageJson = findNearestPackageJson(path.dirname(dir), nodeModulesDir);
  if (!packageJson) return false;
  return !packageRuntimeReferencesDirectory(packageJson, 'src');
}

function findNearestPackageJson(startDir, nodeModulesDir) {
  let current = startDir;
  while (isInsideOrEqual(current, nodeModulesDir)) {
    const packageJson = path.join(current, 'package.json');
    if (existsSync(packageJson)) return packageJson;
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return null;
}

function packageRuntimeReferencesDirectory(packageJson, dirName) {
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(packageJson, 'utf8'));
  } catch {
    return true;
  }
  return referencesBundleDir(manifest.main, dirName) ||
    referencesBundleDir(manifest.module, dirName) ||
    referencesBundleDir(manifest.browser, dirName) ||
    referencesBundleDir(manifest.bin, dirName) ||
    referencesBundleDir(manifest.exports, dirName);
}

function referencesBundleDir(value, dirName, key = '') {
  if (key === 'types' || key === 'typings' || key.includes('source')) return false;
  if (typeof value === 'string') return stringReferencesDir(value, dirName);
  if (Array.isArray(value)) return value.some((item) => referencesBundleDir(item, dirName, key));
  if (value && typeof value === 'object') {
    return Object.entries(value).some(([childKey, childValue]) => referencesBundleDir(childValue, dirName, childKey));
  }
  return false;
}

function stringReferencesDir(value, dirName) {
  const normalized = value.replace(/\\/g, '/').replace(/^\.\//, '');
  return normalized === dirName || normalized.startsWith(`${dirName}/`);
}

function removeEmptyDirs(dir, root, stats) {
  if (!existsSync(dir)) return false;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      removeEmptyDirs(path.join(dir, entry.name), root, stats);
    }
  }
  if (dir !== root && readdirSync(dir).length === 0) {
    rmSync(dir, { recursive: true, force: true });
    stats.removedDirs += 1;
    return true;
  }
  return false;
}

function shouldRemoveBundleFile(name) {
  const lowerName = name.toLowerCase();
  if (
    lowerName.endsWith('.map') ||
    lowerName.endsWith('.ts') ||
    lowerName.endsWith('.tsx') ||
    lowerName.endsWith('.mts') ||
    lowerName.endsWith('.cts')
  ) {
    return true;
  }
  if (lowerName.endsWith('.md') || lowerName.endsWith('.markdown')) {
    return !lowerName.startsWith('license') && !lowerName.startsWith('licence');
  }
  return lowerName.startsWith('readme.') || lowerName.startsWith('changelog.') || lowerName.startsWith('history.');
}

function isInsideOrEqual(child, parent) {
  const relative = path.relative(parent, child);
  return relative === '' || (!!relative && !relative.startsWith('..') && !path.isAbsolute(relative));
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
