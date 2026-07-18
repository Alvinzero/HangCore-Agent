#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const configPath = resolve(ROOT, 'apps/desktop/tauri.conf.json');
const config = JSON.parse(readFileSync(configPath, 'utf8'));
const expectedHook = 'nsis/install-identity-migration.nsh';
const hook = config.bundle?.windows?.nsis?.installerHooks;
const problems = [];

if (config.productName !== 'HK AI Platform') problems.push(`productName 必须为 HK AI Platform，当前为 ${config.productName}`);
if (config.identifier !== 'com.hangshun.hangcoreagent') problems.push(`identifier 发生漂移：${config.identifier}`);
if (hook !== expectedHook) problems.push(`缺少 Windows 旧安装迁移钩子：bundle.windows.nsis.installerHooks=${expectedHook}`);

const hookPath = resolve(ROOT, 'apps/desktop', hook || expectedHook);
if (!existsSync(hookPath)) {
  problems.push(`迁移钩子不存在：${hookPath}`);
} else {
  const source = readFileSync(hookPath, 'utf8');
  for (const marker of [
    '!define LEGACY_PRODUCT_NAME "HangCore Agent"',
    '!define CURRENT_PRODUCT_NAME "HK AI Platform"',
    '!define LEGACY_INSTALL_KEY "Software\\hangshun\\${LEGACY_PRODUCT_NAME}"',
    'NSIS_HOOK_PREINSTALL',
    'NSIS_HOOK_POSTINSTALL',
    'UninstallString',
    '/UPDATE',
    '$DESKTOP\\${LEGACY_PRODUCT_NAME}.lnk',
    '$SMPROGRAMS\\${LEGACY_PRODUCT_NAME}.lnk',
    'CurrentVersion\\Run',
    '${AndIf} $LegacyHadDesktopShortcut == 0',
    '${AndIf} $LegacyHadStartMenuShortcut == 0',
    '${AndIf} $LegacyAutostartCommand == ""',
  ]) {
    if (!source.includes(marker)) problems.push(`迁移钩子缺少标记：${marker}`);
  }
  if (/\$APPDATA|RmDir\s+\/r\s+[^\n]*(NomiFun|com\.hangshun)/i.test(source)) {
    problems.push('迁移钩子不得删除应用数据目录');
  }
}

if (problems.length) {
  for (const problem of problems) console.error(`✗ ${problem}`);
  process.exit(1);
}

console.log('✓ Windows 安装身份与旧版迁移合同有效。');
