/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may
 * not use this file except in compliance with the License. You may obtain
 * a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */

/**
 * Raw DocStore payload fixtures for the C-4 §4.3 round-trip matrix.
 * Each builder returns a fresh deep copy, so tests may mutate the
 * payload (or a fake server holding it) without leaking state.
 *
 * These are synthetic fixtures for morphologies the 11:14:58 live
 * snapshot did NOT cover (object-shaped layouts, Tag/Classification
 * entries, unknown keys) — C-4 §4.5 step 4 requires them precisely
 * because the snapshot shows none of them. They are not reproductions
 * of the live document: the snapshot summary states 1 page, 1 tab, 2
 * widgets and an array layout, but does not state the pageType or the
 * stored keys, and the full export was not available to this flow.
 * The live document's classification (step 2) remains an open item
 * for the full export, recorded in the implementation notes.
 */

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/** A legacy document carrying every retained morphology at once. */
export function legacyDocumentPayload(): Record<string, unknown> {
  return clone({
    id: 'doc-legacy',
    name: 'Analyst-Analyst',
    fullyQualifiedName: 'persona.Analyst',
    entityType: 'Page',
    data: {
      pages: [
        {
          pageType: 'Tag',
          entityType: 'tag',
          layout: [{ i: 'w-tag', x: 0, y: 0, w: 8, h: 1 }],
          knowledgePanels: [],
          tabs: [{ id: 'overview', name: 'Overview', layout: [] }],
        },
        {
          pageType: 'Classification',
          entityType: 'classification',
          layout: [{ i: 'w-cls', x: 0, y: 0, w: 8, h: 1 }],
          knowledgePanels: [],
        },
        {
          pageType: 'Table',
          entityType: 'table',
          layout: [{ i: 'w-table', x: 0, y: 0, w: 8, h: 1 }],
          knowledgePanels: [
            {
              id: 'kp1',
              type: 'knowledgePanel',
              name: 'Panel',
              fullyQualifiedName: 'Panel',
              description: 'kept',
              deleted: false,
              inherited: true,
              href: '/api/v1/docStore/kp1',
            },
          ],
          persona: { id: 'p1', type: 'persona', name: 'Analyst' },
          domains: [{ id: 'd1', type: 'domain', name: 'Marketing' }],
          futurePageField: 'kept',
        },
      ],
      personaPreferences: [{ personaId: 'p1', personaName: 'Analyst', futurePrefField: 'kept' }],
      navigation: [{ key: 'home' }],
      askCollateSidebar: [{ key: 'ai-home' }],
      futureDataKey: { kept: true },
    },
  });
}

/** A document whose LandingPage layout is an object, empty or not. */
export function objectLayoutPayload(layout: Record<string, unknown>): Record<string, unknown> {
  return clone({
    id: 'doc-object-layout',
    name: 'Analyst-Analyst',
    fullyQualifiedName: 'persona.Analyst',
    entityType: 'Page',
    data: {
      pages: [
        { pageType: 'LandingPage', layout },
        { pageType: 'Table', layout: [{ i: 'w-table', x: 0, y: 0, w: 8, h: 1 }] },
      ],
    },
  });
}

/** A document with page entries that carry no string pageType. */
export function entriesWithoutPageTypePayload(): Record<string, unknown> {
  return clone({
    id: 'doc-no-pagetype',
    name: 'Analyst-Analyst',
    fullyQualifiedName: 'persona.Analyst',
    entityType: 'Page',
    data: {
      pages: [
        { pageType: 'LandingPage', layout: [] },
        { layout: [] },
        { pageType: 42, layout: [] },
        null,
      ],
    },
  });
}

/**
 * The normal array-layout shape: 1 page, 1 tab, 2 widgets. The counts
 * mirror the 11:14:58 snapshot summary; the pageType is a placeholder
 * (the summary does not state it), not a claim about the live
 * document.
 */
export function singlePageArrayLayoutPayload(): Record<string, unknown> {
  return clone({
    id: 'doc-single',
    name: 'Analyst-Analyst',
    fullyQualifiedName: 'persona.Analyst',
    entityType: 'Page',
    data: {
      pages: [
        {
          pageType: 'LandingPage',
          layout: [
            { i: 'w1', x: 0, y: 0, w: 1, h: 3 },
            { i: 'w2', x: 1, y: 0, w: 1, h: 3 },
          ],
          tabs: [
            {
              id: 'overview',
              name: 'Overview',
              layout: [
                { i: 'w1', x: 0, y: 0, w: 1, h: 3 },
                { i: 'w2', x: 1, y: 0, w: 1, h: 3 },
              ],
            },
          ],
        },
      ],
    },
  });
}
