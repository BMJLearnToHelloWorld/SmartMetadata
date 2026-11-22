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
  it('builds a dummy asset context with empty lists and no-op callbacks', async () => {
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
    // The builder also covers the older context fields as read-only
    // no-ops (they were missing in the baseline builder).
    expect(context.schemaTagOptions).toEqual([]);
    expect(context.schemaTagAccess).toEqual({
      canEditTags: false,
      canEditGlossaryTerms: false,
      readOnly: true,
    });
    expect(context.descriptionAccess).toBe(false);
    expect(context.customPropsCanView).toBeNull();
    // D-2 batch 5b: taskGraphEmpty is gone; the context carries the
    // metric-definition save, the pipeline task access flags and the task
    // callbacks instead, all read-only no-ops in the editor preview.
    expect(context.metricDefinitionCanEdit).toBe(false);
    expect(context.pipelineTaskAccess).toEqual({
      canEditDescription: false,
      canEditTags: false,
      canEditGlossaryTerms: false,
      readOnly: true,
    });
    await expect(context.onMetricDefinitionSave([])).resolves.toBeUndefined();
    await expect(
      context.onTaskDescriptionUpdate({} as never, 0, 'new description'),
    ).resolves.toBeUndefined();
    await expect(
      context.onTaskTagChange({} as never, 'Classification', []),
    ).resolves.toBeUndefined();
    expect(context.apiEndpointSchemaJson(undefined)).toBe('');
    expect(context.schemaExpandable.rowExpandable({} as never)).toBe(false);
    // D-2 batch 3: the preview context fails closed — nothing is
    // editable and every schema callback is a resolving no-op.
    expect(context.schemaAccess).toEqual({
      canEditDescription: false,
      canEditTags: false,
      canEditGlossaryTerms: false,
      canEditDisplayName: false,
      canEditCustomFields: false,
      canEditAll: false,
      canViewUsage: false,
      readOnly: true,
      resolved: false,
    });
    expect(context.schemaRows).toEqual([]);
    expect(context.databaseSchemas).toEqual([]);
    await expect(context.onSchemaDescriptionSave({} as never, 'x')).resolves.toBeUndefined();
    await expect(context.onDatabaseSchemaDisplayNameSave({} as never, 'x')).resolves.toBeUndefined();
  });
});
