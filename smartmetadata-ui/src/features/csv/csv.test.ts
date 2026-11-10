/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  classifyImportRow,
  downloadCsv,
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

describe('downloadCsv', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('prepends the UTF-8 BOM and downloads as text/csv', async () => {
    const blobs: Blob[] = [];
    vi.stubGlobal('URL', {
      ...URL,
      createObjectURL: vi.fn((blob: Blob) => {
        blobs.push(blob);
        return 'blob:csv';
      }),
      revokeObjectURL: vi.fn(),
    });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    downloadCsv('name,description\nfoo,bar', 'metrics.csv');
    expect(blobs).toHaveLength(1);
    expect(blobs[0]?.type).toBe('text/csv;charset=utf-8');
    // jsdom's Blob.text() decodes through Node, which strips a leading
    // UTF-8 BOM — assert on the raw bytes instead.
    const bytes = new Uint8Array(await blobs[0]!.arrayBuffer());
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    expect(new TextDecoder('utf-8').decode(bytes.slice(3))).toBe('name,description\nfoo,bar');
    expect(click).toHaveBeenCalled();
  });
});
