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

/** Mirrors official PageType: an article body page or an external quick link. */
export type KnowledgePageType = 'Article' | 'QuickLink';

export interface KnowledgePage {
  id: string;
  name: string;
  fullyQualifiedName: string;
  displayName?: string;
  description?: string;
  version?: number;
  updatedAt?: number;
  updatedBy?: string;
  owners?: EntityRef[];
  tags?: TagRef[];
  pageType: KnowledgePageType;
  /** QuickLink target URL; absent for articles. */
  pageUrl?: string;
  parent?: EntityRef;
  children?: EntityRef[];
  deleted?: boolean;
  /** Custom-property values (official Page.extension, free-form object). */
  extension?: Record<string, unknown>;
}

export interface CreateKnowledgePageRequest {
  name: string;
  displayName?: string;
  description?: string;
  pageType: KnowledgePageType;
  /** Required when pageType is QuickLink; ignored for articles. */
  pageUrl?: string;
}

export type ContextMemoryStatus =
  | 'Unprocessed'
  | 'Draft'
  | 'Approved'
  | 'Superseded'
  | 'Invalidated'
  | 'Archived'
  | 'Rejected'
  | 'Deprecated';

export interface ContextMemory {
  id: string;
  name?: string;
  displayName?: string;
  description?: string;
  question?: string;
  answer?: string;
  entityStatus?: ContextMemoryStatus;
  pinned?: boolean;
  /**
   * Times this memory was applied/cited (official appliedCount). Mapped in
   * mapContextMemory; the most-cited card sorts on it. Never substitute
   * usageCount — see ADR:2026-11-07-context-center-most-cited-memories.
   */
  appliedCount?: number;
  owners?: EntityRef[];
  primaryEntity?: EntityRef;
  updatedAt?: number;
  updatedBy?: string;
}

export interface ContextFile {
  id: string;
  name: string;
  displayName?: string;
  description?: string;
  fileExtension?: string;
  fileType?: string;
  fileSize?: number;
  contentType?: string;
  folder?: EntityRef;
  memoryCount?: number;
  pageCount?: number;
  processingStatus?: string;
  updatedAt?: number;
  updatedBy?: string;
  sourceUrl?: string;
  /** Official SourceType: Confluence, DriveSync, Notion, Upload. */
  sourceType?: string;
}

export interface DriveFolder {
  id: string;
  name: string;
  fullyQualifiedName?: string;
  displayName?: string;
  description?: string;
  childrenCount?: number;
  updatedAt?: number;
  updatedBy?: string;
}

export interface PersonaAiContextRule {
  id?: string;
  entityType: string;
  description?: string;
  enabled?: boolean;
  alwaysInContext?: boolean;
  filteredInSearch?: boolean;
}

export interface PersonaAiContext {
  id: string;
  name: string;
  fullyQualifiedName?: string;
  displayName?: string;
  description?: string;
  users?: EntityRef[];
  /** Rules carried on the persona's context definition, if any. */
  rules?: PersonaAiContextRule[];
  characterBudget?: number;
  cacheTtlMinutes?: number;
  enabled?: boolean;
  prompt?: string;
}

/** Per-persona materialization status, keyed by persona id on the list page. */
export interface PersonaAiContextStatus {
  personaId: string;
  entitiesIncluded?: number;
  tokensEst?: number;
  lastGeneratedAt?: number;
  lastError?: string;
}
