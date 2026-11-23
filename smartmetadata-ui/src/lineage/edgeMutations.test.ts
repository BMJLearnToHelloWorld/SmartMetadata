/**
 * Copyright 2026 SmartMetadata authors.
 * Licensed under the Apache License, Version 2.0.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { persistSession } from '@/auth/token';
import {
  getCanvasColumnAssets,
  getLineageEditColumnPair,
  mergeColumnPair,
  readColumnsLineage,
  removeColumnLineageEdge,
  removeColumnPair,
  saveLineageEdge,
} from './edgeMutations';

const TARGET = {
  fromType: 'table',
  fromFqn: 'svc.db.schema.a',
  toType: 'table',
  toFqn: 'svc.db.schema.b',
  fromId: 'a-id',
  toId: 'b-id',
};

function lastFetch(): { url: string; init?: RequestInit } {
  const mock = vi.mocked(fetch);
  const call = mock.mock.calls.at(-1);
  if (!call) {
    throw new Error('fetch was not called');
  }
  return { url: String(call[0]), init: call[1] };
}

describe('getCanvasColumnAssets (pin AddLineagePopover.utils)', () => {
  it('keeps only tables and data models, deduped, excluding the edited node', () => {
    expect(
      getCanvasColumnAssets(
        [
          { id: 't1', entityType: 'table' },
          { id: 't1', entityType: 'table' },
          { id: 'dm1', entityType: 'dashboardDataModel' },
          { id: 'd1', entityType: 'dashboard' },
          { id: 'edit', entityType: 'table' },
          { id: '', entityType: 'table' },
        ],
        'edit',
      ),
    ).toEqual([
      { id: 't1', entityType: 'table' },
      { id: 'dm1', entityType: 'dashboardDataModel' },
    ]);
  });
});

describe('getLineageEditColumnPair (pin LineageMap.utils)', () => {
  it('upstream connects the picked column to the requested one, downstream reverses', () => {
    expect(getLineageEditColumnPair(true, 'b.id', 'a.id')).toEqual({
      fromColumn: 'a.id',
      toColumn: 'b.id',
    });
    expect(getLineageEditColumnPair(false, 'a.id', 'b.id')).toEqual({
      fromColumn: 'a.id',
      toColumn: 'b.id',
    });
    expect(getLineageEditColumnPair(true, undefined, 'a.id')).toBeUndefined();
    expect(getLineageEditColumnPair(true, 'b.id', undefined)).toBeUndefined();
  });
});

describe('mergeColumnPair / removeColumnPair', () => {
  const existing = [
    { fromColumns: ['a.id'], toColumn: 'b.id' },
    { fromColumns: ['a.x', 'a.y'], toColumn: 'b.z' },
  ];
  it('merges into the mapping for the to-column, or starts a new mapping', () => {
    expect(mergeColumnPair(existing, { fromColumn: 'a.id2', toColumn: 'b.id' })).toEqual([
      { fromColumns: ['a.id', 'a.id2'], toColumn: 'b.id' },
      { fromColumns: ['a.x', 'a.y'], toColumn: 'b.z' },
    ]);
    expect(mergeColumnPair(existing, { fromColumn: 'a.n', toColumn: 'b.n' })).toEqual([
      ...existing,
      { fromColumns: ['a.n'], toColumn: 'b.n' },
    ]);
    expect(mergeColumnPair(existing, { fromColumn: 'a.id', toColumn: 'b.id' })).toBe(existing);
  });

  it('removes one from-column, dropping the mapping when it empties (pin getColumnLineageData)', () => {
    expect(removeColumnPair(existing, { fromColumn: 'a.x', toColumn: 'b.z' })).toEqual([
      { fromColumns: ['a.id'], toColumn: 'b.id' },
      { fromColumns: ['a.y'], toColumn: 'b.z' },
    ]);
    expect(removeColumnPair(existing, { fromColumn: 'a.id', toColumn: 'b.id' })).toEqual([
      { fromColumns: ['a.x', 'a.y'], toColumn: 'b.z' },
    ]);
    expect(removeColumnPair(existing, { fromColumn: 'a.no', toColumn: 'b.id' })).toEqual(existing);
  });

  it('reads columnsLineage defensively from unknown payloads', () => {
    expect(readColumnsLineage({ columnsLineage: [{ fromColumns: ['a.id'], toColumn: 'b.id' }] })).toEqual([
      { fromColumns: ['a.id'], toColumn: 'b.id' },
    ]);
    expect(readColumnsLineage({})).toEqual([]);
    expect(readColumnsLineage(null)).toEqual([]);
  });
});

describe('saveLineageEdge / removeColumnLineageEdge', () => {
  beforeEach(() => {
    localStorage.clear();
    persistSession(localStorage, { accessToken: 'tok', tokenType: 'Bearer' });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('merges the pair into the existing details and PUTs by name', async () => {
    const calls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        calls.push(url);
        if (url.includes('getLineageEdge')) {
          return new Response(
            JSON.stringify({ edge: { source: 'Manual', columnsLineage: [{ fromColumns: ['a.id'], toColumn: 'b.id' }] } }),
            { status: 200 },
          );
        }
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }),
    );
    expect(await saveLineageEdge(TARGET, { fromColumn: 'a.id2', toColumn: 'b.id' })).toBe(true);
    expect(calls[0]).toContain('/api/v1/lineage/getLineageEdge/a-id/b-id');
    const { url, init } = lastFetch();
    expect(url).toContain('/api/v1/lineage/table/name/svc.db.schema.a/table/name/svc.db.schema.b');
    expect(init?.method).toBe('PUT');
    expect(JSON.parse(String(init?.body))).toEqual({
      source: 'Manual',
      columnsLineage: [{ fromColumns: ['a.id', 'a.id2'], toColumn: 'b.id' }],
    });
  });

  it('treats a 404 details lookup as no existing edge and PUTs the pair alone', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url.includes('getLineageEdge')) {
          return new Response(JSON.stringify({ message: 'Not found' }), { status: 404 });
        }
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }),
    );
    expect(await saveLineageEdge(TARGET, { fromColumn: 'a.id', toColumn: 'b.id' })).toBe(true);
    const { init } = lastFetch();
    expect(JSON.parse(String(init?.body))).toEqual({
      source: 'Manual',
      columnsLineage: [{ fromColumns: ['a.id'], toColumn: 'b.id' }],
    });
  });

  it('returns false for a self-edge without calling fetch', async () => {
    vi.stubGlobal('fetch', vi.fn());
    expect(
      await saveLineageEdge({ ...TARGET, toFqn: TARGET.fromFqn }),
    ).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('rejects when the details lookup fails with a non-404 (pin: only the lookup rejects)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ message: 'boom' }), { status: 500 })),
    );
    await expect(saveLineageEdge(TARGET, { fromColumn: 'a.id', toColumn: 'b.id' })).rejects.toThrow(
      /boom|500/,
    );
  });

  it('returns false when the PUT fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url.includes('getLineageEdge')) {
          return new Response(JSON.stringify({ edge: {} }), { status: 200 });
        }
        return new Response(JSON.stringify({ message: 'nope' }), { status: 403 });
      }),
    );
    expect(await saveLineageEdge(TARGET)).toBe(false);
  });

  it('removeColumnLineageEdge re-PUTs the edge without the pair', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url.includes('getLineageEdge')) {
          return new Response(
            JSON.stringify({
              edge: {
                source: 'Manual',
                columnsLineage: [
                  { fromColumns: ['a.id', 'a.id2'], toColumn: 'b.id' },
                  { fromColumns: ['a.x'], toColumn: 'b.x' },
                ],
              },
            }),
            { status: 200 },
          );
        }
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }),
    );
    expect(await removeColumnLineageEdge(TARGET, { fromColumn: 'a.id2', toColumn: 'b.id' })).toBe(
      true,
    );
    const { init } = lastFetch();
    expect(JSON.parse(String(init?.body))).toEqual({
      source: 'Manual',
      columnsLineage: [
        { fromColumns: ['a.id'], toColumn: 'b.id' },
        { fromColumns: ['a.x'], toColumn: 'b.x' },
      ],
    });
  });

  it('removeColumnLineageEdge returns false when there is no edge to edit', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ message: 'Not found' }), { status: 404 })),
    );
    expect(await removeColumnLineageEdge(TARGET, { fromColumn: 'a.id', toColumn: 'b.id' })).toBe(
      false,
    );
  });
});
