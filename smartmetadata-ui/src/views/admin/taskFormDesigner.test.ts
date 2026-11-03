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
  buildDesignerSchema,
  buildStageMappings,
  buildTransitionForms,
  parseSchemaToDesignerFields,
  parseStageMappings,
  parseTransitionForms,
  withFieldType,
} from './taskFormDesigner';

describe('taskFormDesigner', () => {
  it('parses a schema pair into designer rows and builds it back', () => {
    const formSchema = {
      type: 'object',
      additionalProperties: true,
      properties: {
        comment: { type: 'string', title: 'Comment' },
        score: { type: 'number', title: 'Score' },
        tags: { type: 'array', title: 'Tags', items: { type: 'string', enum: ['a', 'b'] } },
      },
      required: ['comment'],
    };
    const uiSchema = {
      'ui:order': ['score', 'comment', 'tags'],
      comment: { 'ui:widget': 'textarea' },
    };
    const fields = parseSchemaToDesignerFields(formSchema, uiSchema);
    expect(fields.map((field) => field.name)).toEqual(['score', 'comment', 'tags']);
    expect(fields.find((field) => field.name === 'comment')?.type).toBe('longText');
    expect(fields.find((field) => field.name === 'comment')?.required).toBe(true);
    expect(fields.find((field) => field.name === 'tags')?.type).toBe('multiSelect');
    expect(fields.find((field) => field.name === 'tags')?.options).toEqual(['a', 'b']);
    const built = buildDesignerSchema(fields, formSchema, uiSchema);
    expect((built.formSchema.properties as Record<string, unknown>).comment).toMatchObject({
      type: 'string',
      title: 'Comment',
    });
    expect(built.formSchema.required).toEqual(['comment']);
    expect(built.uiSchema['ui:order']).toEqual(['score', 'comment', 'tags']);
  });

  it('drops options when switching away from a select type', () => {
    const field = {
      key: 'f1',
      name: 'choice',
      label: 'Choice',
      type: 'singleSelect' as const,
      required: false,
      hidden: false,
      options: ['a', 'b'],
    };
    expect(withFieldType(field, 'shortText').options).toEqual([]);
    expect(withFieldType(field, 'multiSelect').options).toEqual(['a', 'b']);
  });

  it('round-trips transition forms and stage mappings', () => {
    const transitionForms = {
      approve: {
        formSchema: {
          type: 'object',
          properties: { note: { type: 'string', title: 'Note' } },
        },
        uiSchema: {},
      },
    };
    const transitions = parseTransitionForms(transitionForms);
    expect(transitions).toHaveLength(1);
    expect(transitions[0].transitionId).toBe('approve');
    expect(transitions[0].fields.map((field) => field.name)).toEqual(['note']);
    const rebuilt = buildTransitionForms(transitions);
    expect(Object.keys(rebuilt)).toEqual(['approve']);
    expect(parseStageMappings({ open: 'Open', closed: 'Completed' })).toEqual([
      expect.objectContaining({ stageId: 'open', taskStatus: 'Open' }),
      expect.objectContaining({ stageId: 'closed', taskStatus: 'Completed' }),
    ]);
    expect(buildStageMappings([{ key: 's1', stageId: ' open ', taskStatus: 'Open' }])).toEqual({
      open: 'Open',
    });
  });
});
