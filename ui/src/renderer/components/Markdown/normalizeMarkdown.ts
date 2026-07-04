/**
 * @license
 * Copyright 2025-2026 NomiFun (nomifun.com)
 * SPDX-License-Identifier: Apache-2.0
 */

const MERMAID_START_KEYWORDS = [
  'architecture-beta',
  'block-beta',
  'C4Component',
  'C4Container',
  'C4Context',
  'C4Dynamic',
  'classDiagram',
  'erDiagram',
  'flowchart',
  'gantt',
  'gitGraph',
  'graph',
  'journey',
  'mindmap',
  'packet-beta',
  'pie',
  'quadrantChart',
  'requirementDiagram',
  'sankey-beta',
  'sequenceDiagram',
  'stateDiagram',
  'stateDiagram-v2',
  'timeline',
  'xychart-beta',
] as const;

const MERMAID_KEYWORD_PATTERN = MERMAID_START_KEYWORDS.map((keyword) =>
  keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
).join('|');
const MERMAID_FENCE_WITH_INLINE_START = new RegExp(
  `^(\\s{0,3})(\`{3,}|~{3,})\\s*mermaid\\s*(${MERMAID_KEYWORD_PATTERN})\\b[ \\t]*(.*)$`,
  'i'
);
const MERMAID_FENCE_WITH_JOINED_START = new RegExp(
  `^(\\s{0,3})(\`{3,}|~{3,})\\s*mermaid(${MERMAID_KEYWORD_PATTERN})\\b[ \\t]*(.*)$`,
  'i'
);
const FENCE_LINE = /^(\s{0,3})(`{3,}|~{3,})(.*)$/;
const MERMAID_OPENING_FENCE = /^\s{0,3}(`{3,}|~{3,})mermaid\s*$/i;
const FLOWCHART_DIRECTIVE = /^(\s*(?:flowchart|graph)\s+(?:TB|TD|BT|RL|LR))\s+(.+)$/i;
const FLOWCHART_EDGE_START = /\s+([A-Za-z_][\w-]*(?:\[[^\]\n]*\])?\s*(?:-->|---|==>|-.->|--\|))/g;

function splitTrailingFence(line: string, fence: string): string[] {
  const trimmedEnd = line.trimEnd();
  if (trimmedEnd === fence) return [line];
  if (!trimmedEnd.endsWith(fence)) return [line];

  const beforeFence = trimmedEnd.slice(0, -fence.length).trimEnd();
  if (!beforeFence) return [line];

  const trailingWhitespace = line.slice(trimmedEnd.length);
  return [`${beforeFence}${trailingWhitespace}`, fence];
}

function normalizeMermaidFenceShape(text: string): string {
  const lines = text.split('\n');
  const normalized: string[] = [];
  let mermaidFence: string | null = null;

  for (const line of lines) {
    if (mermaidFence) {
      const parts = splitTrailingFence(line, mermaidFence);
      normalized.push(...parts);
      if (parts.at(-1)?.trim() === mermaidFence) mermaidFence = null;
      continue;
    }

    const inlineStart = line.match(MERMAID_FENCE_WITH_INLINE_START) ?? line.match(MERMAID_FENCE_WITH_JOINED_START);
    if (inlineStart) {
      const [, indent, fence, keyword, rest] = inlineStart;
      normalized.push(`${indent}${fence}mermaid`);
      const diagramStart = `${keyword}${rest ? ` ${rest}` : ''}`.trimEnd();
      const parts = splitTrailingFence(diagramStart, fence);
      normalized.push(...parts);
      if (parts.at(-1)?.trim() !== fence) mermaidFence = fence;
      continue;
    }

    normalized.push(line);
  }

  return normalized.join('\n');
}

function isFenceLine(line: string): boolean {
  return FENCE_LINE.test(line);
}

function isTableRow(line: string): boolean {
  const trimmed = line.trim();
  return trimmed.startsWith('|') && trimmed.endsWith('|') && (trimmed.match(/\|/g)?.length ?? 0) >= 2;
}

