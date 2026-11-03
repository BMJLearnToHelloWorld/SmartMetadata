/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import type { JsonSchemaObject } from '@/api/taskFormSchemas';

/**
 * Designer field model, ported from the official TaskFormDesignerUtils:
 * a field row edits one JSON Schema property plus its uiSchema entry.
 * parse/build are inverses: parse reads a stored schema pair into rows,
 * build writes rows back, preserving untouched base-schema keys.
 */
export type TaskFormDesignerFieldType =
  | 'shortText'
  | 'longText'
  | 'number'
  | 'boolean'
  | 'singleSelect'
  | 'multiSelect'
  | 'json';

export interface TaskFormDesignerField {
  key: string;
  name: string;
  label: string;
  description?: string;
  type: TaskFormDesignerFieldType;
  required: boolean;
  hidden: boolean;
  options: string[];
  schemaType?: 'string' | 'number' | 'boolean' | 'object' | 'array';
  widget?: string;
  uiConfig?: JsonSchemaObject;
  property?: JsonSchemaObject;
}

export interface TaskFormDesignerTransition {
  key: string;
  transitionId: string;
  fields: TaskFormDesignerField[];
  config?: JsonSchemaObject;
}

export interface TaskFormDesignerStageMapping {
  key: string;
  stageId: string;
  taskStatus: string;
}

export const TASK_FORM_FIELD_TYPES: Array<{ id: TaskFormDesignerFieldType; label: string }> = [
  { id: 'shortText', label: 'Short text' },
  { id: 'longText', label: 'Long text' },
  { id: 'number', label: 'Number' },
  { id: 'boolean', label: 'Boolean' },
  { id: 'singleSelect', label: 'Select' },
  { id: 'multiSelect', label: 'Multi-select' },
  { id: 'json', label: 'JSON' },
];

export const TASK_FORM_FIELD_TYPE_LABELS: Record<TaskFormDesignerFieldType, string> = {
  shortText: 'Single line text',
  longText: 'Multiline text',
  number: 'Numeric field',
  boolean: 'Toggle',
  singleSelect: 'Single select',
  multiSelect: 'Multi-select',
  json: 'JSON field',
};

function clone<T>(value: T): T {
  return value === undefined ? value : (JSON.parse(JSON.stringify(value)) as T);
}

