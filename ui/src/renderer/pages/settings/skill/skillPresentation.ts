/**
 * Shared presentation helpers for the Skills Hub. Extracted from the old
 * flat-list SkillsHubSettings so the card grid and the page share one source.
 */
import type { AssistantTag } from '@/common/types/agent/assistantTypes';
import type { SkillInfo } from '@/renderer/pages/settings/AssistantSettings/types';

/** Normalize a skill name for use in a stable data-testid. */
export const normalizeTestId = (name: string): string => name.replace(/[:/\s<>"'|?*]/g, '-');

type BuiltinSkillCopy = {
  name: string;
  description: string;
};

const ZH_CN_BUILTIN_SKILL_COPY: Record<string, BuiltinSkillCopy> = {
  cron: {
    name: '定时任务',
    description: '创建、查询和更新定时任务，让会话在指定时间自动执行操作。',
  },
  mermaid: {
    name: 'Mermaid 图表',
    description: '将 Mermaid 流程图、时序图、状态图、类图或 ER 图渲染为 SVG 或终端友好的 ASCII/Unicode 图。',
  },
  moltbook: {
    name: 'Moltbook Agent 社交',
    description: '面向 AI Agent 的社交网络，可发布动态、评论、点赞并创建社区。',
  },
  'morph-ppt': {
    name: 'Morph 动画 PPT',
    description: '制作带 PowerPoint Morph 平滑转场的演示文稿，适合跨页连续动画、图形移动、缩放和旋转。',
  },
  'morph-ppt-3d': {
    name: '3D Morph PPT',
    description: '在 Morph PPT 基础上插入 GLB 3D 模型，支持电影感镜头、模型内容布局和更丰富的视觉设计。',
  },
  'nomifun-skills': {
    name: 'Nomi 技能市场',
    description: '访问 Nomi Skills 注册表，发现、下载和管理可复用的 AI Agent 技能。',
  },
  'nomifun-webui-setup': {
    name: 'WebUI 远程访问配置',
    description: '引导配置 NomiFun WebUI 远程访问，覆盖局域网、Tailscale VPN、服务器部署和常见故障排查。',
  },
  officecli: {
    name: 'Office 文档工具',
    description: '使用 officecli 创建、分析、校对和修改 Word、Excel、PowerPoint 文档。',
  },
  'officecli-academic-paper': {
    name: '学术论文 Word',
    description: '生成学术论文风格的 Word 文档，支持引用格式、编号公式、图表交叉引用、脚注、参考文献和双栏排版。',
  },
  'officecli-data-dashboard': {
    name: 'Excel 数据看板',
    description: '从 CSV 或表格数据生成 Excel 数据看板，包含 KPI 卡片、图表、迷你图和条件格式。',
  },
  'officecli-docx': {
    name: 'Word 文档',
    description: '处理 Word 文档：创建、读取、解析、编辑、更新报告、信件、备忘录、提案、模板、批注和目录。',
  },
  'officecli-financial-model': {
    name: 'Excel 财务模型',
    description: '在 Excel 中构建财务模型，包括三大报表、DCF、LBO、SaaS 单位经济、敏感性和情景分析。',
  },
  'officecli-pitch-deck': {
    name: '融资路演 PPT',
    description: '制作融资或投资人路演 PPT，覆盖种子轮、A/B/C 轮、战略融资等场景。',
  },
  'officecli-pptx': {
    name: 'PPT 演示文稿',
    description: '处理 PowerPoint 演示文稿：创建、读取、解析、编辑、合并、拆分、模板、版式、演讲者备注和批注。',
  },
  'officecli-word-form': {
    name: 'Word 可填写表单',
    description: '创建可填写的 Word 表单，支持内容控件、复选框、邮件合并占位符和文档保护。',
  },
  'officecli-xlsx': {
    name: 'Excel 表格',
    description: '处理 Excel 工作簿或 CSV/TSV：创建表格、模型、看板、公式、图表、透视表和模板。',
  },
  'openclaw-setup': {
    name: 'OpenClaw 配置',
    description: '安装、部署、配置和排查 OpenClaw 个人 AI 助手，覆盖 Gateway、Channels、Agents 和自动化任务。',
  },
  'skill-creator': {
    name: '技能创建器',
    description: '指导创建或更新高质量技能包，把专门知识、流程和工具集成到 Agent 能力中。',
  },
  'star-office-helper': {
    name: 'Star Office 可视化',
    description: '安装、启动、连接和排查 Star Office 等可视化 companion 项目，用于展示 Nomi/OpenClaw 的 Agent 状态。',
  },
  'story-roleplay': {
    name: '故事角色扮演',
    description: '解析并应用角色卡和世界书文件，支持 PNG、WebP、JSON 等 SillyTavern 兼容格式和关键词触发。',
  },
  'weixin-file-send': {
    name: '微信文件发送',
    description: '当用户需要“发给我”文件或图片时，将本地已生成文件回传到当前聊天。',
  },
  'x-recruiter': {
    name: 'X 招聘助手',
    description: '用于在 X 发布招聘帖子，包含文案规范、图片生成提示和自动化发布脚本。',
  },
  'xiaohongshu-recruiter': {
    name: '小红书招聘助手',
    description: '用于准备并发布小红书 AI 岗位招聘内容，包含极客风封面图、详情图和确认门控发布流程。',
  },
};

const isChineseLocale = (localeKey: string): boolean => localeKey.toLowerCase().startsWith('zh');

const zhBuiltinCopy = (skill: Pick<SkillInfo, 'name' | 'source'>, localeKey: string): BuiltinSkillCopy | undefined => {
  if (!isChineseLocale(localeKey)) return undefined;
  return ZH_CN_BUILTIN_SKILL_COPY[skill.name];
};

export const getSkillDisplayName = (skill: Pick<SkillInfo, 'name' | 'source'>, localeKey: string): string =>
  zhBuiltinCopy(skill, localeKey)?.name || skill.name;

export const getSkillDisplayDescription = (
  skill: Pick<SkillInfo, 'name' | 'description' | 'source'>,
  localeKey: string
): string => zhBuiltinCopy(skill, localeKey)?.description || skill.description || '';

export const getSkillTagLabel = (
  tagKey: string,
  tagByKey: Map<string, AssistantTag>,
  localeKey: string
): string => {
  const tag = tagByKey.get(tagKey);
  return tag?.label_i18n?.[localeKey] || tag?.label || tagKey;
};

export const getSkillSearchText = (
  skill: Pick<SkillInfo, 'name' | 'description' | 'source' | 'audience_tags' | 'scenario_tags'>,
  tagByKey: Map<string, AssistantTag>,
  localeKey: string
): string => {
  const tagLabels = [...(skill.audience_tags ?? []), ...(skill.scenario_tags ?? [])].map((key) =>
    getSkillTagLabel(key, tagByKey, localeKey)
  );
  return [
    skill.name,
    skill.description,
    getSkillDisplayName(skill, localeKey),
    getSkillDisplayDescription(skill, localeKey),
    ...tagLabels,
  ]
    .filter(Boolean)
    .join(' ');
};

/**
 * Deterministic letter-avatar color class keyed off the skill name. These
 * fixed hexes are an intentional, pre-existing exception to the theme-variable
 * rule (the avatar palette must stay legible across all themes); carried over
 * verbatim from the previous SkillsHubSettings implementation.
 */
export const getAvatarColorClass = (name: string): string => {
  if (!name) return 'bg-[var(--color-primary)] text-white';
  const colors = [
    'bg-[#F53F3F] text-white', // Red
    'bg-[#F77234] text-white', // Orange
    'bg-[#B8860B] text-white', // Gold
    'bg-[#F5319D] text-white', // Pink
    'bg-[#C41D7F] text-white', // Raspberry
    'bg-[#722ED1] text-white', // Purple
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
};
