/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { assetLocation, isDetailWired } from './entityRoutes';
import type { SearchHit } from '@/types/api';

/**
 * Explore result-card derivations (B2-E6, D18–D24), ported from pin
 * `a3012259ca` `ExploreSearchCard.tsx` + `SearchedData.tsx` +
 * `EntitySearchUtils.tsx` + `EntityBreadcrumbPureUtils.ts` /
 * `EntityDataBreadcrumbUtils.ts`.
 *
 * Everything here is pure: it turns one mapped `SearchHit` into the
 * card's breadcrumbs, Matches rows and highlight needles. The card
 * itself stays in `views/SearchView.vue`.
 */

export interface ExploreCardBreadcrumb {
  label: string;
  routeName?: string;
  routeParams?: Record<string, string>;
}

/**
 * Entity types whose detail page the pin card prefetches on hover/focus
 * (`ExploreSearchCard.tsx` `handlePrefetch`): table, dashboard, pipeline,
 * topic. All other types fall through as no-ops there.
 */
export const CARD_PREFETCH_ENTITY_TYPES: readonly string[] = ['table', 'dashboard', 'pipeline', 'topic'];

export function shouldPrefetchCard(entityType: string): boolean {
  return CARD_PREFETCH_ENTITY_TYPES.includes(entityType);
}

function assetCrumb(label: string | undefined, entityType: string, fqn?: string): ExploreCardBreadcrumb | null {
  if (!label) {
    return null;
  }
  // A crumb without an FQN is still shown (the label is real data from
  // the ES source) but stays unlinked — never invent a target.
  if (!fqn) {
    return { label };
  }
  const to = assetLocation(entityType, fqn);
  return { label, routeName: to.name, routeParams: to.params };
}

function serviceCrumb(hit: SearchHit): ExploreCardBreadcrumb | null {
  if (!hit.serviceName) {
    return null;
  }
  // Pin links the service crumb to the service detail page
  // (`getServiceDetailsPath`). The product has no FQN-addressed service
  // detail route (service pages are id-addressed), so the service crumb
  // is text-only here rather than a link to the wrong page.
  return { label: hit.serviceName };
}

/**
 * Clickable entity breadcrumbs (D18), replacing the raw FQN row. Pin
 * `getEntityBreadcrumbs(source, entityType, includeCurrent=false)`:
 * the trail never includes the hit itself. Table / stored procedure →
 * service → database → schema; tableColumn adds the parent table as
 * its last crumb; databaseSchema → service → database; database and
 * the service-only types (topic, dashboard, pipeline, …) → service
 * only. Glossary term / tag / data product have no routable parent in
 * the product (governance detail routes are id-addressed and search
 * hits carry no parent FQN), so they render no breadcrumb row rather
 * than a dead link; the API-endpoint apiCollection crumb is likewise
 * omitted because `SearchHit` carries no apiCollection ref.
 */
export function cardBreadcrumbs(hit: SearchHit): ExploreCardBreadcrumb[] {
  const crumbs: (ExploreCardBreadcrumb | null)[] = [];
  switch (hit.entityType) {
    case 'table':
    case 'storedProcedure':
      crumbs.push(
        serviceCrumb(hit),
        assetCrumb(hit.databaseName, 'database', hit.databaseFqn),
        assetCrumb(hit.schemaName, 'databaseSchema', hit.schemaFqn),
      );
      break;
    case 'tableColumn':
      crumbs.push(
        serviceCrumb(hit),
        assetCrumb(hit.databaseName, 'database', hit.databaseFqn),
        assetCrumb(hit.schemaName, 'databaseSchema', hit.schemaFqn),
        assetCrumb(hit.tableName ?? hit.tableFqn, 'table', hit.tableFqn),
      );
      break;
    case 'database':
      crumbs.push(serviceCrumb(hit));
      break;
    case 'databaseSchema':
      crumbs.push(serviceCrumb(hit), assetCrumb(hit.databaseName, 'database', hit.databaseFqn));
      break;
    case 'container':
    case 'directory':
    case 'file':
    case 'spreadsheet':
    case 'worksheet': {
      // Pin chains the full parent hierarchy (`getBreadcrumbForEntityWithParent`);
      // the hit carries only its direct parent, and only a parent whose type
      // has a wired detail page gets a link.
      const parent = hit.parent;
      const parentCrumb =
        parent?.fullyQualifiedName && parent.type && isDetailWired(parent.type)
          ? assetCrumb(parent.displayName ?? parent.name, parent.type, parent.fullyQualifiedName)
          : null;
      crumbs.push(serviceCrumb(hit), parentCrumb);
      break;
    }
    case 'topic':
    case 'dashboard':
    case 'pipeline':
    case 'mlmodel':
    case 'searchIndex':
    case 'chart':
    case 'metric':
    case 'dashboardDataModel':
    case 'apiCollection':
    case 'apiEndpoint':
      crumbs.push(serviceCrumb(hit));
      break;
    default:
      break;
  }
  return crumbs.filter((crumb): crumb is ExploreCardBreadcrumb => crumb !== null);
}

