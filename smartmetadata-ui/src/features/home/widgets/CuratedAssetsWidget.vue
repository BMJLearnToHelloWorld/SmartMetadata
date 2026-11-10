<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, defineAsyncComponent, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import HomeWidgetCard from '../HomeWidgetCard.vue';
import { assetLocation } from '@/catalog/entityRoutes';
import {
  getCuratedExploreURL,
} from '@/catalog/curatedAssets';
import { DEFAULT_CURATED_RULE, describeCuratedClause, describeCuratedRule } from '@/catalog/curatedRule';
import { useCuratedAssets, type CuratedAssetsSource } from './useCuratedAssets';
import type { CuratedAssetsConfig } from './CuratedAssetsModal.vue';
import { serviceTypeIcon } from '@/features/home/serviceTypeIcon';
import type { LandingPageLayoutItem } from '@/features/home/landingPageLayout';

const CuratedAssetsModal = defineAsyncComponent(
  () => import('./CuratedAssetsModal.vue'),
);

const props = defineProps<{
  widgetKey: string;
  currentLayout?: LandingPageLayoutItem[];
  isEditView?: boolean;
  handleLayoutUpdate?: (layout: LandingPageLayoutItem[]) => void;
  handleSaveLayout?: (layout: LandingPageLayoutItem[]) => Promise<void>;
  /**
   * Stage D: the home view and the editor pass the card chrome through
   * these props, and the widget forwards them to its HomeWidgetCard
   * explicitly. They cannot fall through: this widget renders a
   * fragment root (the card plus the config modal beside it), so
   * fallthrough attrs are dropped with a Vue warning instead.
   */
  editView?: boolean;
  collapsible?: boolean;
  collapsed?: boolean;
}>();

const emit = defineEmits<{
  (event: 'remove'): void;
  (event: 'toggle-collapse'): void;
}>();

const { t, locale } = useI18n();
const router = useRouter();

// Read off the layout, not a `widgetConfig` prop: `getWidgetFromKey` — the
// single entry point for both the live page and the persona editor — passes
// `currentLayout` and `widgetKey` but not the entry itself, so a widget that
// trusts that prop sees an undefined config forever and can never show a
// saved rule. This is the lookup the previous Curated Assets widget did.
const config = computed(() => {
  const entry = props.currentLayout?.find((widget) => widget.i === props.widgetKey);
  const raw = entry?.config;
  return raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : undefined;
});

// An admin-saved advanced filter wins over the built-in chip rule — see
// CuratedAssetsSource. Memoised because it is part of the query key.
const source = computed<CuratedAssetsSource>(() => ({
  queryFilter:
    typeof config.value?.queryFilter === 'string' ? config.value.queryFilter : undefined,
  resources: Array.isArray(config.value?.resources)
    ? (config.value.resources as unknown[]).filter(
        (resource): resource is string => typeof resource === 'string',
      )
    : undefined,
  rule: DEFAULT_CURATED_RULE,
}));
const hasSavedFilter = computed(() => Boolean(source.value.queryFilter));
const savedTitle = computed(() =>
  typeof config.value?.title === 'string' ? config.value.title : undefined,
);

const { assets, totalCount, isLoading, isError, refetch } = useCuratedAssets(source);

const isModalOpen = ref(false);

// Only the persona editor can define the rule, so the prompt to do so belongs
// in edit view alone — a reader seeing "Create" could not act on it.
// The editor signals edit mode with `editView`; the older `isEditView`
// prop (never set by any caller) is kept as a fallback. (Both are
// boolean props, so an absent one reads `false`, not `undefined` —
// `??` would never fall through, hence `||`.)
const inEditView = computed(() => props.editView || props.isEditView || false);

const isUnconfigured = computed(() => inEditView.value && !hasSavedFilter.value);

