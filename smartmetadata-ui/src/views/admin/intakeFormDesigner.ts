/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import type {
  CreateIntakeForm,
  FieldKind,
  IntakeForm,
  IntakeFormField,
  TargetEntityType,
} from '@/api/intakeForms';

/** i18n key for each TargetEntityType's display label, resolved with t(). */
export const ENTITY_TYPE_LABEL_KEYS: Record<TargetEntityType, string> = {
  metric: 'intakeForms.entityTypes.metric',
  dataProduct: 'intakeForms.entityTypes.dataProduct',
  domain: 'intakeForms.entityTypes.domain',
  glossary: 'intakeForms.entityTypes.glossary',
  glossaryTerm: 'intakeForms.entityTypes.glossaryTerm',
};

export interface IntakeFormNativeField {
  path: string;
  /** i18n key resolved via t() at render time. */
  labelKey: string;
}

/**
 * Curated list of native fields an admin may optionally mark required on an
 * IntakeForm, ported from the official intakeFormFields. Schema-required
 * fields (name, description, domains/domainType/glossary) are intentionally
 * excluded — they are enforced by the entity's JSON schema and cannot be
 * overridden. System fields (id, version, updatedAt, etc.) are likewise
 * omitted.
 */
export const NATIVE_FIELDS_BY_ENTITY_TYPE: Record<TargetEntityType, IntakeFormNativeField[]> = {
  metric: [
    { path: 'displayName', labelKey: 'intakeForms.fieldLabels.displayName' },
    { path: 'description', labelKey: 'intakeForms.fieldLabels.description' },
    { path: 'metricType', labelKey: 'intakeForms.fieldLabels.metricType' },
    { path: 'granularity', labelKey: 'intakeForms.fieldLabels.granularity' },
    { path: 'unitOfMeasurement', labelKey: 'intakeForms.fieldLabels.unitOfMeasurement' },
    { path: 'owners', labelKey: 'intakeForms.fieldLabels.owners' },
    { path: 'reviewers', labelKey: 'intakeForms.fieldLabels.reviewers' },
    { path: 'domains', labelKey: 'intakeForms.fieldLabels.domains' },
  ],
  dataProduct: [
    { path: 'displayName', labelKey: 'intakeForms.fieldLabels.displayName' },
    { path: 'dataProductType', labelKey: 'intakeForms.fieldLabels.dataProductType' },
    { path: 'visibility', labelKey: 'intakeForms.fieldLabels.visibility' },
    { path: 'portfolioPriority', labelKey: 'intakeForms.fieldLabels.portfolioPriority' },
    { path: 'tags', labelKey: 'intakeForms.fieldLabels.tags' },
    { path: 'owners', labelKey: 'intakeForms.fieldLabels.owners' },
    { path: 'reviewers', labelKey: 'intakeForms.fieldLabels.reviewers' },
    { path: 'experts', labelKey: 'intakeForms.fieldLabels.experts' },
  ],
  domain: [
    { path: 'displayName', labelKey: 'intakeForms.fieldLabels.displayName' },
    { path: 'tags', labelKey: 'intakeForms.fieldLabels.tags' },
    { path: 'owners', labelKey: 'intakeForms.fieldLabels.owners' },
    { path: 'experts', labelKey: 'intakeForms.fieldLabels.experts' },
  ],
  glossary: [
    { path: 'displayName', labelKey: 'intakeForms.fieldLabels.displayName' },
    { path: 'tags', labelKey: 'intakeForms.fieldLabels.tags' },
    { path: 'owners', labelKey: 'intakeForms.fieldLabels.owners' },
    { path: 'reviewers', labelKey: 'intakeForms.fieldLabels.reviewers' },
    { path: 'domains', labelKey: 'intakeForms.fieldLabels.domains' },
  ],
  glossaryTerm: [
    { path: 'displayName', labelKey: 'intakeForms.fieldLabels.displayName' },
    { path: 'synonyms', labelKey: 'intakeForms.fieldLabels.synonyms' },
    { path: 'tags', labelKey: 'intakeForms.fieldLabels.tags' },
    { path: 'owners', labelKey: 'intakeForms.fieldLabels.owners' },
    { path: 'reviewers', labelKey: 'intakeForms.fieldLabels.reviewers' },
  ],
};