function isTableDelimiter(line: string): boolean {
  const trimmed = line.trim().replace(/^\|/, '').replace(/\|$/, '');
  if (!trimmed) return false;

  return trimmed.split('|').every((cell) => /^:?-{3,}:?$/.test(cell.trim()));
}

function normalizeLooseMarkdownBlocks(segment: string): string {
  let text = segment.replace(/^(\s{0,3}#{1,6})([^\s#\n])/gm, '$1 $2');

  text = text.replace(/^(\s{0,3}#{1,6}\s+[^|\n]+?)\s*(\|[^\n]*\|)\s*$/gm, (_match, heading, tableHeader) => {
    return `${String(heading).trimEnd()}\n\n${String(tableHeader).trim()}`;
  });

  const lines = text.split('\n');
  const withTableSpacing: string[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const previous = withTableSpacing.at(-1);
    const next = lines[index + 1];
    if (
      previous !== undefined &&
      previous.trim() !== '' &&
      !isTableRow(previous) &&
      isTableRow(line) &&
      next !== undefined &&
      isTableDelimiter(next)
    ) {
      withTableSpacing.push('');
    }
    withTableSpacing.push(line);
  }

  return withTableSpacing.join('\n');
}

function normalizeFlowchartLine(line: string): string {
  const compactLine = line.trimStart();
  const directive = compactLine.match(FLOWCHART_DIRECTIVE);
  if (directive) {
    return `${directive[1]}\n${normalizeFlowchartLine(directive[2])}`;
  }

  return compactLine.replace(FLOWCHART_EDGE_START, '\n$1');
}

function normalizeMermaidDiagramSource(source: string): string {
  const firstMeaningfulLine = source
    .split('\n')
    .map((line) => line.trim())
    .find(Boolean);
  if (!firstMeaningfulLine || !/^(flowchart|graph)\b/i.test(firstMeaningfulLine)) {
    return source;
  }

  return source
    .split('\n')
    .map((line) => normalizeFlowchartLine(line).trimEnd())
    .join('\n');
}

function normalizeFenceSegment(lines: string[]): string {
  const opening = lines[0] ?? '';
  if (!MERMAID_OPENING_FENCE.test(opening)) {
    return lines.join('\n');
  }

  const closingIndex = lines.length > 1 && lines.at(-1)?.trim() === opening.trim().match(/^(`{3,}|~{3,})/)?.[1]
    ? lines.length - 1
    : -1;
  const contentEnd = closingIndex >= 0 ? closingIndex : lines.length;
  const content = lines.slice(1, contentEnd).join('\n');
  const normalized = normalizeMermaidDiagramSource(content);
  if (closingIndex >= 0) {
    return [opening, normalized, lines[closingIndex]].join('\n');
  }
  return [opening, normalized].join('\n');
}

/**
 * Models often emit almost-Markdown while streaming. Keep the source intact
 * semantically, but repair common block-boundary mistakes before ReactMarkdown
 * parses it.
 */
export function normalizeMarkdownForRendering(markdown: string): string {
  const text = normalizeMermaidFenceShape(markdown.replace(/\r\n?/g, '\n'));
  const lines = text.split('\n');
  const output: string[] = [];
  let looseSegment: string[] = [];
  let fence: string | null = null;
  let fencedSegment: string[] = [];

  const flushLoose = () => {
    if (!looseSegment.length) return;
    output.push(normalizeLooseMarkdownBlocks(looseSegment.join('\n')));
    looseSegment = [];
  };

  const flushFence = () => {
    if (!fencedSegment.length) return;
    output.push(normalizeFenceSegment(fencedSegment));
    fencedSegment = [];
  };

  for (const line of lines) {
    if (fence) {
      fencedSegment.push(line);
      if (line.trim() === fence) {
        flushFence();
        fence = null;
      }
      continue;
    }

    const match = line.match(FENCE_LINE);
    if (match) {
      flushLoose();
      fence = match[2];
      fencedSegment.push(line);
      continue;
    }

    looseSegment.push(line);
  }

  flushFence();
  flushLoose();

  return output.join('\n');
}
