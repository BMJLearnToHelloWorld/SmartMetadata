/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0.
 *
 * Pure CSV helpers (no DOM, no network): RFC 4180 parsing/serializing plus
 * the import-result classification the server's importResultsCsv encodes.
 * Official reference: openmetadata-ui utils/CSV/CSVPureUtils +
 * CSV.utils getImportOperation/getImportOperationSummary — the per-row
 * `status`/`details` columns are authoritative; the client never matches
 * on entity names.
 */

/** CRLF/CR/LF all become LF before parsing, as official normalizeCsvLineBreaks does. */
export function normalizeCsvLineBreaks(content: string): string {
  return content.replace(/\r\n?/g, '\n');
}

/**
 * Parse CSV text into rows of raw field strings. Quoted fields may contain
 * commas, newlines, and escaped double quotes (""). A trailing newline does
 * not produce a trailing empty row.
 */
export function parseCsv(content: string): string[][] {
  const text = normalizeCsvLineBreaks(content);
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  let fieldQuoted = false;
  const pushField = (): void => {
    row.push(fieldQuoted ? field : field.trim());
    field = '';
    fieldQuoted = false;
  };
  const pushRow = (): void => {
    pushField();
    rows.push(row);
    row = [];
  };
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      if (field === '') {
        inQuotes = true;
        fieldQuoted = true;
      } else {
        field += ch;
      }
    } else if (ch === ',') {
      pushField();
    } else if (ch === '\n') {
      pushRow();
    } else {
      field += ch;
    }
  }
  // A final unterminated line (or an empty document) still yields its row;
  // a document ending in a newline has no pending field to flush.
  if (field !== '' || fieldQuoted || row.length > 0) {
    pushRow();
  }
  return rows.filter((r) => !(r.length === 1 && r[0] === ''));
}

export function quoteCsvField(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export function stringifyCsv(rows: string[][]): string {
  return rows.map((row) => row.map(quoteCsvField).join(',')).join('\n');
}

/** First row = headers; remaining rows become header-keyed records. */
export function rowsToRecords(rows: string[][]): { headers: string[]; records: Array<Record<string, string>> } {
  if (rows.length === 0) {
    return { headers: [], records: [] };
  }
  const headers = rows[0];
  const records = rows.slice(1).map((row) => {
    const record: Record<string, string> = {};
    headers.forEach((header, index) => {
      record[header] = row[index] ?? '';
    });
    return record;
  });
  return { headers, records };
}

/** A header-keyed record's field, matched case-insensitively on the header name. */
export function recordField(record: Record<string, string>, name: string): string {
  const key = Object.keys(record).find((k) => k.toLowerCase() === name.toLowerCase());
  return key === undefined ? '' : record[key];
}

export type ImportRowOperation = 'CREATE' | 'UPDATE' | 'SKIP';

/**
 * Official getImportOperation: a result row is SKIP when its status is
 * failure or skipped, UPDATE when its details read "Entity updated",
 * otherwise CREATE.
 */
export function classifyImportRow(row: Record<string, string>): ImportRowOperation {
  const status = recordField(row, 'status').toLowerCase();
  if (status === 'failure' || status === 'skipped') {
    return 'SKIP';
  }
  if (recordField(row, 'details') === 'Entity updated') {
    return 'UPDATE';
  }
  return 'CREATE';
}

export interface ImportSummary {
  create: number;
  update: number;
  skip: number;
}

export function summarizeImportRows(rows: Array<Record<string, string>>): ImportSummary {
  const summary: ImportSummary = { create: 0, update: 0, skip: 0 };
  for (const row of rows) {
    const operation = classifyImportRow(row);
    if (operation === 'CREATE') {
      summary.create += 1;
    } else if (operation === 'UPDATE') {
      summary.update += 1;
    } else {
      summary.skip += 1;
    }
  }
  return summary;
}

/** Download helper shared by CSV export and result-CSV download. */
export function downloadTextFile(filename: string, content: string, mime = 'text/csv;charset=utf-8'): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

/** Safe filename fragment: FQNs carry dots, which are kept; anything else becomes _. */
export function safeFileFragment(value: string): string {
  return value.replace(/[^A-Za-z0-9_.-]/g, '_');
}
