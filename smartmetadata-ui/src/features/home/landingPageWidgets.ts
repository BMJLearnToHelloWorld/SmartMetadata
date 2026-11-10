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
 * Every key maps to its real widget component (stage B built the
 * eight that were placeholders in stage A). An unknown key resolves
 * to null and renders nothing — never an error, never a blank
 * placeholder cell.
 *
 * ADR:2026-11-07-my-data-layout-normalization-five-params
 */

export { MY_DATA_WIDGET_KEYS };

/**
 * The picker list for the customize modal: one entry per registry
 * key with its display name (the title the widget itself renders).
 * Pin reads this list from the server's KnowledgePanel seed docs and
 * filters it through the registry allowlist; the product's registry
 * IS the allowlist, so the list is built from it directly — same 13
 * entries, no network round-trip (R-W3G11D-2).
 */
export interface MyDataWidgetOption {
  key: string;
  label: string;
}

export const MY_DATA_WIDGET_OPTIONS: readonly MyDataWidgetOption[] = [
  { key: LANDING_PAGE_WIDGET_KEYS.PLATFORM_HEALTH, label: 'Platform Health' },
  { key: LANDING_PAGE_WIDGET_KEYS.DATA_ESTATE, label: 'Your data estate' },
  { key: LANDING_PAGE_WIDGET_KEYS.TOTAL_DATA_ASSETS, label: 'Total data assets' },
  { key: LANDING_PAGE_WIDGET_KEYS.MY_TASK, label: 'My tasks' },
  { key: LANDING_PAGE_WIDGET_KEYS.PIPELINE_STATUS, label: 'Pipeline status' },
  { key: LANDING_PAGE_WIDGET_KEYS.ACTIVITY_FEED, label: 'Activity Feed' },
  { key: LANDING_PAGE_WIDGET_KEYS.YOURS_AND_FOLLOWED, label: 'Yours and Followed' },
  { key: LANDING_PAGE_WIDGET_KEYS.KNOWLEDGE_CENTER, label: 'Context Center' },
  { key: LANDING_PAGE_WIDGET_KEYS.CURATED_ASSETS, label: 'Curated Assets' },
  { key: LANDING_PAGE_WIDGET_KEYS.DATA_QUALITY, label: 'Data Quality' },
  { key: LANDING_PAGE_WIDGET_KEYS.DOMAINS, label: 'Domains' },
  { key: LANDING_PAGE_WIDGET_KEYS.DATA_PRODUCTS, label: 'Data Products' },
  { key: LANDING_PAGE_WIDGET_KEYS.KPI, label: 'KPI' },
];

const registry: Array<{ key: string; component: Component }> = [
  {
    key: LANDING_PAGE_WIDGET_KEYS.PLATFORM_HEALTH,
    component: defineAsyncComponent(() => import('./widgets/PlatformHealthWidget.vue')),
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
    component: defineAsyncComponent(() => import('./widgets/MyTasksWidget.vue')),
  },
  {
    key: LANDING_PAGE_WIDGET_KEYS.PIPELINE_STATUS,
    component: defineAsyncComponent(() => import('./widgets/PipelineStatusWidget.vue')),
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
    component: defineAsyncComponent(() => import('./widgets/KnowledgeCenterWidget.vue')),
  },
  {
    key: LANDING_PAGE_WIDGET_KEYS.CURATED_ASSETS,
    component: defineAsyncComponent(() => import('./widgets/CuratedAssetsWidget.vue')),
  },
  {
    key: LANDING_PAGE_WIDGET_KEYS.DATA_QUALITY,
    component: defineAsyncComponent(() => import('./widgets/DataQualityWidget.vue')),
  },
  {
    key: LANDING_PAGE_WIDGET_KEYS.DOMAINS,
    component: defineAsyncComponent(() => import('./widgets/DomainsOverviewWidget.vue')),
  },
  {
    key: LANDING_PAGE_WIDGET_KEYS.DATA_PRODUCTS,
    component: defineAsyncComponent(() => import('./widgets/DataProductsOverviewWidget.vue')),
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

/** The test-id slug for a widget key (`home-widget-<slug>`). */
export function myDataWidgetSlug(baseKey: string): string {
  return baseKey
    .replace(/^KnowledgePanel\./, '')
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .toLowerCase();
}
