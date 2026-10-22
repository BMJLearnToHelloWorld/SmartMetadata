/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */

export const LINEAGE_DEPTH_MIN = 0;
export const LINEAGE_DEPTH_MAX = 3;
export const LINEAGE_DEPTH_DEFAULT = 1;

export const SEARCH_SIZE_DEFAULT = 10;
export const SEARCH_SIZE_MAX = 50;
export const LIST_LIMIT_DEFAULT = 25;
export const LIST_LIMIT_MAX = 100;

export function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, Math.trunc(numeric)));
}

export function clampLineageDepth(value: unknown): number {
  return clampInt(value, LINEAGE_DEPTH_MIN, LINEAGE_DEPTH_MAX, LINEAGE_DEPTH_DEFAULT);
}

export function requireFqn(fqn: string | undefined): string {
  const trimmed = fqn?.trim() ?? '';
  if (!trimmed) {
    throw new Error('FQN is required');
  }
  return trimmed;
}

export function requireToken(value: string | undefined, label: string): string {
  const trimmed = value?.trim() ?? '';
  if (!trimmed) {
    throw new Error(`${label} is required`);
  }
  return trimmed;
}

/**
 * MessageParser entity link used by ConversationResource:
 * `<#E::{entityType}::{fqn}>`.
 */
export function toEntityLink(entityType: string, fqn: string): string {
  return `<#E::${requireToken(entityType, 'entityType').toLowerCase()}::${requireFqn(fqn)}>`;
}

export function normalizeEntityLink(about: string): string {
  const trimmed = about.trim();
  if (!trimmed.startsWith('<#E::') || !trimmed.endsWith('>')) {
    throw new Error('about must be a MessageParser entity link such as <#E::table::service.db.schema.table>');
  }
  const inner = trimmed.slice('<#E::'.length, -1);
  const sep = inner.indexOf('::');
  const entityType = sep === -1 ? '' : inner.slice(0, sep);
  const rest = sep === -1 ? '' : inner.slice(sep + 2);
  if (!/^\w+$/.test(entityType) || !rest) {
    throw new Error('about must be a MessageParser entity link such as <#E::table::service.db.schema.table>');
  }
  return `<#E::${entityType.toLowerCase()}::${rest}>`;
}

export function resolveAbout(input: { about?: string; entityType?: string; fqn?: string }): string {
  const about = input.about?.trim();
  if (about) {
    return normalizeEntityLink(about);
  }
  return toEntityLink(input.entityType ?? '', input.fqn ?? '');
}