function createDesignerKey(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function stringifyDesignerJson(value: unknown): string {
  return JSON.stringify(value ?? {}, null, 2);
}

export function createEmptyDesignerField(): TaskFormDesignerField {
  return {
    key: createDesignerKey('field'),
    name: '',
    label: '',
    description: '',
    type: 'shortText',
    required: false,
    hidden: false,
    options: [],
    schemaType: 'string',
  };
}

export function createEmptyDesignerTransition(): TaskFormDesignerTransition {
  return {
    key: createDesignerKey('transition'),
    transitionId: '',
    fields: [createEmptyDesignerField()],
  };
}

export function createEmptyStageMapping(): TaskFormDesignerStageMapping {
  return { key: createDesignerKey('stage'), stageId: '', taskStatus: '' };
}

const DEFAULT_FORM_SCHEMA: JsonSchemaObject = {
  type: 'object',
  additionalProperties: true,
  properties: {},
};

function getObjectRecord(value?: JsonSchemaObject): Record<string, JsonSchemaObject> {
  const props = value?.properties;
  return props !== null && typeof props === 'object' && !Array.isArray(props)
    ? (props as Record<string, JsonSchemaObject>)
    : {};
}

function getRequiredFields(value?: JsonSchemaObject): Set<string> {
  return new Set(Array.isArray(value?.required) ? (value.required as string[]) : []);
}

function getFieldWidget(fieldName: string, uiSchema?: JsonSchemaObject): string | undefined {
  const entry = uiSchema?.[fieldName];
  if (entry !== null && typeof entry === 'object' && !Array.isArray(entry)) {
    const widget = (entry as Record<string, unknown>)['ui:widget'];
    return typeof widget === 'string' ? widget : undefined;
  }
  return undefined;
}

function inferFieldType(property: JsonSchemaObject, widget?: string): TaskFormDesignerFieldType {
  if (property.type === 'boolean') {
    return 'boolean';
  }
  if (property.type === 'number' || property.type === 'integer') {
    return 'number';
  }
  if (
    property.type === 'array' &&
    Array.isArray((property.items as JsonSchemaObject | undefined)?.enum)
  ) {
    return 'multiSelect';
  }
  if (Array.isArray(property.enum)) {
    return 'singleSelect';
  }
  if (property.type === 'object' || property.type === 'array') {
    return 'json';
  }
  if (widget === 'textarea') {
    return 'longText';
  }
  return 'shortText';
}

function getFieldOptions(property: JsonSchemaObject): string[] {
  if (Array.isArray(property.enum)) {
    return (property.enum as unknown[]).filter(
      (value): value is string => typeof value === 'string',
    );
  }
  if (
    property.type === 'array' &&
    Array.isArray((property.items as JsonSchemaObject | undefined)?.enum)
  ) {
    return ((property.items as JsonSchemaObject).enum as unknown[]).filter(
      (value): value is string => typeof value === 'string',
    );
  }
  return [];
}

export function parseSchemaToDesignerFields(
  formSchema?: JsonSchemaObject,
  uiSchema?: JsonSchemaObject,
): TaskFormDesignerField[] {
  const properties = getObjectRecord(formSchema);
  const requiredFields = getRequiredFields(formSchema);
  const orderedFields = Array.isArray(uiSchema?.['ui:order'])
    ? (uiSchema['ui:order'] as string[])
    : Object.keys(properties);
  const remainingFields = Object.keys(properties).filter(
    (fieldName) => !orderedFields.includes(fieldName),
  );
  return [...orderedFields, ...remainingFields]
    .filter((fieldName) => fieldName in properties)
    .map((fieldName) => {
      const property = clone(properties[fieldName]);
      const uiConfig = clone(
        (uiSchema?.[fieldName] as JsonSchemaObject | undefined) ?? {},
      );
      const widget = getFieldWidget(fieldName, uiSchema);
      return {
        key: createDesignerKey(fieldName),
        name: fieldName,
        label: (typeof property.title === 'string' ? property.title : undefined) ?? fieldName,
        description: typeof property.description === 'string' ? property.description : undefined,
        type: inferFieldType(property, widget),
        required: requiredFields.has(fieldName),
        hidden: widget === 'hidden',
        options: getFieldOptions(property),
        schemaType: (property.type as TaskFormDesignerField['schemaType']) ?? 'string',
        widget,
        uiConfig,
        property,
      };
    });
}

/** Switching field type keeps options only for selects and defaults JSON to an object. */
export function withFieldType(
  field: TaskFormDesignerField,
  type: TaskFormDesignerFieldType,
): TaskFormDesignerField {
  return {
    ...field,
    type,
    schemaType: type === 'json' ? field.schemaType ?? 'object' : field.schemaType,
    options: type === 'singleSelect' || type === 'multiSelect' ? field.options : [],
  };
}

function buildFieldProperty(field: TaskFormDesignerField): JsonSchemaObject {
  const nextProperty = clone(field.property ?? {});
  nextProperty.title = field.label || field.name;
  if (field.description) {
    nextProperty.description = field.description;
  } else {
    delete nextProperty.description;
  }
  switch (field.type) {
    case 'shortText':
    case 'longText':
      nextProperty.type = 'string';
      delete nextProperty.enum;
      delete nextProperty.items;
      break;
    case 'number':
      nextProperty.type = 'number';
      delete nextProperty.enum;
      delete nextProperty.items;
      break;
    case 'boolean':
      nextProperty.type = 'boolean';
      delete nextProperty.enum;
      delete nextProperty.items;
      break;
    case 'singleSelect':
      nextProperty.type = 'string';
      nextProperty.enum = field.options.filter(Boolean);
      delete nextProperty.items;
      break;
    case 'multiSelect':
      nextProperty.type = 'array';
      nextProperty.items = { type: 'string', enum: field.options.filter(Boolean) };
      delete nextProperty.enum;
      break;
    case 'json': {
      nextProperty.type = field.schemaType ?? (nextProperty.type as string) ?? 'object';
      delete nextProperty.enum;
      if (nextProperty.type === 'array') {
        nextProperty.items = (nextProperty.items as JsonSchemaObject | undefined) ?? {
          type: 'string',
        };
      } else if (
        nextProperty.type === 'object' &&
        !Object.prototype.hasOwnProperty.call(nextProperty, 'properties') &&
        !Object.prototype.hasOwnProperty.call(nextProperty, 'additionalProperties')
      ) {
        nextProperty.additionalProperties = true;
      }
      break;
    }
  }
  return nextProperty;
}

function resolveUiWidget(field: TaskFormDesignerField): string | undefined {
  if (field.hidden) {
    return 'hidden';
  }
  if (field.widget && field.widget !== 'hidden') {
    return field.widget;
  }
  return field.type === 'longText' || field.type === 'json' ? 'textarea' : undefined;
}

function buildFieldUiSchema(field: TaskFormDesignerField): JsonSchemaObject | undefined {
  const nextUiConfig = clone(field.uiConfig ?? {});
  const widget = resolveUiWidget(field);
  if (widget) {
    nextUiConfig['ui:widget'] = widget;
  } else {
    delete nextUiConfig['ui:widget'];
  }
  if (!widget && Object.keys(nextUiConfig).length === 0) {
    return undefined;
  }
  return nextUiConfig;
}

function buildUiSchema(
  fields: TaskFormDesignerField[],
  baseUiSchema?: JsonSchemaObject,
): JsonSchemaObject {
  const nextUiSchema = clone(baseUiSchema ?? {});
  for (const key of Object.keys(nextUiSchema)) {
    if (!key.startsWith('ui:')) {
      delete nextUiSchema[key];
    }
  }
  const fieldOrder: string[] = [];
  for (const field of fields) {
    const fieldName = field.name.trim();
    if (!fieldName) {
      continue;
    }
    fieldOrder.push(fieldName);
    const fieldUiSchema = buildFieldUiSchema(field);
    if (fieldUiSchema) {
      nextUiSchema[fieldName] = fieldUiSchema;
    }
  }
  if (fieldOrder.length > 0) {
    nextUiSchema['ui:order'] = fieldOrder;
  } else {
    delete nextUiSchema['ui:order'];
  }
  return nextUiSchema;
}

export function buildDesignerSchema(
  fields: TaskFormDesignerField[],
  baseFormSchema?: JsonSchemaObject,
  baseUiSchema?: JsonSchemaObject,
): { formSchema: JsonSchemaObject; uiSchema: JsonSchemaObject } {
  const nextFormSchema = clone(baseFormSchema ?? DEFAULT_FORM_SCHEMA);
  const nextUiSchema = buildUiSchema(fields, baseUiSchema);
  const properties: Record<string, JsonSchemaObject> = {};
  const required: string[] = [];
  nextFormSchema.type = 'object';
  nextFormSchema.additionalProperties = nextFormSchema.additionalProperties ?? true;
  for (const field of fields) {
    const fieldName = field.name.trim();
    if (!fieldName) {
      continue;
    }
    properties[fieldName] = buildFieldProperty(field);
    if (field.required) {
      required.push(fieldName);
    }
  }
  nextFormSchema.properties = properties;
  if (required.length > 0) {
    nextFormSchema.required = required;
  } else {
    delete nextFormSchema.required;
  }
  return { formSchema: nextFormSchema, uiSchema: nextUiSchema };
}

export function parseTransitionForms(
  transitionForms?: Record<string, unknown>,
): TaskFormDesignerTransition[] {
  return Object.entries(transitionForms ?? {}).map(([transitionId, config]) => {
    const transitionConfig = clone(
      config !== null && typeof config === 'object' && !Array.isArray(config)
        ? (config as JsonSchemaObject)
        : {},
    );
    return {
      key: createDesignerKey(transitionId),
      transitionId,
      fields: parseSchemaToDesignerFields(
        transitionConfig.formSchema as JsonSchemaObject | undefined,
        transitionConfig.uiSchema as JsonSchemaObject | undefined,
      ),
      config: transitionConfig,
    };
  });
}

export function buildTransitionForms(
  transitions: TaskFormDesignerTransition[],
): Record<string, JsonSchemaObject> {
  const acc: Record<string, JsonSchemaObject> = {};
  for (const transition of transitions) {
    const transitionId = transition.transitionId.trim();
    if (!transitionId) {
      continue;
    }
    const baseFormSchema = transition.config?.formSchema as JsonSchemaObject | undefined;
    const baseUiSchema = transition.config?.uiSchema as JsonSchemaObject | undefined;
    const { formSchema, uiSchema } = buildDesignerSchema(
      transition.fields,
      baseFormSchema,
      baseUiSchema,
    );
    acc[transitionId] = { ...clone(transition.config ?? {}), formSchema, uiSchema };
  }
  return acc;
}

export function parseStageMappings(
  defaultStageMappings?: Record<string, string>,
): TaskFormDesignerStageMapping[] {
  return Object.entries(defaultStageMappings ?? {}).map(([stageId, taskStatus]) => ({
    key: createDesignerKey(stageId),
    stageId,
    taskStatus,
  }));
}

export function buildStageMappings(
  mappings: TaskFormDesignerStageMapping[],
): Record<string, string> {
  const acc: Record<string, string> = {};
  for (const mapping of mappings) {
    const stageId = mapping.stageId.trim();
    const taskStatus = mapping.taskStatus.trim();
    if (stageId && taskStatus) {
      acc[stageId] = taskStatus;
    }
  }
  return acc;
}

const PREVIEW_VALUE_BUILDERS: Record<
  TaskFormDesignerFieldType,
  (field: TaskFormDesignerField) => unknown
> = {
  boolean: () => true,
  number: () => 42,
  singleSelect: (field) => field.options[0] ?? '',
  multiSelect: (field) => field.options.slice(0, 2),
  json: (field) => (field.schemaType === 'array' ? [] : {}),
  longText: (field) => `${field.label || field.name} details`,
  shortText: (field) => field.label || field.name,
};

export function getDesignerPreviewPayload(
  fields: TaskFormDesignerField[],
): Record<string, unknown> {
  const acc: Record<string, unknown> = {};
  for (const field of fields) {
    const fieldName = field.name.trim();
    if (!fieldName) {
      continue;
    }
    if (field.widget === 'tagSelector') {
      const tagName = (field.label || field.name || 'Sample Tag')
        .replaceAll(/\s+/g, '')
        .replaceAll(/[^A-Za-z0-9_.-]/g, '');
      acc[fieldName] = [
        {
          tagFQN: `SampleClassification.${tagName}`,
          displayName: field.label || field.name || 'Sample Tag',
          name: tagName,
          source: 'Classification',
          state: 'Confirmed',
          labelType: 'Manual',
        },
      ];
      continue;
    }
    const buildValue = PREVIEW_VALUE_BUILDERS[field.type] ?? PREVIEW_VALUE_BUILDERS.shortText;
    acc[fieldName] = buildValue(field);
  }
  return acc;
}