// Chips describe the built-in rule only; a saved advanced filter is arbitrary
// JSON that cannot be rendered back as `<field> is <value>` clauses.
const ruleClauses = computed(() => (hasSavedFilter.value ? [] : DEFAULT_CURATED_RULE));
const remaining = computed(() => Math.max(0, totalCount.value - assets.value.length));
const matchCount = computed(() =>
  t('home.countAssetsMatchRule', { count: totalCount.value }),
);
// The chip rule reads as the summary, with the match count beside the title;
// a saved filter has no phrase to show, so its count is the summary instead
// — never both, which said the count twice.
const headlineSummary = computed(() =>
  ruleClauses.value.length > 0
    ? describeCuratedRule(ruleClauses.value, (key, params) => t(key, params ?? {}), locale.value)
    : matchCount.value,
);
const headlineStatus = computed(() =>
  ruleClauses.value.length > 0
    ? { label: matchCount.value, tone: 'neutral' as const }
    : undefined,
);

const emptyState = computed(() =>
  totalCount.value === 0 && !isUnconfigured.value
    ? {
        title: t('home.noAssetsMatchRuleYet'),
        description: t('home.curatedAssetsEmptyDescription'),
        summary: ruleClauses.value.length > 0 ? headlineSummary.value : undefined,
      }
    : undefined,
);

const exploreTarget = computed(() => getCuratedExploreURL(source.value));

function openExplore(): void {
  void router.push(exploreTarget.value);
}

// Writing the config back onto this widget's layout entry is the only way it
// is persisted — the rule lives on the persona's page layout, not on an
// entity of its own.
async function handleSave(next: CuratedAssetsConfig): Promise<void> {
  // Carry the existing config forward, so a stale `sortBy` (a dead config —
  // see ADR) is preserved rather than silently dropped on save.
  const merged = { ...(config.value ?? {}), ...next };
  const layout = props.currentLayout ?? [];
  const isAlreadyInLayout = layout.some((widget) => widget.i === props.widgetKey);
  const updatedLayout = isAlreadyInLayout
    ? layout.map((widget) =>
        widget.i === props.widgetKey ? { ...widget, config: merged } : widget,
      )
    : [
        ...layout,
        { i: props.widgetKey, x: 0, y: 0, w: 1, h: 3, static: false, config: merged },
      ];
  props.handleLayoutUpdate?.(updatedLayout);
  await props.handleSaveLayout?.(updatedLayout);
  isModalOpen.value = false;
}
</script>

<template>
  <HomeWidgetCard
    :title="savedTitle ?? t('home.curatedAssets')"
    :test-id="`home-widget-${props.widgetKey}`"
    :is-loading="isLoading"
    :is-error="isError"
    :status="headlineStatus"
    :summary="headlineSummary"
    :meta="remaining > 0 ? t('home.countMoreAssetsMatchRule', { count: remaining }) : undefined"
    :empty-state="emptyState"
    :edit-view="props.editView"
    :collapsible="props.collapsible"
    :collapsed="props.collapsed"
    @retry="refetch"
    @remove="emit('remove')"
    @toggle-collapse="emit('toggle-collapse')"
  >
    <template #extra>
      <button type="button" class="home-widget-card__link" @click="openExplore">
        {{ t('home.viewAllMatches') }}
      </button>
    </template>
    <div v-if="isUnconfigured" class="curated-assets__unconfigured" data-testid="widget-empty-state">
      <p>{{ t('home.noCuratedAssets') }}</p>
      <button type="button" class="curated-assets__create" @click="isModalOpen = true">
        {{ t('shared.create') }}
      </button>
    </div>
    <div v-if="ruleClauses.length > 0" class="curated-assets__rule" data-testid="curated-rule-summary">
      <span class="curated-assets__rule-label">{{ t('home.rule') }}</span>
      <span
        v-for="(clause, index) in ruleClauses"
        :key="clause.termKey"
        class="curated-assets__rule-chips"
      >
        <span v-if="index > 0" class="curated-assets__rule-and">{{ t('home.andLowercase') }}</span>
        <span class="curated-assets__chip">{{
          describeCuratedClause(clause, (key, params) => t(key, params ?? {}))
        }}</span>
      </span>
      <span class="curated-assets__rule-note">🔒 {{ t('home.setInPersonaSettings') }}</span>
    </div>
    <ul class="curated-assets__rows" data-testid="curated-assets-rows">
      <li
        v-for="asset in assets"
        :key="asset.id"
        :data-testid="`curated-asset-${asset.name}`"
      >
        <router-link
          class="curated-assets__row"
          :to="assetLocation(asset.entityType, asset.fullyQualifiedName)"
        >
          <component
            :is="asset.serviceType ? serviceTypeIcon(asset.serviceType) : undefined"
            v-if="asset.serviceType"
            class="curated-assets__icon"
          />
          <span class="curated-assets__name-wrap">
            <span class="curated-assets__name">{{ asset.name }}</span>
            <span v-if="asset.tier" class="curated-assets__tier">{{ asset.tier }}</span>
          </span>
          <!-- Only once the test lookup has answered: an unknown health gets
            no dot rather than a green nobody confirmed. -->
          <span
            v-if="asset.isHealthy !== undefined"
            :aria-label="asset.isHealthy ? t('home.healthy') : t('home.failing')"
            :class="['curated-assets__dot', asset.isHealthy ? 'curated-assets__dot--healthy' : 'curated-assets__dot--failing']"
            :data-testid="`curated-asset-health-${asset.id}`"
            role="img"
          />
        </router-link>
      </li>
    </ul>
    <div v-if="inEditView && hasSavedFilter" class="curated-assets__edit">
      <button type="button" data-testid="edit-curated-assets" @click="isModalOpen = true">
        {{ t('shared.edit') }}
      </button>
    </div>
  </HomeWidgetCard>
  <!-- Outside the card: the default slot is not rendered in the empty
    state (HomeWidgetCard renders `<slot v-else />`), so a modal mounted
    inside it would unmount when the card goes empty — including while it
    is open. -->
  <CuratedAssetsModal
    v-if="inEditView"
    :curated-assets-config="config"
    :is-open="isModalOpen"
    @cancel="isModalOpen = false"
    @save="handleSave"
  />
