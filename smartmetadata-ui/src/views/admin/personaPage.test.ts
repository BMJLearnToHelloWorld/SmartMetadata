/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may
 * not use this file except in compliance with the License. You may obtain
 * a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { describe, expect, it } from 'vitest';
import type { PersonaDocument } from '@/types/persona';
import {
  CUSTOMIZE_PAGE_CARD_EXCLUDED_KEYS,
  CUSTOMIZE_PAGE_CATEGORIES,
  DEFAULT_LANDING_PAGE,
  ENTITY_CUSTOMIZE_DESCRIPTION_KEY,
  getCustomizePageCardCategories,
  getCustomizePageOptions,
  getPersonPreferences,
  getPersonaPage,
  getPersonaPreferences,
  isLandingPageOption,
  normalizePersonaDocument,
  resolveLandingRedirect,
  resolvePersonaLandingPage,
  resolvePersonaViewMode,
  updatePersonPreferences,
  updatePersonaAppLayout,
  updatePersonaDocumentPage,
} from './personaPage';

const doc: PersonaDocument = {
  id: 'doc1',
  name: 'Analyst-Analyst',
  fullyQualifiedName: 'persona.Analyst',
  entityType: 'Page',
  data: {
    pages: [
      { pageType: 'LandingPage', layout: { widgets: [] } },
      { pageType: 'DataMarketplace', layout: { widgets: ['a'] } },
    ],
    personaPreferences: [
      {
        personaId: 'p1',
        personaName: 'Analyst',
        appMode: 'classic',
        defaultLandingPage: '/marketplace',
        defaultViewModes: { domains: 'tree' },
      },
    ],
  },
};

