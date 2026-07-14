/**
 * @license
 * Copyright 2025-2026 NomiFun (nomifun.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ICssTheme } from '@/common/config/storage.ts';

// Theme CSS loaded as raw strings via Vite ?raw imports
import hkBlueCss from './presets/hk-blue.css?raw';
import hkWhiteCss from './presets/hk-white.css?raw';
import hkPurpleCss from './presets/hk-purple.css?raw';
import hkBlackCss from './presets/hk-black.css?raw';
import hkGoldCss from './presets/hk-gold.css?raw';

/**
 * 系统默认主题 ID / System default theme ID
 * 无显式选择时（空 activeThemeId）回退并应用此主题；也是主题缺失时的兜底。
 * Applied when no theme is explicitly selected (empty activeThemeId); also the fallback when a theme is missing.
 */
export const DEFAULT_THEME_ID = 'hk-blue';

/**
 * 预设 CSS 主题列表 / Preset CSS themes list
 * 这些主题是内置的，用户可以直接选择使用 / These themes are built-in and can be directly used by users
 * 新增主题请遵循 presets/README.md 的主题契约 / New themes must follow the contract in presets/README.md
 * 数组顺序 = 卡片展示顺序：默认主题「蓝色主体」置首。
 * Array order = card display order: the default "Blue Primary" first.
 */
export const PRESET_THEMES: ICssTheme[] = [
  {
    id: 'hk-blue',
    name: '蓝色主体',
    is_preset: true,
    css: hkBlueCss,
    created_at: Date.now(),
    updated_at: Date.now(),
  },
  {
    id: 'hk-white',
    name: '白色',
    is_preset: true,
    css: hkWhiteCss,
    created_at: Date.now(),
    updated_at: Date.now(),
  },
  {
    id: 'hk-purple',
    name: '紫色',
    is_preset: true,
    css: hkPurpleCss,
    created_at: Date.now(),
    updated_at: Date.now(),
  },
  {
    id: 'hk-black',
    name: '黑色',
    is_preset: true,
    css: hkBlackCss,
    created_at: Date.now(),
    updated_at: Date.now(),
  },
  {
    id: 'hk-gold',
    name: '金黄色',
    is_preset: true,
    css: hkGoldCss,
    created_at: Date.now(),
    updated_at: Date.now(),
  },
];