</template>

<style scoped>
.curated-assets__unconfigured {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 12px;
}

.curated-assets__unconfigured p {
  margin: 0;
  font-size: 12px;
  color: rgba(0, 0, 0, 0.45);
}

.curated-assets__create {
  border: 0;
  border-radius: 6px;
  background: var(--sm-color-primary);
  color: var(--sm-text-on-primary);
  cursor: pointer;
  padding: 6px 12px;
  font-size: 13px;
}

.curated-assets__rule {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  border-radius: 12px;
  background: var(--sm-bg-elevated);
  padding: 14px;
  margin-bottom: 16px;
}

.curated-assets__rule-label {
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  color: rgba(0, 0, 0, 0.45);
}

.curated-assets__rule-chips {
  display: flex;
  align-items: center;
  gap: 8px;
}

.curated-assets__rule-and {
  font-size: 12px;
  color: rgba(0, 0, 0, 0.45);
}

.curated-assets__chip {
  border-radius: 6px;
  background: var(--sm-bg-container);
  border: 1px solid var(--sm-border-color);
  padding: 2px 8px;
  font-size: 12px;
}

.curated-assets__rule-note {
  margin-left: auto;
  font-size: 12px;
  color: rgba(0, 0, 0, 0.45);
}

.curated-assets__rows {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  grid-template-columns: 1fr;
  gap: 8px;
}

@media (min-width: 720px) {
  .curated-assets__rows {
    grid-template-columns: 1fr 1fr;
  }
}

.curated-assets__row {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  border-radius: 8px;
  background: var(--sm-bg-elevated);
  padding: 10px 12px;
  text-decoration: none;
  color: inherit;
}

.curated-assets__icon {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
}

.curated-assets__name-wrap {
  display: flex;
  flex-direction: column;
  min-width: 0;
  flex: 1;
}

.curated-assets__name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
}

.curated-assets__tier {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
  color: rgba(0, 0, 0, 0.45);
}

.curated-assets__dot {
  width: 8px;
  height: 8px;
  flex-shrink: 0;
  border-radius: 50%;
}

.curated-assets__dot--healthy {
  background: var(--sm-color-success);
}

.curated-assets__dot--failing {
  background: var(--sm-color-error);
}

.curated-assets__edit {
  display: flex;
  justify-content: flex-start;
  margin-top: 16px;
}

.curated-assets__edit button {
  border: 1px solid var(--sm-border-color);
  border-radius: 6px;
  background: var(--sm-bg-container);
  cursor: pointer;
  padding: 4px 12px;
  font-size: 12px;
}
</style>