describe('personaPage utils', () => {
  it('finds a page by pageType and misses unknown types', () => {
    expect(getPersonaPage(doc, 'LandingPage')?.layout).toEqual({ widgets: [] });
    expect(getPersonaPage(doc, 'Nope')).toBeUndefined();
    expect(getPersonaPage(doc, null)).toBeUndefined();
  });

  it('normalizes away entries without a string pageType', () => {
    const dirty = {
      ...doc,
      data: { pages: [{ pageType: 'LandingPage' }, { layout: {} }, null] },
    } as unknown as PersonaDocument;
    const normalized = normalizePersonaDocument(dirty);
    expect(normalized.data.pages).toHaveLength(1);
    expect(normalized.data.pages?.[0]?.pageType).toBe('LandingPage');
  });

  it('upserts, replaces and removes pages', () => {
    const added = updatePersonaDocumentPage(doc, 'Domain', { pageType: 'Domain', layout: {} });
    expect(added.data.pages).toHaveLength(3);
    const replaced = updatePersonaDocumentPage(doc, 'LandingPage', {
      pageType: 'LandingPage',
      layout: { widgets: ['x'] },
    });
    expect(replaced.data.pages?.find((p) => p.pageType === 'LandingPage')?.layout).toEqual({
      widgets: ['x'],
    });
    const removed = updatePersonaDocumentPage(doc, 'LandingPage');
    expect(removed.data.pages).toHaveLength(1);
    expect(updatePersonaDocumentPage(doc, 'Missing')).toBe(doc);
  });

  it('reads and updates app-layout preferences with undefined removal', () => {
    expect(getPersonaPreferences(doc, 'p1')?.appMode).toBe('classic');
    const added = updatePersonaAppLayout([], { id: 'p1', name: 'Analyst' }, { appMode: 'AI' });
    expect(added).toEqual([{ personaId: 'p1', personaName: 'Analyst', appMode: 'AI' }]);
    expect(updatePersonaAppLayout([], { id: 'p1', name: 'Analyst' }, {})).toEqual([]);
    const cleared = updatePersonaAppLayout(doc.data.personaPreferences ?? [], { id: 'p1', name: 'Analyst' }, {});
    expect(cleared[0]).toEqual({ personaId: 'p1', personaName: 'Analyst' });
  });

  it('reads and updates per-user preferences without touching personaPreferences', () => {
    const withPerson = {
      ...doc,
      data: {
        ...doc.data,
        personPreferences: [
          { personaId: 'p1', landingPageSettings: { headerColor: '#099250' } },
          { personaId: 'p2', landingPageSettings: { headerColor: '#1570EF' } },
        ],
      },
    };
    expect(getPersonPreferences(withPerson, 'p1')?.landingPageSettings?.headerColor).toBe('#099250');
    expect(getPersonPreferences(withPerson, 'p9')).toBeUndefined();
    expect(getPersonPreferences(doc, 'p1')).toBeUndefined();
    // No document id: the append branch (official else-branch).
    const added = updatePersonPreferences([], { id: 'p1', name: 'Analyst' }, '#099250', {});
    expect(added).toEqual([
      { personaId: 'p1', personaName: 'Analyst', landingPageSettings: { headerColor: '#099250' } },
    ]);
    // Persisted document + non-empty array: the map-only branch.
    const updated = updatePersonPreferences(
      withPerson.data.personPreferences ?? [],
      { id: 'p1', name: 'Analyst' },
      '#E04F16',
      { documentId: 'doc1' },
    );
    expect(updated[0]?.landingPageSettings?.headerColor).toBe('#E04F16');
    expect(updated[1]?.landingPageSettings?.headerColor).toBe('#1570EF');
    const cleared = updatePersonPreferences(
      withPerson.data.personPreferences ?? [],
      { id: 'p1', name: 'Analyst' },
      undefined,
      { documentId: 'doc1' },
    );
    expect(cleared[0]?.landingPageSettings?.headerColor).toBeUndefined();
    expect(cleared[0]?.personaId).toBe('p1');
  });

  it('pins the official map-only quirk: no match means no append, document unchanged', () => {
    const others = [
      { personaId: 'p2', landingPageSettings: { headerColor: '#1570EF' } },
    ];
    const result = updatePersonPreferences(others, { id: 'p1', name: 'Analyst' }, '#099250', {
      documentId: 'doc1',
    });
    expect(result).toEqual(others);
    expect(result).toHaveLength(1);
    expect(result[0]).toBe(others[0]);
    expect(getPersonPreferences({ ...doc, data: { personPreferences: result } }, 'p1')).toBeUndefined();
  });

  it('appends when the array is empty even for a persisted document', () => {
    const result = updatePersonPreferences([], { id: 'p1', name: 'Analyst' }, '#099250', {
      documentId: 'doc1',
    });
    expect(result).toHaveLength(1);
    expect(result[0]?.personaId).toBe('p1');
  });

  it('pins the official append branch: no document id appends unconditionally, even on a match', () => {
    const existing = [
      { personaId: 'p1', landingPageSettings: { headerColor: '#099250' } },
    ];
    const result = updatePersonPreferences(existing, { id: 'p1', name: 'Analyst' }, '#E04F16', {});
    expect(result).toHaveLength(2);
    expect(result.filter((entry) => entry.personaId === 'p1')).toHaveLength(2);
    expect(result[1]?.landingPageSettings?.headerColor).toBe('#E04F16');
  });

  it('map branch preserves the matched entry’s other fields and settings subfields', () => {
    const entries = [
      {
        personaId: 'p1',
        personaName: 'Analyst',
        appMode: 'classic' as const,
        landingPageSettings: { headerColor: '#099250', headerImage: 'img-1' },
        futureField: 'kept',
      },
    ];
    const result = updatePersonPreferences(entries, { id: 'p1', name: 'Analyst' }, '#E04F16', {
      documentId: 'doc1',
    });
    expect(result[0]).toEqual({
      personaId: 'p1',
      personaName: 'Analyst',
      appMode: 'classic',
      landingPageSettings: { headerColor: '#E04F16', headerImage: 'img-1' },
      futureField: 'kept',
    });
  });

  it('resolves the landing page only from the curated list', () => {
    expect(resolvePersonaLandingPage(doc, 'p1')).toBe('/marketplace');
    expect(isLandingPageOption('/marketplace')).toBe(true);
    expect(isLandingPageOption('/admin/settings')).toBe(false);
    const stale = {
      ...doc,
      data: { personaPreferences: [{ personaId: 'p1', defaultLandingPage: '/admin/settings' }] },
    };
    expect(resolvePersonaLandingPage(stale, 'p1')).toBe(DEFAULT_LANDING_PAGE);
    expect(resolvePersonaLandingPage(undefined, 'p1')).toBe(DEFAULT_LANDING_PAGE);
  });

  it('resolves view modes only from the views a page offers', () => {
    expect(resolvePersonaViewMode(doc, 'p1', 'domains')).toBe('tree');
    expect(resolvePersonaViewMode(doc, 'p1', 'dataProducts')).toBe('table');
    const illegal = {
      ...doc,
      data: { personaPreferences: [{ personaId: 'p1', defaultViewModes: { dataProducts: 'tree' } }] },
    };
    expect(resolvePersonaViewMode(illegal, 'p1', 'dataProducts')).toBe('table');
  });

  it('redirects only on app entry to a non-default landing page', () => {
    expect(resolveLandingRedirect({ landingPage: '/marketplace', alreadyHandled: false })).toBe(
      '/marketplace',
    );
    expect(resolveLandingRedirect({ landingPage: '/marketplace', alreadyHandled: true })).toBeNull();
    expect(resolveLandingRedirect({ landingPage: DEFAULT_LANDING_PAGE, alreadyHandled: false })).toBeNull();
  });

  it('never normalizes homepage: the raw pageFqn string is matched, stored, and removed as-is', () => {
    const saved = updatePersonaDocumentPage(doc, 'homepage', { pageType: 'homepage', layout: [] });
    expect(saved.data.pages?.map((page) => page.pageType)).toEqual([
      'LandingPage',
      'DataMarketplace',
      'homepage',
    ]);
    expect(getPersonaPage(saved, 'homepage')?.pageType).toBe('homepage');
    expect(getPersonaPage(saved, 'LandingPage')?.layout).toEqual({ widgets: [] });
    const removed = updatePersonaDocumentPage(saved, 'homepage');
    expect(removed.data.pages?.map((page) => page.pageType)).toEqual([
      'LandingPage',
      'DataMarketplace',
    ]);
    const normalized = normalizePersonaDocument(saved);
    expect(normalized.data.pages?.map((page) => page.pageType)).toEqual([
      'LandingPage',
      'DataMarketplace',
      'homepage',
    ]);
  });

  it('normalizer returns the same document when pages is not an array or all entries are valid', () => {
    expect(normalizePersonaDocument(doc)).toBe(doc);
    const noArray = { ...doc, data: { pages: 'not-an-array' } } as unknown as PersonaDocument;
    expect(normalizePersonaDocument(noArray)).toBe(noArray);
    const noPages = { ...doc, data: {} };
    expect(normalizePersonaDocument(noPages)).toBe(noPages);
  });

  it('page removal drops invalid siblings and replaces every matching entry', () => {
    const dirty = {
      ...doc,
      data: {
        pages: [
          { pageType: 'LandingPage', layout: { v: 1 } },
          { pageType: 'LandingPage', layout: { v: 2 } },
          { layout: {} },
          { pageType: 'Table', layout: {} },
        ],
      },
    } as unknown as PersonaDocument;
    const removed = updatePersonaDocumentPage(dirty, 'Table');
    expect(removed.data.pages).toHaveLength(2);
    expect(removed.data.pages?.map((page) => page.pageType)).toEqual([
      'LandingPage',
      'LandingPage',
    ]);
    const replaced = updatePersonaDocumentPage(dirty, 'LandingPage', {
      pageType: 'LandingPage',
      layout: { v: 9 },
    });
    expect(replaced.data.pages).toHaveLength(3);
    expect(replaced.data.pages?.filter((page) => page.pageType === 'LandingPage')).toEqual([
      { pageType: 'LandingPage', layout: { v: 9 } },
      { pageType: 'LandingPage', layout: { v: 9 } },
    ]);
  });

  it('app-layout update returns the same array when nothing survives and preserves unrelated fields', () => {
    const empty: [] = [];
    expect(updatePersonaAppLayout(empty, { id: 'p1', name: 'Analyst' }, {})).toBe(empty);
    expect(
      updatePersonaAppLayout(empty, { id: 'p1', name: 'Analyst' }, { appMode: undefined }),
    ).toBe(empty);
    const entries = [
      {
        personaId: 'p1',
        personaName: 'Analyst',
        appMode: 'classic' as const,
        defaultLandingPage: '/marketplace',
        landingPageSettings: { headerColor: '#099250' },
      },
    ];
    const cleared = updatePersonaAppLayout(entries, { id: 'p1', name: 'Analyst' }, {});
    expect(cleared[0]).toEqual({
      personaId: 'p1',
      personaName: 'Analyst',
      landingPageSettings: { headerColor: '#099250' },
    });
    const merged = updatePersonaAppLayout(
      entries,
      { id: 'p1', name: 'Analyst' },
      { defaultLandingPage: '/search' },
    );
    expect(merged[0]).toEqual({
      personaId: 'p1',
      personaName: 'Analyst',
      defaultLandingPage: '/search',
      landingPageSettings: { headerColor: '#099250' },
    });
    expect(merged[0]).not.toHaveProperty('appMode');
  });
});

