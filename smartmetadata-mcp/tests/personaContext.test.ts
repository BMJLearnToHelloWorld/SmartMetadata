/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { describe, expect, it } from 'vitest';
import {
  pagePersonaContext,
  partBudgetChars,
  splitPersonaParts,
  type PersonaContextResult,
} from '../src/personaContext.js';

const INSTRUCTIONS = { prompt: 'You are a data steward.' };

describe('splitPersonaParts', () => {
  it('keeps a short document in one part', () => {
    const parts = splitPersonaParts('line one\nline two', undefined, partBudgetChars());
    expect(parts).toEqual(['line one\nline two']);
  });

  it('splits at line boundaries within the budget', () => {
    const lines = Array.from({ length: 10 }, (_, i) => `line ${i} ${'x'.repeat(20)}`);
    const content = lines.join('\n');
    const parts = splitPersonaParts(content, undefined, 200);
    expect(parts.length).toBeGreaterThan(1);
    expect(parts.join('\n')).toBe(content);
    for (const part of parts) {
      expect(JSON.stringify({ content: part }).length).toBeLessThanOrEqual(200);
    }
  });

  it('reserves the first page budget for instructions', () => {
    const content = 'a'.repeat(100);
    const without = splitPersonaParts(content, undefined, 120);
    const withInstructions = splitPersonaParts(content, INSTRUCTIONS, 120);
    // The instructions eat the first page's budget, so the same content
    // needs more pages when instructions ride along.
    expect(withInstructions.length).toBeGreaterThanOrEqual(without.length);
    expect(withInstructions.join('')).toBe(content);
  });

  it('cuts a single over-long line instead of emitting it whole', () => {
    const content = 'z'.repeat(500);
    const parts = splitPersonaParts(content, undefined, 200);
    expect(parts.length).toBeGreaterThan(1);
    expect(parts.join('')).toBe(content);
    for (const part of parts) {
      expect(JSON.stringify({ content: part }).length).toBeLessThanOrEqual(200);
    }
  });

  it('handles empty content', () => {
    expect(splitPersonaParts('', undefined, partBudgetChars())).toEqual(['']);
  });
});

describe('pagePersonaContext', () => {
  const fetched = {
    json: { prompt: 'You are a data steward.', fingerprint: 'fp-1' },
    markdown: '# Persona\nline one\nline two',
  };

  it('returns part 1 with instructions and the fingerprint', () => {
    const result: PersonaContextResult = pagePersonaContext(fetched, 'markdown', 1);
    expect(result.format).toBe('markdown');
    expect(result.part).toBe(1);
    expect(result.totalParts).toBe(1);
    expect(result.hasMore).toBe(false);
    expect(result.instructions).toEqual({ prompt: 'You are a data steward.' });
    expect(result.fingerprint).toBe('fp-1');
    expect(result.content).toBe('# Persona\nline one\nline two');
  });

  it('rejects a part outside the valid range', () => {
    expect(() => pagePersonaContext(fetched, 'markdown', 0)).toThrow(
      /part must be between 1 and 1/,
    );
    expect(() => pagePersonaContext(fetched, 'markdown', 2)).toThrow(
      /part must be between 1 and 1/,
    );
  });

  it('omits instructions on later parts', () => {
    const long = {
      json: { prompt: 'p', fingerprint: 'fp' },
      markdown: Array.from({ length: 200 }, (_, i) => `line ${i} ${'x'.repeat(1000)}`).join('\n'),
    };
    const first = pagePersonaContext(long, 'markdown', 1);
    expect(first.totalParts).toBeGreaterThan(1);
    expect(first.instructions).toEqual({ prompt: 'p' });
    const second = pagePersonaContext(long, 'markdown', 2);
    expect(second.instructions).toBeUndefined();
    expect(second.fingerprint).toBe('fp');
    expect(second.hasMore).toBe(second.part < second.totalParts);
  });

  it('pages the JSON serialization for format json', () => {
    const result = pagePersonaContext(fetched, 'json', 1);
    expect(result.format).toBe('json');
    expect(JSON.parse(result.content)).toEqual(fetched.json);
  });
});
