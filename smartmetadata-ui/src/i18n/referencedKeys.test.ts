/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import enUS from './locales/en-US';
import zhCN from './locales/zh-CN';

// Vitest transforms import.meta.url away from a file: URL, so resolve the
// source tree from the test file's location when possible and fall back to
// the vitest working directory (the UI package root in every gate run).
function resolveSrcDir(): string {
  try {
    const url = new URL('..', import.meta.url);
    if (url.protocol === 'file:') {
      const dir = fileURLToPath(url);
      if (existsSync(join(dir, 'i18n'))) return dir;
    }
  } catch {
    // Fall through to the working-directory resolution below.
  }
  const dir = join(process.cwd(), 'src');
  if (!existsSync(join(dir, 'i18n'))) {
    throw new Error(`cannot locate src/ for the referenced-keys scan (cwd: ${process.cwd()})`);
  }
  return dir;
}

function leafKeys(value: unknown, prefix = '', out = new Set<string>()): Set<string> {
  if (value !== null && typeof value === 'object') {
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      leafKeys(child, prefix ? `${prefix}.${key}` : key, out);
    }
  } else if (prefix) {
    out.add(prefix);
  }
  return out;
}

// Strip line/block/HTML comments while respecting string literals, so a
// `t('...')` mentioned in prose (e.g. a JSDoc pin reference) is not mistaken
// for a real translation call. A `//` inside a regex literal can hide the rest
// of its line; no such line carries a translation call today.
function stripComments(source: string): string {
  let out = '';
  let i = 0;
  const n = source.length;
  while (i < n) {
    const ch = source[i];
    const next = source[i + 1] ?? '';
    if (ch === '/' && next === '/') {
      while (i < n && source[i] !== '\n') i++;
    } else if (ch === '/' && next === '*') {
      i += 2;
      // Preserve newlines so reported line numbers stay true to the file.
      while (i < n && !(source[i] === '*' && source[i + 1] === '/')) {
        if (source[i] === '\n') out += '\n';
        i++;
      }
      i += 2;
    } else if (ch === '<' && source.slice(i, i + 4) === '<!--') {
      const end = source.indexOf('-->', i + 4);
      const skipped = end === -1 ? source.slice(i) : source.slice(i, end);
      out += skipped.replace(/[^\n]/g, '');
      i = end === -1 ? n : end + 3;
    } else if (ch === "'" || ch === '"' || ch === '`') {
      const quote = ch;
      out += ch;
      i++;
      while (i < n) {
        out += source[i];
        if (source[i] === '\\') {
          i++;
          if (i < n) out += source[i];
        } else if (source[i] === quote) {
          break;
        }
        i++;
      }
      i++;
    } else {
      out += ch;
      i++;
    }
  }
  return out;
}

const REF_PATTERN = /(?:\bt|\$t|i18n\.global\.t|translate)\(\s*(['"])((?:(?!\1).)+)\1/g;

function collectReferences(srcDir: string): Map<string, string[]> {
  const refs = new Map<string, string[]>();
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (
        /\.(vue|ts)$/.test(entry.name) &&
        !/\.test\.ts$/.test(entry.name) &&
        !/\.spec\.ts$/.test(entry.name)
      ) {
        const lines = stripComments(readFileSync(full, 'utf8')).split('\n');
        lines.forEach((line, index) => {
          for (const match of line.matchAll(REF_PATTERN)) {
            // A literal followed by `+` is a dynamic key built by
            // concatenation; its runtime value cannot be resolved here.
            const rest = line.slice(match.index + match[0].length).trimStart();
            if (rest.startsWith('+')) continue;
            const key = match[2];
            const hit = `${full.slice(srcDir.length + 1)}:${index + 1}`;
            const list = refs.get(key) ?? [];
            list.push(hit);
            refs.set(key, list);
          }
        });
      }
    }
  };
  walk(srcDir);
  return refs;
}

describe('i18n referenced keys', () => {
  it('resolves every static t() reference in both catalogs, so no key path ever renders', () => {
    const srcDir = resolveSrcDir();
    const enKeys = leafKeys(enUS);
    const zhKeys = leafKeys(zhCN);
    const refs = collectReferences(srcDir);
    const missing = [...refs.entries()]
      .filter(([key]) => !enKeys.has(key) || !zhKeys.has(key))
      .map(([key, hits]) => {
        const lacking = [!enKeys.has(key) ? 'en-US' : null, !zhKeys.has(key) ? 'zh-CN' : null]
          .filter(Boolean)
          .join(', ');
        return `${key} (missing in ${lacking}) <= ${hits.slice(0, 3).join(' | ')}`;
      });
    expect(missing).toEqual([]);
  });

  it('keeps the 2026-11-16 recovered keys on their official wordings', () => {
    expect(enUS.ingestion.pipelines.startDate).toBe('Start Date');
    expect(enUS.ingestion.pipelines.endDate).toBe('End Date');
    expect(enUS.ingestion.pipelines.duration).toBe('Duration');
    expect(enUS.crud.remove).toBe('Remove');
    expect(enUS.crud.loading).toBe('Loading');
    expect(enUS.crud.retry).toBe('Retry');
    expect(enUS.crud.teams).toBe('Teams');
    expect(enUS.crud.roles).toBe('Roles');
    expect(enUS.asset.name).toBe('Name');
    expect(enUS.asset.noCustomProperties).toBe('No custom properties defined');
    expect(zhCN.ingestion.pipelines.startDate).toBe('开始日期');
    expect(zhCN.ingestion.pipelines.endDate).toBe('结束日期');
    expect(zhCN.ingestion.pipelines.duration).toBe('持续时间');
    expect(zhCN.crud.remove).toBe('删除');
    expect(zhCN.crud.loading).toBe('加载中');
    expect(zhCN.crud.retry).toBe('重试');
    expect(zhCN.crud.teams).toBe('团队');
    expect(zhCN.crud.roles).toBe('角色');
    expect(zhCN.asset.name).toBe('名称');
    // The official Chinese catalog leaves this string untranslated; the
    // product keeps the English residual rather than inventing a rendering.
    expect(zhCN.asset.noCustomProperties).toBe('No custom properties defined');
  });
});