export interface CardMatch {
  key: string;
  label: string;
  value: number;
}

// Pin `SearchedData.tsx` ASSETS_NAME: name-field hits are already the
// card title, so they are not Matches rows.
const MATCHES_NAME_FIELDS = new Set(['table_name', 'topic_name', 'dashboard_name', 'pipeline_name']);

function startCaseField(key: string): string {
  return key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Matches rows (D20). Pin `SearchedData.tsx`: every `highlight` entry
 * except `.ngram` fields and the name fields above, with the value
 * being the fragment count (`value?.length || 1`).
 */
export function cardMatches(highlight?: Record<string, string[]>): CardMatch[] {
  if (!highlight) {
    return [];
  }
  return Object.entries(highlight)
    .filter(([key]) => !key.includes('.ngram'))
    .filter(([key]) => !MATCHES_NAME_FIELDS.has(key))
    .map(([key, value]) => ({ key, label: startCaseField(key), value: value?.length || 1 }));
}

function stripHighlightTags(fragment: string): string {
  return fragment.replace(/<[^>]*>/g, '');
}

// The backend Elastic highlight profile wraps matches in
// `<span class="text-highlighter">…</span>` (pin
// `EntitySearchUtils.tsx`); tolerate `<em>` too, in case a profile
// emits the ES default.
const HIGHLIGHT_SPAN_RE = /<(?:span[^>]*|em)>(.*?)<\/(?:span|em)>/gi;

export function highlightNeedles(
  highlight: Record<string, string[]> | undefined,
  fields: string[],
): string[] {
  const needles: string[] = [];
  for (const field of fields) {
    for (const fragment of highlight?.[field] ?? []) {
      HIGHLIGHT_SPAN_RE.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = HIGHLIGHT_SPAN_RE.exec(fragment)) !== null) {
        const needle = stripHighlightTags(match[1]).trim();
        if (needle && !needles.includes(needle)) {
          needles.push(needle);
        }
      }
    }
  }
  return needles;
}

/**
 * Display name with ES highlighting applied (D19). Pin
 * `highlightEntityNameAndDescription`: the name becomes the
 * `displayName` / `name` highlight fragments (tags stripped, joined
 * with a space) when present, else the entity name. The matched terms
 * themselves come from `cardNameNeedles`.
 */
export function cardDisplayName(hit: SearchHit): string {
  const fromFragments = (fragments?: string[]): string | undefined => {
    if (!fragments?.length) {
      return undefined;
    }
    const plain = fragments.map((fragment) => stripHighlightTags(fragment).trim()).join(' ').trim();
    return plain || undefined;
  };
  return (
    fromFragments(hit.highlight?.displayName) ??
    fromFragments(hit.highlight?.name) ??
    hit.displayName ??
    hit.name
  );
}

export function cardNameNeedles(hit: SearchHit): string[] {
  return highlightNeedles(hit.highlight, ['displayName', 'name']);
}

export function cardDescriptionNeedles(hit: SearchHit): string[] {
  return highlightNeedles(hit.highlight, ['description']);
}
