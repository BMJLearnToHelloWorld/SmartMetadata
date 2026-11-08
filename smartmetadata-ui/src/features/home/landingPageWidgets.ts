/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may
 * not use this file except in compliance with the License. You may obtain
 * a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { defineAsyncComponent, type Component } from 'vue';
import {
  LANDING_PAGE_WIDGET_KEYS,
  MY_DATA_WIDGET_KEYS,
  getMyDataWidgetBaseKey,
} from './landingPageLayout';

/**
 * The landing-page widget registry, mirroring the official
 * `WIDGET_KEY_PREFIX_MAP` (`CustomizeMyDataPageWidgetUtils.tsx`): one
 * entry per renderable key, each a lazily loaded Vue component
 * (`defineAsyncComponent`, the equivalent of official `lazy(() =>
 * import(...))`). Matched by prefix, so an instance key carrying a
 * `uniqueId` suffix still resolves.
 *
 * The five keys with existing product capability map to their real
 * widget components; the eight keys whose official components land in
 * stage B map to `WidgetPlaceholder`, an honestly empty cell (official
 * empty state, never fake data). An unknown key resolves to null and
 * renders nothing — never an error, never a blank placeholder cell.
 *
 * ADR:2026-11-07-my-data-layout-normalization-five-params
 */

export { MY_DATA_WIDGET_KEYS };

const registry: Array<{ key: string; component: Component }> = [
  {
    key: LANDING_PAGE_WIDGET_KEYS.PLATFORM_HEALTH,
    component: defineAsyncComponent(() => import('./widgets/WidgetPlaceholder.vue')),
  },
  {
    key: LANDING_PAGE_WIDGET_KEYS.DATA_ESTATE,
    component: defineAsyncComponent(() => import('./widgets/DataEstateWidget.vue')),
  },
  {
    key: LANDING_PAGE_WIDGET_KEYS.TOTAL_DATA_ASSETS,
    component: defineAsyncComponent(() => import('./widgets/TotalDataAssetsWidget.vue')),
  },
  {
    key: LANDING_PAGE_WIDGET_KEYS.MY_TASK,
    component: defineAsyncComponent(() => import('./widgets/WidgetPlaceholder.vue')),
  },
  {
    key: LANDING_PAGE_WIDGET_KEYS.PIPELINE_STATUS,
    component: defineAsyncComponent(() => import('./widgets/WidgetPlaceholder.vue')),
  },
  {
    key: LANDING_PAGE_WIDGET_KEYS.ACTIVITY_FEED,
    component: defineAsyncComponent(() => import('./widgets/ActivityFeedWidget.vue')),
  },
  {
    key: LANDING_PAGE_WIDGET_KEYS.YOURS_AND_FOLLOWED,
    component: defineAsyncComponent(() => import('./widgets/YoursAndFollowedWidget.vue')),
  },
  {
    key: LANDING_PAGE_WIDGET_KEYS.KNOWLEDGE_CENTER,
    component: defineAsyncComponent(() => import('./widgets/WidgetPlaceholder.vue')),
  },
  {
    key: LANDING_PAGE_WIDGET_KEYS.CURATED_ASSETS,
    component: defineAsyncComponent(() => import('./widgets/WidgetPlaceholder.vue')),
  },
  {
    key: LANDING_PAGE_WIDGET_KEYS.DATA_QUALITY,
    component: defineAsyncComponent(() => import('./widgets/WidgetPlaceholder.vue')),
  },
  {
    key: LANDING_PAGE_WIDGET_KEYS.DOMAINS,
    component: defineAsyncComponent(() => import('./widgets/WidgetPlaceholder.vue')),
  },
  {
    key: LANDING_PAGE_WIDGET_KEYS.DATA_PRODUCTS,
    component: defineAsyncComponent(() => import('./widgets/WidgetPlaceholder.vue')),
  },
  {
    key: LANDING_PAGE_WIDGET_KEYS.KPI,
    component: defineAsyncComponent(() => import('./widgets/KpiWidget.vue')),
  },
];

/** The registry's keys, in default-layout order. Must equal `MY_DATA_WIDGET_KEYS`. */
export const MY_DATA_WIDGET_REGISTRY_KEYS: readonly string[] = registry.map(
  (entry) => entry.key,
);

/**
 * Official `getMyDataWidgetFromKey`: the component for a layout key,
 * or null when no registry entry matches — the fail-safe that renders
 * nothing for an unknown key.
 */
export function resolveMyDataWidget(widgetKey: string): Component | null {
  const matched = registry.find((entry) => widgetKey.startsWith(entry.key));
  return matched?.component ?? null;
}

/** The stable registry key for a layout entry, without an instance suffix. */
export function resolveMyDataWidgetBaseKey(widgetKey: string): string {
  return getMyDataWidgetBaseKey(widgetKey, MY_DATA_WIDGET_KEYS);
}

export interface WidgetPlaceholderMeta {
  slug: string;
  titleKey: string;
}

/**
 * Per-key presentation of the eight stage-B placeholders: the test-id
 * slug and the card title. The real widgets carry their own titles;
 * only placeholders need this map. Stage B replaces each entry with
 * its real component and deletes the corresponding row here.
 */
export const MY_DATA_WIDGET_PLACEHOLDER_META: Readonly<Record<string, WidgetPlaceholderMeta>> = {
  [LANDING_PAGE_WIDGET_KEYS.PLATFORM_HEALTH]: {
    slug: 'platform-health',
    titleKey: 'home.platformHealth',
  },
  [LANDING_PAGE_WIDGET_KEYS.MY_TASK]: { slug: 'my-task', titleKey: 'home.widgets.myTasks' },
  [LANDING_PAGE_WIDGET_KEYS.PIPELINE_STATUS]: {
    slug: 'pipeline-status',
    titleKey: 'home.pipelineStatus',
  },
  [LANDING_PAGE_WIDGET_KEYS.KNOWLEDGE_CENTER]: {
    slug: 'knowledge-center',
    titleKey: 'home.contextCenter',
  },
  [LANDING_PAGE_WIDGET_KEYS.CURATED_ASSETS]: {
    slug: 'curated-assets',
    titleKey: 'home.curatedAssets',
  },
  [LANDING_PAGE_WIDGET_KEYS.DATA_QUALITY]: {
    slug: 'data-quality',
    titleKey: 'home.dataQuality',
  },
  [LANDING_PAGE_WIDGET_KEYS.DOMAINS]: { slug: 'domains', titleKey: 'home.domains' },
  [LANDING_PAGE_WIDGET_KEYS.DATA_PRODUCTS]: {
    slug: 'data-products',
    titleKey: 'home.dataProducts',
  },
};

/** The test-id slug for a widget key (`home-widget-<slug>`). */
export function myDataWidgetSlug(baseKey: string): string {
  return (
    MY_DATA_WIDGET_PLACEHOLDER_META[baseKey]?.slug ??
    baseKey
      .replace(/^KnowledgePanel\./, '')
      .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
      .toLowerCase()
  );
}
