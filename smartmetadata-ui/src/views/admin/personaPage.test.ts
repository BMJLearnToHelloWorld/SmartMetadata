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
  DEFAULT_LANDING_PAGE,
  getPersonaPage,
  getPersonaPreferences,
  isLandingPageOption,
  normalizePersonaDocument,
  resolveLandingRedirect,
  resolvePersonaLandingPage,
  resolvePersonaViewMode,
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
});
