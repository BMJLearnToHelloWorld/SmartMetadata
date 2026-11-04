/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0.
 */
import { describe, expect, it } from 'vitest';
import {
  classifyImportRow,
  normalizeCsvLineBreaks,
  parseCsv,
  rowsToRecords,
  stringifyCsv,
  summarizeImportRows,
} from './csv';

describe('parseCsv', () => {
  it('parses a header plus rows', () => {
    expect(parseCsv('name,description\nfoo,bar\nbaz,qux')).toEqual([
      ['name', 'description'],
      ['foo', 'bar'],
      ['baz', 'qux'],
    ]);
  });

  it('handles quoted commas, escaped quotes, and embedded newlines', () => {
    expect(parseCsv('name,note\n"a,b","say ""hi"""\n"multi\nline",plain')).toEqual([
      ['name', 'note'],
      ['a,b', 'say "hi"'],
      ['multi\nline', 'plain'],
    ]);
  });

  it('normalizes CRLF/CR and ignores a trailing newline', () => {
    expect(parseCsv('a,b\r\n1,2\r3,4\n')).toEqual([
      ['a', 'b'],
      ['1', '2'],
      ['3', '4'],
    ]);
    expect(normalizeCsvLineBreaks('a\r\nb\rc\nd')).toBe('a\nb\nc\nd');
  });

  it('round-trips through stringifyCsv', () => {
    const rows = [
      ['name', 'note'],
      ['a,b', 'say "hi"'],
      ['multi\nline', 'plain'],
    ];
    expect(parseCsv(stringifyCsv(rows))).toEqual(rows);
  });

  it('returns no rows for an empty document', () => {
    expect(parseCsv('')).toEqual([]);
  });
});

describe('rowsToRecords', () => {
  it('keys rows by header, missing trailing fields become empty', () => {
    expect(
      rowsToRecords([
        ['name', 'status', 'details'],
        ['foo', 'success'],
      ]),
    ).toEqual({
      headers: ['name', 'status', 'details'],
      records: [{ name: 'foo', status: 'success', details: '' }],
    });
  });
});

describe('classifyImportRow / summarizeImportRows', () => {
  it('maps failure/skipped to SKIP, "Entity updated" to UPDATE, else CREATE', () => {
    expect(classifyImportRow({ status: 'failure', details: 'no permission' })).toBe('SKIP');
    expect(classifyImportRow({ status: 'skipped', details: '' })).toBe('SKIP');
    expect(classifyImportRow({ status: 'success', details: 'Entity updated' })).toBe('UPDATE');
    expect(classifyImportRow({ status: 'success', details: 'Entity created' })).toBe('CREATE');
    expect(classifyImportRow({ Status: 'FAILURE', Details: '' })).toBe('SKIP');
  });

  it('counts operations across rows', () => {
    expect(
      summarizeImportRows([
        { status: 'success', details: 'Entity created' },
        { status: 'success', details: 'Entity updated' },
        { status: 'failure', details: 'denied' },
      ]),
    ).toEqual({ create: 1, update: 1, skip: 1 });
  });
});
