/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import type { RestClient } from './client.js';
import {
  MAX_RESPONSE_CHARS,
  PART_RESPONSE_HEADROOM_CHARS,
  defaultBudgetChars,
  serializedLength,
} from './budget.js';

/**
 * `get_persona_context`: the active persona's context, one page at a time.
 *
 * The server returns the whole context; this side splits it into pages
 * against the dispatch budget so a large persona does not blow the call.
 * The split is at line boundaries, and part 1 alone carries the
 * instructions the agent needs before reading the rest — the instructions
 * stay in the prompt even when the content spans many pages.
 * (ADR:2026-11-08-mcp-batch-a-read-tools)
 */

export const PERSONA_PART_MIN = 1;

export interface PersonaContextResult {
  format: 'markdown' | 'json';
  instructions?: Record<string, unknown>;
  content: string;
  part: number;
  totalParts: number;
  hasMore: boolean;
  fingerprint?: string;
}

interface PersonaContextJson {
  prompt?: string;
  fingerprint?: string;
  persona?: unknown;
  generatedAt?: string;
  truncated?: boolean;
  rules?: unknown;
  sharedKnowledge?: unknown;
  searchScope?: unknown;
  manifest?: unknown;
}

interface PersonaFetch {
  json: PersonaContextJson;
  markdown: string;
}

/**
 * The markdown endpoint returns raw text and the JSON endpoint returns the
 * materialized object, but the instructions and fingerprint live only in
 * the JSON shape — so the markdown format needs both calls. When the caller
 * asked for JSON, the markdown call is skipped.
 */
export async function fetchPersonaContext(
  client: RestClient,
  personaName: string | undefined,
  format: 'markdown' | 'json',
): Promise<PersonaFetch> {
  const path = personaName
    ? `/v1/personas/name/${encodeURIComponent(personaName)}/context`
    : '/v1/personas/me/context';
  const json = await client.request<PersonaContextJson>(path, {
    query: { format: 'json' },
  });
  const markdown =
    format === 'markdown'
      ? (await client.requestText(path, { query: { format: 'markdown' } })).text
      : JSON.stringify(json);
  return { json, markdown };
}

/**
 * Split the content into pages. Each page's serialized size is measured as
 * the tool-call response it becomes (`{"content": chunk}`), not the raw
 * text, and the first page's budget is reduced by the instructions it
 * carries. The split prefers line boundaries; a single line longer than a
 * page is cut at the largest character prefix that still fits, so paging
 * always advances and every part stays within budget.
 */
export function splitPersonaParts(
  content: string,
  instructions: Record<string, unknown> | undefined,
  partBudget: number,
): string[] {
  const firstPartReserve = instructions ? serializedLength(instructions) : 0;
  const budgets = (index: number): number =>
    index === 0 ? Math.max(0, partBudget - firstPartReserve) : partBudget;
  const lines = content.split('\n');
  const parts: string[] = [];
  let start = 0;
  while (start < lines.length) {
    const budget = budgets(parts.length);
    let low = start;
    let high = lines.length;
    // Longest prefix of lines[start..] whose {"content": chunk} fits.
    while (low < high) {
      const mid = Math.floor((low + high + 1) / 2);
      const chunk = lines.slice(start, mid).join('\n');
      if (serializedLength({ content: chunk }) <= budget) {
        low = mid;
      } else {
        high = mid - 1;
      }
    }
    if (low === start) {
      const line = lines[start]!;
      if (line.length === 0) {
        // An empty line can never be cut smaller; emit it and move on.
        parts.push('');
        start += 1;
        continue;
      }
      // One line alone exceeds the budget: cut it at the largest character
      // prefix whose serialized form fits, and reprocess the remainder.
      let lo = 0;
      let hi = line.length;
      while (lo < hi) {
        const mid = Math.floor((lo + hi + 1) / 2);
        if (serializedLength({ content: line.slice(0, mid) }) <= budget) {
          lo = mid;
        } else {
          hi = mid - 1;
        }
      }
      parts.push(line.slice(0, Math.max(1, lo)));
      lines[start] = line.slice(Math.max(1, lo));
      continue;
    }
    parts.push(lines.slice(start, low).join('\n'));
    start = low;
  }
  return parts;
}

export function partBudgetChars(): number {
  return MAX_RESPONSE_CHARS - PART_RESPONSE_HEADROOM_CHARS;
}

export function pagePersonaContext(
  fetched: PersonaFetch,
  format: 'markdown' | 'json',
  part: number,
): PersonaContextResult {
  const budget = partBudgetChars();
  const content = format === 'markdown' ? fetched.markdown : JSON.stringify(fetched.json);
  const parts = splitPersonaParts(content, instructionsOf(fetched.json), budget);
  if (part < 1 || part > parts.length) {
    throw new Error(`part must be between 1 and ${parts.length}`);
  }
  const result: PersonaContextResult = {
    format,
    content: parts[part - 1]!,
    part,
    totalParts: parts.length,
    hasMore: part < parts.length,
  };
  if (part === 1 && fetched.json.prompt) {
    result.instructions = instructionsOf(fetched.json);
  }
  if (fetched.json.fingerprint) {
    result.fingerprint = fetched.json.fingerprint;
  }
  return result;
}

/**
 * Instructions are the prompt the agent was given, as a map — the shape the
 * server-side page carries on part 1. An empty prompt carries nothing.
 */
export function instructionsOf(json: PersonaContextJson): Record<string, unknown> | undefined {
  const prompt = json.prompt;
  if (prompt === undefined || prompt.trim() === '') {
    return undefined;
  }
  return { prompt };
}

export function personaBudgetInfo(): { defaultBudget: number; partBudget: number } {
  return { defaultBudget: defaultBudgetChars(), partBudget: partBudgetChars() };
}
