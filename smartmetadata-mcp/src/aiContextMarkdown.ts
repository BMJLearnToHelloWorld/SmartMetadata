/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */

/**
 * Markdown rendering for the `find_context` result.
 *
 * The shape follows the server-side render exactly — heading order,
 * section order, the stale cue and the excerpt hint — because an agent
 * prompt keyed on the layout must see the same layout whether the text
 * came from this side or the Java side. The knowledge item's `content`
 * arrives already capped at 2000 chars; a longer source is the excerpt,
 * and the hint says so rather than pretending the item is complete.
 * (ADR:2026-11-08-mcp-batch-a-read-tools)
 */

export const MAX_CONTENT_CHARS = 2000;
export const MAX_SUMMARY_CHARS = 150;

export interface KnowledgeItem {
  id?: string;
  type?: string;
  name?: string;
  displayName?: string;
  fullyQualifiedName?: string;
  // The REST find response carries the parent FQN as a string; the metric
  // attach may replace it with the full parent reference object.
  parent?: string | Record<string, unknown>;
  childrenCount?: number;
  content?: string;
  contentTruncated?: boolean;
  stale?: boolean;
  staleReasons?: string[];
  // Metric attach fields the JSON shape carries alongside the item.
  metricGroup?: string | Record<string, unknown>;
}

export interface CandidateAsset {
  fqn?: string;
  entityType?: string;
  via?: string;
}

const TYPE_LABELS: Record<string, string> = {
  glossaryTerm: 'Glossary Term',
  metric: 'Metric',
  page: 'Article',
  contextMemory: 'Knowledge Pill',
};

export function typeLabel(type: string | undefined): string {
  return TYPE_LABELS[type ?? ''] ?? type ?? '';
}

export function labelOf(item: KnowledgeItem): string {
  return item.displayName ?? item.name ?? item.fullyQualifiedName ?? '';
}

function yamlQuote(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n')}"`;
}

function contentOf(item: KnowledgeItem): string {
  const content = (item.content ?? '').trim();
  return content.length > MAX_CONTENT_CHARS
    ? content.slice(0, MAX_CONTENT_CHARS) + '…'
    : content;
}

function summaryOf(item: KnowledgeItem): string {
  const summary = (item.content ?? '').trim();
  return summary.length > MAX_SUMMARY_CHARS
    ? summary.slice(0, MAX_SUMMARY_CHARS) + '…'
    : summary;
}

/**
 * One knowledge item as markdown. The fqn is inline code so it stays
 * machine-readable inside a prose prompt; the parent is quoted YAML for the
 * same reason. `summary` is the same text, capped at 150 chars, and is what
 * a JSON caller sees as `summary`.
 */
export function renderItem(item: KnowledgeItem): string {
  let out = `\n### ${labelOf(item)} (${typeLabel(item.type)})\n`;
  out += `\`${item.fullyQualifiedName ?? ''}\`\n`;
  const parentFqn =
    typeof item.parent === 'string'
      ? item.parent
      : item.parent && typeof item.parent === 'object'
        ? String((item.parent as Record<string, unknown>).fullyQualifiedName ?? '')
        : '';
  if (parentFqn !== '') {
    out += `parent: ${yamlQuote(parentFqn)}\n`;
  }
  if (typeof item.childrenCount === 'number' && item.childrenCount > 0) {
    out += `childrenCount: ${item.childrenCount}\n`;
  }
  out += contentOf(item);
  if (item.stale && item.staleReasons && item.staleReasons.length > 0) {
    out += `\n_⚠ Stale — ${item.staleReasons.join(', ')}. Weigh this against the asset's current state before relying on it for decisions._\n`;
  }
  if (item.contentTruncated) {
    out += `\n_Excerpt — fetch the full content with get_knowledge_content(entityType="${item.type}", fqn="${item.fullyQualifiedName}")._\n`;
  }
  return out;
}

/**
 * The `find_context` markdown document: the knowledge items in order, then
 * the candidate assets, each with the source that surfaced it.
 */
export function renderFound(
  items: KnowledgeItem[],
  candidateAssets: CandidateAsset[],
): string {
  let out = '# Relevant Knowledge\n';
  for (const item of items) {
    out += renderItem(item);
  }
  if (candidateAssets.length > 0) {
    out += '\n# Candidate Assets\n\n';
    for (const asset of candidateAssets) {
      out += `- \`${asset.fqn ?? ''}\` (${asset.entityType ?? ''}) — via \`${asset.via ?? ''}\`\n`;
    }
  }
  return out.trim() + '\n';
}

export function toJsonItem(item: KnowledgeItem): Record<string, unknown> {
  const out: Record<string, unknown> = {
    id: item.id,
    type: item.type,
    name: item.name,
    displayName: item.displayName,
    fullyQualifiedName: item.fullyQualifiedName,
    parent: item.parent,
    childrenCount: item.childrenCount,
    content: item.content,
    summary: summaryOf(item),
    contentTruncated: item.contentTruncated,
    stale: item.stale,
    staleReasons: item.staleReasons,
  };
  if (item.metricGroup !== undefined) {
    out.metricGroup = item.metricGroup;
  }
  return out;
}

export function emptyFindContextMessage(query: string): string {
  return `No company knowledge found for this query: ${query}.`;
}