describe('customize page categories and options (C-4 §1.1/§1.2)', () => {
  it('carries all seven categories in official order with pin label keys', () => {
    expect(CUSTOMIZE_PAGE_CATEGORIES.map((category) => category.key)).toEqual([
      'navigation',
      'app-layout',
      'askCollateSidebar',
      'LandingPage',
      'DataMarketplace',
      'governance',
      'data-assets',
    ]);
    expect(CUSTOMIZE_PAGE_CATEGORIES.map((category) => category.labelKey)).toEqual([
      'persona.customizeCategoryNavigation',
      'persona.customizeCategoryAppLayout',
      'persona.customizeCategoryAiSidebar',
      'persona.customizeCategoryHomePage',
      'persona.customizeCategoryMarketplace',
      'persona.customizeCategoryGovernance',
      'persona.customizeCategoryDataAssets',
    ]);
  });

  it('carries the official icon keys, including the govern/dataAssets mismatches', () => {
    expect(CUSTOMIZE_PAGE_CATEGORIES.map((category) => category.icon)).toEqual([
      'navigation',
      'app-layout',
      'askCollateSidebar',
      'LandingPage',
      'DataMarketplace',
      'govern',
      'dataAssets',
    ]);
  });

  it('gives DataMarketplace the shared entity description template with its own label as entity', () => {
    const marketplace = CUSTOMIZE_PAGE_CATEGORIES.find(
      (category) => category.key === 'DataMarketplace',
    );
    expect(marketplace?.descriptionKey).toBe(ENTITY_CUSTOMIZE_DESCRIPTION_KEY);
    expect(marketplace?.descriptionEntityKey).toBe('persona.customizeCategoryMarketplace');
    for (const category of CUSTOMIZE_PAGE_CATEGORIES) {
      if (category.key !== 'DataMarketplace') {
        expect(category.descriptionEntityKey).toBeUndefined();
        expect(category.descriptionKey).not.toBe(ENTITY_CUSTOMIZE_DESCRIPTION_KEY);
      }
    }
  });

  it('renders six cards and excludes only askCollateSidebar, by the scope table', () => {
    expect([...CUSTOMIZE_PAGE_CARD_EXCLUDED_KEYS]).toEqual(['askCollateSidebar']);
    const cards = getCustomizePageCardCategories();
    expect(cards.map((category) => category.key)).toEqual([
      'navigation',
      'app-layout',
      'LandingPage',
      'DataMarketplace',
      'governance',
      'data-assets',
    ]);
    const partitioned = [...cards.map((category) => category.key), ...CUSTOMIZE_PAGE_CARD_EXCLUDED_KEYS];
    expect(partitioned.sort()).toEqual(
      CUSTOMIZE_PAGE_CATEGORIES.map((category) => category.key).sort(),
    );
  });

  it('returns the four governance options in enum order with startCase labels', () => {
    const options = getCustomizePageOptions('governance');
    expect(options.map((option) => option.key)).toEqual([
      'DataProduct',
      'Domain',
      'Glossary',
      'GlossaryTerm',
    ]);
    expect(options.map((option) => option.label)).toEqual([
      'Data Product',
      'Domain',
      'Glossary',
      'Glossary Term',
    ]);
    for (const option of options) {
      expect(option.descriptionKey).toBe(ENTITY_CUSTOMIZE_DESCRIPTION_KEY);
      expect(option.descriptionEntity).toBe(option.label);
      expect(option.icon).toBe(option.key);
    }
  });

  it('returns the nineteen data-assets options in PageType enum order', () => {
    const options = getCustomizePageOptions('data-assets');
    expect(options.map((option) => option.key)).toEqual([
      'APICollection',
      'APIEndpoint',
      'Chart',
      'Container',
      'Dashboard',
      'DashboardDataModel',
      'Database',
      'DatabaseSchema',
      'Directory',
      'File',
      'Metric',
      'MlModel',
      'Pipeline',
      'SearchIndex',
      'Spreadsheet',
      'StoredProcedure',
      'Table',
      'Topic',
      'Worksheet',
    ]);
    expect(options.map((option) => option.label)).toEqual([
      'API Collection',
      'API Endpoint',
      'Chart',
      'Container',
      'Dashboard',
      'Dashboard Data Model',
      'Database',
      'Database Schema',
      'Directory',
      'File',
      'Metric',
      'Ml Model',
      'Pipeline',
      'Search Index',
      'Spreadsheet',
      'Stored Procedure',
      'Table',
      'Topic',
      'Worksheet',
    ]);
  });

  it('never surfaces Tag or Classification under any parent', () => {
    for (const category of ['governance', 'data-assets', 'navigation', 'unknown']) {
      const keys = getCustomizePageOptions(category).map((option) => option.key);
      expect(keys).not.toContain('Tag');
      expect(keys).not.toContain('Classification');
    }
  });

  it('returns [] for leaf categories, unknown categories, and empty input', () => {
    expect(getCustomizePageOptions('navigation')).toEqual([]);
    expect(getCustomizePageOptions('app-layout')).toEqual([]);
    expect(getCustomizePageOptions('LandingPage')).toEqual([]);
    expect(getCustomizePageOptions('unknown-category')).toEqual([]);
    expect(getCustomizePageOptions('')).toEqual([]);
  });
});
