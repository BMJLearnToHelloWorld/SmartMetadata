/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may
 * not use this file except in compliance with the License. You may obtain
 * a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import type { EntityRef } from '@/types/api';

/**
 * Persona entity, mirroring the official persona schema
 * (openmetadata-spec entity/teams/persona.json): id + name required, the
 * rest optional. `uiCustomization` is the legacy inline field; the
 * customize editors persist to the DocStore document instead, so it is
 * deliberately not mapped here.
 */
export interface Persona {
  id: string;
  name: string;
  fullyQualifiedName: string;
  displayName?: string;
  description?: string;
  users?: EntityRef[];
  default?: boolean;
  domains?: EntityRef[];
}

/**
 * Official CreatePersona (api/teams/createPersona.json): only name is
 * required. Users travel as user ids, exactly as the official
 * AddEditPersona submit maps selected users to their ids. `domains`
 * and `contextDefinition` are type-level only (PER-A4): no persona
 * surface in this partition sends them (PER-D12).
 */
export interface CreatePersonaRequest {
  name: string;
  displayName?: string;
  description?: string;
  users?: string[];
  default?: boolean;
  domains?: string[];
  contextDefinition?: PersonaContextDefinition;
}

/**
 * Official PersonaContextDefinition (generated/api/teams/createPersona.ts):
 * rules and settings used to materialize the shared AI context for a
 * persona. This is the generated shape, not the Context Center editor's
 * `PersonaAiContext` form shape; no same-name definition exists in the
 * product, so this is the single definition.
 */
export interface PersonaContextDefinition {
  cacheState?: CacheState;
  cacheTtlMinutes?: number;
  characterBudget?: number;
  enabled?: boolean;
  lastError?: string;
  lastGeneratedAt?: number;
  prompt?: string;
  rules?: ContextRule[];
}

/** Official CacheState (generated/api/teams/createPersona.ts). */
export type CacheState = 'FAILED' | 'FRESH' | 'GENERATING' | 'STALE';

/** Official ContextRule (generated/api/teams/createPersona.ts). */
export interface ContextRule {
  alwaysInContext?: boolean;
  description?: string;
  enabled?: boolean;
  entityType: string;
  filteredInSearch?: boolean;
  filterJsonTree?: string;
  fullyRendered?: boolean;
  id?: string;
  matchedCount?: number;
  maxAssets?: number;
  name: string;
  queryFilter?: string;
  sections?: ContextSection[];
}

/** Official ContextSection (generated/api/teams/createPersona.ts). */
export type ContextSection =
  | 'articles'
  | 'constraints'
  | 'dataQuality'
  | 'definition'
  | 'description'
  | 'formulaExpression'
  | 'fullBody'
  | 'glossaryTerms'
  | 'joins'
  | 'lineage'
  | 'metrics'
  | 'owner'
  | 'profile'
  | 'relatedAssets'
  | 'relatedTerms'
  | 'schema'
  | 'synonyms'
  | 'tags'
  | 'titleSummary'
  | 'unitGrain';

export type PageViewMode = 'table' | 'card' | 'tree';

export type ViewModePage = 'domains' | 'subDomains' | 'dataProducts' | 'learningResources';

/**
 * One entry of a persona document's personaPreferences array, mirroring
 * the official personaPreferences schema: appMode is classic or AI,
 * defaultLandingPage is a route path (unset means Home), and only
 * Domains offers the tree view mode.
 *
 * The index signature is the C-4 (RB-8) passthrough shape: the read
 * mapping keeps entry fields beyond the known schema verbatim instead
 * of rebuilding an allowlist, so an unedited entry round-trips through
 * a PATCH replace unchanged. The same holds for landingPageSettings.
 */
export interface PersonaPreferences {
  personaId: string;
  personaName?: string;
  appMode?: 'classic' | 'AI';
  defaultLandingPage?: string;
  defaultViewModes?: Partial<Record<ViewModePage, PageViewMode>>;
  landingPageSettings?: {
    headerColor?: string;
    headerImage?: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

/** A knowledge panel reference on a customized page. */
export interface PageTab {
  name?: string;
  [key: string]: unknown;
}

/**
 * A customized page inside a persona document, mirroring the official
 * Page schema (system/ui/page): pageType selects the page (LandingPage,
 * DataMarketplace, or an entity type), layout carries the widget grid
 * verbatim, knowledgePanels are panel references, tabs are the page tabs.
 *
 * The index signature is the C-4 (RB-8) passthrough shape: the read
 * mapping keeps fields beyond the known schema verbatim instead of
 * rebuilding an allowlist, so unedited page fields (persona, domains,
 * reference subfields, any other stored key) survive a PATCH replace
 * of the pages array. Verification is against schema fields; whether
 * real storage carries schema-external page fields is unconfirmed
 * (C-4 spec §3.4, V-9), so the passthrough is a constructive guarantee,
 * not a claim about stored data.
 */
export interface PersonaPage {
  pageType: string;
  entityType?: string;
  // Official layout is a WidgetConfig array; a Record is kept as a
  // tolerated shape because the JSON editor stores pages verbatim.
  layout?: unknown[] | Record<string, unknown>;
  knowledgePanels?: EntityRef[];
  tabs?: PageTab[];
  persona?: EntityRef;
  domains?: EntityRef[];
  [key: string]: unknown;
}

/**
 * A DocStore document (entity/docStore/document.json): name,
 * entityType and fullyQualifiedName are required server-side. The data
 * payload carries the customized pages and the per-persona preferences;
 * navigation is carried for forward compatibility with the official
 * empty-document template and otherwise untouched.
 *
 * `data` is a free object server-side (document.json: data is
 * `{type: object, additionalProperties: true}`), so the index
 * signature is the C-4 (RB-8) passthrough shape: the read mapping
 * keeps every stored data key (including `askCollateSidebar` and any
 * unknown key) instead of rebuilding a four-key allowlist. The PATCH
 * diff compares every data key, so a key no callback writes emits no
 * op and its stored value survives any save.
 */
export interface PersonaDocument {
  id?: string;
  name: string;
  fullyQualifiedName: string;
  entityType: string;
  data: {
    pages?: PersonaPage[];
    personaPreferences?: PersonaPreferences[];
    /**
     * Stage D (G-11): the per-user preferences array, a NEW data shape
     * that must not be confused with `personaPreferences` above. The
     * persona admin's choices live in `personaPreferences`; a single
     * user's own choices for a persona (today: the landing-page header
     * colour) live here, keyed by personaId, exactly as official
     * `Document.data.personPreferences`. The header-colour write path
     * (`handleBackgroundColorUpdate`) and the resolution order (own
     * choice first, then the persona admin's) both read this array.
     */
    personPreferences?: PersonaPreferences[];
    navigation?: unknown;
    [key: string]: unknown;
  };
  domains?: EntityRef[];
}

/**
 * Create payload for a DocStore document. The official create maps the
 * draft's domains to their fullyQualifiedNames (strings), unlike the
 * stored entity whose domains are references.
 */
export interface CreateDocumentRequest {
  name: string;
  fullyQualifiedName: string;
  entityType: string;
  data: PersonaDocument['data'];
  domains?: string[];
}

/** App-layout preference fields an editor may change (official subset). */
export interface PersonaAppLayoutPreferences {
  appMode?: 'classic' | 'AI';
  defaultLandingPage?: string;
  defaultViewModes?: Partial<Record<ViewModePage, PageViewMode>>;
}
