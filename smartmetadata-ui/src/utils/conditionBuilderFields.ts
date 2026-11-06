/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import type { WorkflowConditionFieldDefinition } from '@/types/governance';
import {
  fetchCertificationOptions,
  fetchDataProductOptions,
  fetchDomainOptions,
  fetchExpertOptions,
  fetchGlossaryOptions,
  fetchOwnerOptions,
  fetchRelatedTermsOptions,
  fetchSynonymsOptions,
  fetchTagOptions,
} from './conditionBuilderValueFetchers';

/**
 * Official ConditionBuilder.constants (pin a3012259ca), ported 1:1: the
 * fields a JSON Logic value-condition can be written against — the curated
 * subset of the common workflow trigger fields. Structural fields such as
 * `columns` are intentionally absent: they resolve to arrays of objects
 * and cannot be value-compared. Labels are `workflows.builder.*` i18n keys
 * (the product has no `label.*` namespace — see R-13).
 */
const WORKFLOW_TRIGGER_CONDITION_FIELDS: string[] = [
  'name',
  'displayName',
  'fullyQualifiedName',
  'description',
  'owners',
  'reviewers',
  'tags',
  'certification',
  'domains',
  'dataProducts',
  'extension',
  'deleted',
  'synonyms',
  'relatedTerms',
  'references',
  'glossary',
  'parent',
  'children',
  'experts',
  'style',
  'glossaryTerms',
];

const WORKFLOW_TRIGGER_FIELD_LABEL_KEYS: Record<string, string> = {
  certification: 'workflows.builder.conditionFieldCertification',
  children: 'workflows.builder.conditionFieldChildren',
  dataProducts: 'workflows.builder.conditionFieldDataProducts',
  deleted: 'workflows.builder.conditionFieldDeleted',
  description: 'workflows.builder.conditionFieldDescription',
  displayName: 'workflows.builder.conditionFieldDisplayName',
  domains: 'workflows.builder.conditionFieldDomains',
  experts: 'workflows.builder.conditionFieldExperts',
  extension: 'workflows.builder.conditionFieldExtension',
  glossary: 'workflows.builder.conditionFieldGlossary',
  name: 'workflows.builder.conditionFieldName',
  owners: 'workflows.builder.conditionFieldOwners',
  parent: 'workflows.builder.conditionFieldParent',
  references: 'workflows.builder.conditionFieldReferences',
  relatedTerms: 'workflows.builder.conditionFieldRelatedTerms',
  reviewers: 'workflows.builder.conditionFieldReviewers',
  synonyms: 'workflows.builder.conditionFieldSynonyms',
  tags: 'workflows.builder.conditionFieldTags',
};

type FetchOptionsFn = (
  s: string,
) => Promise<{ value: string; label: string }[]>;

/** Dropdown fields that use an API to fetch options (only a subset of trigger fields). */
const DROPDOWN_FIELDS: Partial<Record<string, FetchOptionsFn>> = {
  certification: fetchCertificationOptions,
  dataProducts: fetchDataProductOptions,
  domains: fetchDomainOptions,
  experts: fetchExpertOptions,
  glossary: fetchGlossaryOptions,
  owners: fetchOwnerOptions,
  reviewers: fetchExpertOptions,
  relatedTerms: fetchRelatedTermsOptions,
  synonyms: fetchSynonymsOptions,
  tags: fetchTagOptions,
};

const BOOLEAN_OPTIONS: WorkflowConditionFieldDefinition['values'] = [
  { value: 'true', label: 'workflows.builder.conditionTrue' },
  { value: 'false', label: 'workflows.builder.conditionFalse' },
];

export const CONDITION_BUILDER_WORKFLOW_TRIGGER_FIELDS: WorkflowConditionFieldDefinition[] =
  WORKFLOW_TRIGGER_CONDITION_FIELDS.map((fieldValue) => {
    const fetchOptions = DROPDOWN_FIELDS[fieldValue];
    const isDropdown = Boolean(fetchOptions);
    const isBoolean = fieldValue === 'deleted';
    let valueType: WorkflowConditionFieldDefinition['valueType'] = 'text';
    if (isBoolean) {
      valueType = 'boolean';
    } else if (isDropdown) {
      valueType = 'dropdown';
    }

    const supportsSearch = !fetchOptions || fieldValue !== 'certification';

    return {
      value: fieldValue,
      label: WORKFLOW_TRIGGER_FIELD_LABEL_KEYS[fieldValue] ?? fieldValue,
      values: isBoolean ? BOOLEAN_OPTIONS : [],
      valueType,
      ...(fetchOptions && {
        fetchOptions,
        supportsSearch,
      }),
    };
  });
