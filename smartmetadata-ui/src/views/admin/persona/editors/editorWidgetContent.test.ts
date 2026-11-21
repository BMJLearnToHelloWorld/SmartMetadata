/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may
 * not use this file except in compliance with the License. You may obtain
 * a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { describe, expect, it } from 'vitest';
import { buildEditorPieceContext, pieceForEditorContentKey } from './editorWidgetContent';

describe('pieceForEditorContentKey (R-EDIT-1)', () => {
  it('maps known content keys to pieces', () => {
    expect(pieceForEditorContentKey('KnowledgePanel.TableSchema')).toBe('schemaTable');
    expect(pieceForEditorContentKey('KnowledgePanel.Description')).toBe('description');
    expect(pieceForEditorContentKey('KnowledgePanel.Tags')).toBe('tags');
    expect(pieceForEditorContentKey('KnowledgePanel.CustomProperties')).toBe(
      'customProperties',
    );
  });

  it('returns null for unknown keys and for no key', () => {
    expect(pieceForEditorContentKey('KnowledgePanel.Nope')).toBeNull();
    expect(pieceForEditorContentKey(null)).toBeNull();
  });
});

describe('buildEditorPieceContext', () => {
  it('builds a dummy asset context with empty lists and no-op callbacks', () => {
    const context = buildEditorPieceContext(
      {
        id: 'x',
        name: 'raw_product_catalog',
        fullyQualifiedName: 'a.b.c',
        description: 'A dummy table.',
      },
      'table',
    );
    expect(context.asset.name).toBe('raw_product_catalog');
    expect(context.asset.fullyQualifiedName).toBe('a.b.c');
    expect(context.asset.description).toBe('A dummy table.');
    expect(context.asset.owners).toEqual([]);
    expect(context.asset.tags).toEqual([]);
    expect(context.asset.schemaRows).toEqual([]);
    expect(context.taskGraph).toEqual({ nodes: [], edges: [] });
    expect(context.taskGraphEmpty).toBe(true);
    expect(context.apiEndpointSchemaJson(undefined)).toBe('');
    expect(context.schemaExpandable.rowExpandable({} as never)).toBe(false);
  });
});
