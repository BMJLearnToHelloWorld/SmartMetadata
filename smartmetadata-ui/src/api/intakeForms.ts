/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { asBoolean, asRecord, asString, parsePaged } from '@/api/json';
import type { Paged } from '@/types/admin';
import { apiRequest } from './client';

/** Entity types an IntakeForm may target; one form per entity type. */
export type TargetEntityType =
  | 'dataProduct'
  | 'domain'
  | 'glossary'
  | 'glossaryTerm'
  | 'metric';

export type FieldKind = 'native' | 'customProperty';

/** A field included in an IntakeForm, mirroring the official IntakeFormField. */
export interface IntakeFormField {
  fieldPath: string;
  fieldLabel: string;
  fieldKind: FieldKind;
  required?: boolean;
  errorMessage?: string;
}

/**
 * IntakeForm entity: the entity type it applies to, whether it is
 * enforced, and the fields it marks required. requiredFields is the
 * deprecated compatibility input; formFields is the current one.
 */
export interface IntakeForm {
  id: string;
  name?: string;
  displayName?: string;
  description?: string;
  entityType: TargetEntityType;
  enabled?: boolean;
  formFields?: IntakeFormField[];
  requiredFields?: IntakeFormField[];
  owners?: unknown[];
  fullyQualifiedName?: string;
}

export interface CreateIntakeForm {
  name: string;
  displayName?: string;
  description?: string;
  entityType: TargetEntityType;
  enabled?: boolean;
  formFields?: IntakeFormField[];
  requiredFields?: IntakeFormField[];
  owners?: unknown[];
}

function mapIntakeFormField(raw: unknown): IntakeFormField | null {
  const rec = asRecord(raw);
  if (!rec) {
    return null;
  }
  const fieldPath = asString(rec.fieldPath);
  if (!fieldPath) {
    return null;
  }
  return {
    fieldPath,
    fieldLabel: asString(rec.fieldLabel) || fieldPath,
    fieldKind: rec.fieldKind === 'customProperty' ? 'customProperty' : 'native',
    required: asBoolean(rec.required),
    errorMessage: asString(rec.errorMessage) || undefined,
  };
}

export function mapIntakeForm(raw: Record<string, unknown>): IntakeForm | null {
  const id = asString(raw.id);
  const entityType = asString(raw.entityType) as TargetEntityType;
  if (!id || !entityType) {
    return null;
  }
  const fields = (value: unknown): IntakeFormField[] | undefined =>
    Array.isArray(value)
      ? value.flatMap((item) => {
          const mapped = mapIntakeFormField(item);
          return mapped ? [mapped] : [];
        })
      : undefined;
  return {
    id,
    name: asString(raw.name) || undefined,
    displayName: asString(raw.displayName) || undefined,
    description: asString(raw.description) || undefined,
    entityType,
    enabled: asBoolean(raw.enabled),
    formFields: fields(raw.formFields),
    requiredFields: fields(raw.requiredFields),
    owners: Array.isArray(raw.owners) ? raw.owners : undefined,
    fullyQualifiedName: asString(raw.fullyQualifiedName) || undefined,
  };
}

/** Official intakeFormsAPI: GET /v1/governance/intakeForms. */
export function listIntakeForms(
  query: { fields?: string } = {},
): Promise<Paged<IntakeForm>> {
  return apiRequest<unknown>('/v1/governance/intakeForms', {
    query: query.fields ? { fields: query.fields } : {},
  }).then((payload) => parsePaged(payload, mapIntakeForm));
}

/** Official intakeFormsAPI: POST /v1/governance/intakeForms. */
export async function createIntakeForm(data: CreateIntakeForm): Promise<IntakeForm> {
  const raw = await apiRequest<unknown>('/v1/governance/intakeForms', { json: data });
  const rec = asRecord(raw);
  const mapped = rec ? mapIntakeForm(rec) : null;
  if (!mapped) {
    throw new Error('Intake form response was missing its id');
  }
  return mapped;
}

/** Official intakeFormsAPI: PUT /v1/governance/intakeForms (create or update). */
export async function createOrUpdateIntakeForm(data: CreateIntakeForm): Promise<IntakeForm> {
  const raw = await apiRequest<unknown>('/v1/governance/intakeForms', {
    method: 'PUT',
    json: data,
  });
  const rec = asRecord(raw);
  const mapped = rec ? mapIntakeForm(rec) : null;
  if (!mapped) {
    throw new Error('Intake form response was missing its id');
  }
  return mapped;
}

/**
 * Official intakeFormsAPI PATCH: only /enabled is patched. A PUT with the
 * CreateIntakeForm payload would replace the whole entity and the backend
 * mapper copies owners from the request, clearing previously set owners.
 */
export function patchIntakeForm(
  id: string,
  patch: Array<{ op: string; path: string; value: unknown }>,
): Promise<unknown> {
  return apiRequest<unknown>(`/v1/governance/intakeForms/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    json: patch,
    contentType: 'application/json-patch+json',
  });
}

/** Official intakeFormsAPI: DELETE /v1/governance/intakeForms/{id}?hardDelete. */
export function deleteIntakeForm(id: string, hardDelete = true): Promise<unknown> {
  return apiRequest<unknown>(`/v1/governance/intakeForms/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    query: { hardDelete },
  });
}
