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
  children: EntityRef[];
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
  children: EntityRef[];
}

export interface CreateDomainRequest {
  name: string;
  description: string;
  domainType: DomainType | string;
  displayName?: string;
  parent?: string;
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
}

export interface CreateDataProductRequest {
  name: string;
  description: string;
  domains: string[];
  displayName?: string;
}

export interface AssetTagOption {
  tagFQN: string;
  name: string;
  source: TagSource;
}
