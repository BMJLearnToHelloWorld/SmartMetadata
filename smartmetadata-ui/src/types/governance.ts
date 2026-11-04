/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import type { EntityRef, TagRef } from './api';

export type TagSource = 'Classification' | 'Glossary';

export interface Glossary {
  id: string;
  name: string;
  displayName?: string;
  description?: string;
  fullyQualifiedName?: string;
  mutuallyExclusive?: boolean;
  termCount?: number;
  owners: EntityRef[];
  reviewers: EntityRef[];
  tags: TagRef[];
  domains: EntityRef[];
}

export interface CreateGlossaryRequest {
  name: string;
  description: string;
  displayName?: string;
  mutuallyExclusive?: boolean;
}

export interface GlossaryTerm {
  id: string;
  name: string;
  displayName?: string;
  description?: string;
  fullyQualifiedName?: string;
  glossary?: EntityRef;
  parent?: EntityRef;
  mutuallyExclusive?: boolean;
  relatedTerms: EntityRef[];
  owners: EntityRef[];
  tags: TagRef[];
  /** Absent when the term has no children: Ant Table renders an expand icon
      for any truthy children value, so an empty array would be a dead icon. */
  children?: EntityRef[];
  /** Whole-subtree child count from the API; the expand icon is gated on
      loaded children data, not on this count, so a row never expands to
      nothing while its children page is still unloaded. */
  childrenCount?: number;
  usageCount?: number;
  /** Present when the catalog returns entityStatus; never invent one. */
  status?: string;
}

export interface CreateGlossaryTermRequest {
  glossary: string;
  name: string;
  description: string;
  displayName?: string;
  parent?: string;
  relatedTerms?: string[];
  mutuallyExclusive?: boolean;
}

export interface Classification {
  id: string;
  name: string;
  displayName?: string;
  description?: string;
  fullyQualifiedName?: string;
  mutuallyExclusive?: boolean;
  termCount?: number;
  disabled?: boolean;
  owners: EntityRef[];
}

export interface CreateClassificationRequest {
  name: string;
  description: string;
  displayName?: string;
  mutuallyExclusive?: boolean;
}

export interface ClassificationTag {
  id: string;
  name: string;
  displayName?: string;
  description?: string;
  fullyQualifiedName?: string;
  classification?: EntityRef;
  parent?: EntityRef;
  mutuallyExclusive?: boolean;
  /** OM Tag entity field; previously unmapped by the product. */
  disabled?: boolean;
  usageCount?: number;
  owners: EntityRef[];
}

export interface CreateTagRequest {
  name: string;
  description: string;
  classification?: string;
  parent?: string;
  displayName?: string;
  mutuallyExclusive?: boolean;
}

export const DOMAIN_TYPES = ['Source-aligned', 'Consumer-aligned', 'Aggregate'] as const;
export type DomainType = (typeof DOMAIN_TYPES)[number];

export interface Domain {
  id: string;
  name: string;
  displayName?: string;
  description?: string;
  fullyQualifiedName?: string;
  domainType: string;
  parent?: EntityRef;
  owners: EntityRef[];
  experts: EntityRef[];
  tags: TagRef[];
  /** Custom-property values, keyed by property name. */
  extension?: Record<string, unknown>;
  /** Absent when the domain has no sub-domains: the list renders flat, and a
      truthy empty array would draw a dead expand icon on every row. */
  children?: EntityRef[];
  childrenCount?: number;
}

/**
 * Official UI style (type/basic.json#/definitions/style, cover image
 * excluded: the marketplace create forms do not offer it). Color is a hex
 * code, iconURL an icon URL; both optional.
 */
export interface EntityStyle {
  color?: string;
  iconURL?: string;
}

export interface CreateDomainRequest {
  name: string;
  description: string;
  domainType: DomainType | string;
  displayName?: string;
  parent?: string;
  /** Official createDomain owners: entity references (type user/team). */
  owners?: EntityRef[];
  /** Official createDomain experts: user/login names, not references. */
  experts?: string[];
  style?: EntityStyle;
}

export interface DataProduct {
  id: string;
  name: string;
  displayName?: string;
  description?: string;
  fullyQualifiedName?: string;
  domains: EntityRef[];
  owners: EntityRef[];
  experts: EntityRef[];
  tags: TagRef[];
  /** Custom-property values, keyed by property name. */
  extension?: Record<string, unknown>;
}

export interface CreateDataProductRequest {
  name: string;
  description: string;
  domains: string[];
  displayName?: string;
  /** Official createDataProduct owners: entity references (type user/team). */
  owners?: EntityRef[];
  /** Official createDataProduct experts: user/login names, not references. */
  experts?: string[];
  style?: EntityStyle;
}

export interface AssetTagOption {
  tagFQN: string;
  name: string;
  source: TagSource;
}

/**
 * Workflow definition (official WorkflowsPage list item): the card shows
 * displayName ?? name plus description; the key is the fully qualified name.
 * The create contract (api/governance/createWorkflowDefinition.json) requires
 * name and description.
 */
export interface WorkflowDefinition {
  id: string;
  name: string;
  displayName?: string;
  fullyQualifiedName?: string;
  description?: string;
}

export interface CreateWorkflowDefinitionRequest {
  name: string;
  description: string;
  displayName?: string;
}