/** A single editable row in the IntakeForm designer field tables. */
export interface IntakeFormFieldRow {
  path: string;
  label: string;
  kind: FieldKind;
  included: boolean;
  required: boolean;
  errorMessage?: string;
  isOrphan?: boolean;
}

type IntakeFormFieldConfiguration = Pick<IntakeForm, 'formFields' | 'requiredFields'>;

export function getIntakeFormFields(
  intakeForm?: IntakeFormFieldConfiguration | null,
): IntakeFormField[] {
  if (intakeForm?.formFields?.length || !intakeForm?.requiredFields?.length) {
    return intakeForm?.formFields ?? [];
  }
  return (intakeForm?.requiredFields ?? []).map((field) => ({ ...field, required: true }));
}

export function toLegacyRequiredFields(formFields: IntakeFormField[]): IntakeFormField[] {
  return formFields
    .filter((field) => field.required)
    .map(({ errorMessage, fieldKind, fieldLabel, fieldPath }) => ({
      errorMessage,
      fieldKind,
      fieldLabel,
      fieldPath,
    }));
}

/**
 * Builds the designer's editable field rows: native fields (always listed),
 * the entity's current custom properties, and any custom property that the
 * saved form still references but that no longer exists on the entity
 * (orphan).
 */
export function computeFieldRows(args: {
  nativeFields: IntakeFormNativeField[];
  customProperties: Array<{ name?: string; displayName?: string }>;
  initialValue?: IntakeFormFieldConfiguration | null;
  t: (key: string) => string;
}): IntakeFormFieldRow[] {
  const existingSelections = new Map<string, IntakeFormField>(
    getIntakeFormFields(args.initialValue).map((field) => [field.fieldPath, field]),
  );
  const nativeRows: IntakeFormFieldRow[] = args.nativeFields.map((field) => {
    const existing = existingSelections.get(field.path);
    return {
      path: field.path,
      label: args.t(field.labelKey),
      kind: 'native' as FieldKind,
      included: true,
      required: Boolean(existing?.required),
      errorMessage: existing?.errorMessage,
    };
  });
  const customPropertyPaths = new Set(
    args.customProperties.map((property) => `extension.${property.name}`),
  );
  const customRows: IntakeFormFieldRow[] = args.customProperties.map((property) => {
    const path = `extension.${property.name}`;
    const existing = existingSelections.get(path);
    return {
      path,
      label: property.displayName || property.name || path,
      kind: 'customProperty' as FieldKind,
      included: Boolean(existing),
      required: Boolean(existing?.required),
      errorMessage: existing?.errorMessage,
    };
  });
  const orphanCustomRows: IntakeFormFieldRow[] = Array.from(existingSelections.values())
    .filter(
      (field) =>
        field.fieldKind === 'customProperty' && !customPropertyPaths.has(field.fieldPath),
    )
    .map((field) => ({
      path: field.fieldPath,
      label: field.fieldLabel,
      kind: 'customProperty' as FieldKind,
      included: true,
      required: Boolean(field.required),
      errorMessage: field.errorMessage,
      isOrphan: true,
    }));
  return [...nativeRows, ...customRows, ...orphanCustomRows];
}

/**
 * Maps designer rows to a CreateIntakeForm payload. Native fields are
 * persisted only when required; custom properties when included.
 * errorMessage is dropped for non-required fields.
 */
export function buildIntakeFormPayload(args: {
  rows: IntakeFormFieldRow[];
  entityType: TargetEntityType;
  name: string;
  displayName: string;
  description: string;
  enabled: boolean;
  owners?: IntakeForm['owners'];
}): CreateIntakeForm {
  const formFields: IntakeFormField[] = args.rows
    .filter((row) => (row.kind === 'native' ? row.required : row.included))
    .map((row) => ({
      fieldPath: row.path,
      fieldLabel: row.label,
      fieldKind: row.kind,
      required: row.required,
      errorMessage: row.required ? row.errorMessage || undefined : undefined,
    }));
  return {
    name: args.name,
    displayName: args.displayName,
    description: args.description || undefined,
    entityType: args.entityType,
    enabled: args.enabled,
    formFields,
    requiredFields: toLegacyRequiredFields(formFields),
    ...(args.owners ? { owners: args.owners } : {}),
  };
}
