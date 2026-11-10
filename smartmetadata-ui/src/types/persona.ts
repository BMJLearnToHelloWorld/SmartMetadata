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
 * AddEditPersona submit maps selected users to their ids.
 */
export interface CreatePersonaRequest {
  name: string;
  displayName?: string;
  description?: string;
  users?: string[];
  default?: boolean;
}

export type PageViewMode = 'table' | 'card' | 'tree';

export type ViewModePage = 'domains' | 'subDomains' | 'dataProducts' | 'learningResources';

/**
 * One entry of a persona document's personaPreferences array, mirroring
 * the official personaPreferences schema: appMode is classic or AI,
 * defaultLandingPage is a route path (unset means Home), and only
 * Domains offers the tree view mode.
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
  };
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
}

/**
 * A DocStore document (entity/docStore/document.json): name,
 * entityType and fullyQualifiedName are required server-side. The data
 * payload carries the customized pages and the per-persona preferences;
 * navigation is carried for forward compatibility with the official
 * empty-document template and otherwise untouched.
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
