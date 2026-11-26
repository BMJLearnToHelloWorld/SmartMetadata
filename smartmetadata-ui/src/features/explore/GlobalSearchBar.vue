<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute, useRouter } from 'vue-router';
import { Input, Select } from 'ant-design-vue';
import { escapeESReservedCharacters, searchAssets } from '@/api/search';
import { openSearchHit } from '@/catalog/entityRoutes';
import { EXPLORE_TABS, exploreTabFromRoute } from '@/catalog/exploreTabs';
import { DEFAULT_SORT, searchRouteFromLocation, searchRouteQuery } from '@/catalog/searchQuery';
import SmIcon from '@/components/shared/SmIcon.vue';
import { useAuthStore } from '@/stores/auth';
import { listRecentSearches, recordRecentSearch } from '@/stores/recentSearches';
import { useSearchStore } from '@/stores/search';
import type { SearchHit } from '@/types/api';

/**
 * Global search bar (Explore D13), mirroring pin
 * `components/GlobalSearchBar/GlobalSearchBar.tsx` + `components/AppBar/Suggestions.tsx`:
 *
 * - 25-item entity scope selector (All + the 24 Explore indexes, pin
 *   `SearchClassBase.getGlobalSearchOptions()`), submitting with
 *   `tab=<scope>`; pin's `searchHandler` also forces sort `_score`,
 *   but the product deliberately preserves the Explore sort the user
 *   already chose (see submitSearch).
 * - 400ms debounced suggestions popover (pin's `debounce(..., 400)`),
 *   fetching 15 hits per scope via `searchAssets` and grouping them by
 *   entity type; clicking a suggestion opens the entity, or — for a type
 *   with no detail page yet — runs the search for its name.
 * - Recent searches: pin records every submitted term
 *   (`addToRecentSearched`, cap 5); the popover shows them when the
 *   input is empty and NLP is off.
 * - NLP toggle: rendered only when the server reports NLP enabled (pin's
 *   `isNLPEnabled` gate); it flips `isNLPActive` in the search store,
 *   which the Explore page reads to route the search through the NLQ
 *   path (D11). With NLP active the bar shows pin's canned AI example
 *   queries and skips the suggestions fetch, exactly as pin's
 *   `Suggestions` does.
 * - Clear: empties the input; on the Explore page it also resets the
 *   Explore search (pin's `handleClear`).
 *
 * Debounce follows the `FQNListSelect` pattern: a `setTimeout` plus a
 * request id, so a slow earlier fetch can never overwrite newer results.
 * The popover is a plain positioned panel (not a portal), so it stays
 * inside the header's sticky stacking context.
 */
const SUGGESTION_PAGE_SIZE = 15;
const SUGGESTION_DEBOUNCE_MS = 400;

/** Pin's canned AI example queries (`Suggestions.renderAIQuerySuggestions`). */
const AI_EXAMPLE_QUERIES = [
  'Tables owned by marketing',
  'Tables with Tier1 classification',
  'Find dashboards tagged with PII.Sensitive',
  'Topics with schema fields containing address',
  'Tables tagged with tier1 or tier2',
];

const route = useRoute();
const router = useRouter();
const { t } = useI18n();
const auth = useAuthStore();
const searchStore = useSearchStore();

const containerRef = ref<HTMLElement | null>(null);
const searchValue = ref(typeof route.query.q === 'string' ? route.query.q : '');
const scope = ref('');
const isOpen = ref(false);
const suggesting = ref(false);
const suggestions = ref<SearchHit[]>([]);
const recentTerms = ref<string[]>([]);

let searchTimer: ReturnType<typeof setTimeout> | undefined;
let requestId = 0;

function scopeFromQuery(): string {
  // exploreTabFromRoute accepts the `/explore/:tab` param and the legacy
  // `?tab=` query (index or slug), so the scope stays in sync with the
  // Explore tab either way.
  return exploreTabFromRoute(route)?.index ?? '';
}

scope.value = scopeFromQuery();

const scopeOptions = computed(() => [
  { value: '', label: t('explore.all') },
  ...EXPLORE_TABS.map((tab) => ({ value: tab.index, label: t(`explore.entity.${tab.labelKey}`) })),
]);

const groupedSuggestions = computed(() => {
  const groups: { index: string; label: string; hits: SearchHit[] }[] = [];
  for (const tab of EXPLORE_TABS) {
    const hits = suggestions.value.filter((hit) => hit.entityType === tab.entityType);
    if (hits.length) {
      groups.push({ index: tab.index, label: t(`explore.entity.${tab.labelKey}`), hits });
    }
  }
  return groups;
});

const trimmedValue = computed(() => searchValue.value.trim());

const showAiQueries = computed(() => !trimmedValue.value && searchStore.isNLPActive);
const showRecents = computed(
  () => !trimmedValue.value && !searchStore.isNLPActive && recentTerms.value.length > 0,
);

// The popover also opens on an empty input when there are recents to show:
// pin's `shouldShowSearchContent` (value || NLP active) governs suggestions,
// but the recent-searches surface this lane adds lives on the empty input.
const popoverVisible = computed(
  () =>
    isOpen.value &&
    (Boolean(searchValue.value) || searchStore.isNLPActive || showRecents.value),
);

function refreshRecents(): void {
  recentTerms.value = listRecentSearches(auth.user?.name);
}

function fetchSuggestions(text: string): void {
  // Pin's Suggestions skips the fetch entirely while NLP is active.
  if (searchStore.isNLPActive) {
    suggesting.value = false;
    suggestions.value = [];
    return;
  }
  const id = ++requestId;
  suggesting.value = true;
  void searchAssets(escapeESReservedCharacters(text), 0, SUGGESTION_PAGE_SIZE, {
    index: scope.value || 'dataAsset',
    includeAggregations: false,
    // Pin Suggestions.tsx:361-391 passes includeDeleted: false
    // explicitly; searchAssets defaults deleted to false too, but the
    // call site states it so a future default change cannot re-open
    // the soft-deleted leak in the suggestion popover.
    deleted: false,
  })
    .then((page) => {
      if (id === requestId) {
        suggestions.value = page.hits;
      }
    })
    .catch(() => {
      if (id === requestId) {
        suggestions.value = [];
      }
    })
    .finally(() => {
      if (id === requestId) {
        suggesting.value = false;
      }
    });
}

function scheduleSuggestions(text: string): void {
  clearTimeout(searchTimer);
  if (!text.trim()) {
    suggestions.value = [];
    suggesting.value = false;
    return;
  }
  searchTimer = setTimeout(() => {
    fetchSuggestions(text);
  }, SUGGESTION_DEBOUNCE_MS);
}

function onInput(value: string): void {
  searchValue.value = value;
  isOpen.value = true;
  scheduleSuggestions(value);
}

function onScopeChange(value: unknown): void {
  scope.value = typeof value === 'string' ? value : '';
  if (trimmedValue.value) {
    clearTimeout(searchTimer);
    fetchSuggestions(searchValue.value);
  }
}

function onNlpToggle(): void {
  searchStore.setNLPActive(!searchStore.isNLPActive);
  if (searchStore.isNLPActive) {
    suggestions.value = [];
  } else if (trimmedValue.value) {
    fetchSuggestions(searchValue.value);
  }
}

function submitSearch(value: string): void {
  const trimmed = value.trim();
  clearTimeout(searchTimer);
  isOpen.value = false;
  if (trimmed) {
    recordRecentSearch(auth.user?.name, trimmed);
    refreshRecents();
  }
  const tab = scope.value || undefined;
  if (route.name === 'search') {
    // The tab comes from the scope selector, but the sort is deliberately
    // NOT forced to _score here: the shell's sort-preservation lock
    // (AppShell.test.ts, "keeps Explore sort and estate query params")
    // keeps the Explore sort the user already chose, so the location
    // sort survives the submit instead of being reset.
    void router.push({
      name: 'search',
      ...searchRouteFromLocation(trimmed, route.query, 0, { tab }),
    });
    return;
  }
  void router.push({ name: 'search', ...searchRouteQuery(trimmed, {}, 0, { sort: DEFAULT_SORT, tab }) });
}

function onClear(): void {
  clearTimeout(searchTimer);
  searchValue.value = '';
  suggestions.value = [];
  suggesting.value = false;
  isOpen.value = false;
  if (route.name === 'search') {
    // Same sort rule as submitSearch: clearing resets the query, not
    // the sort the user already chose.
    void router.push({
      name: 'search',
      ...searchRouteFromLocation('', route.query, 0, { tab: scope.value || undefined }),
    });
  }
}

function openSuggestion(hit: SearchHit): void {
  isOpen.value = false;
  const opened = openSearchHit((to) => router.push(to), hit);
  if (!opened) {
    // Pin navigates every suggestion to its entity; the product has no
    // detail page for this type yet, so run the search for its name
    // instead of landing on a dead end.
    submitSearch(hit.displayName || hit.name);
  }
}

function onAiQuery(query: string): void {
  // Pin fills the input without submitting; the user presses Enter to run it.
  searchValue.value = query;
  isOpen.value = true;
}

function onDocumentClick(event: MouseEvent): void {
  if (isOpen.value && containerRef.value && !containerRef.value.contains(event.target as Node)) {
    isOpen.value = false;
  }
}

function onKeyDown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    isOpen.value = false;
  }
}

watch(
  () => route.query.q,
  (next) => {
    searchValue.value = typeof next === 'string' ? next : '';
  },
);

watch(
  () => exploreTabFromRoute(route)?.index ?? '',
  () => {
    scope.value = scopeFromQuery();
  },
);

watch(
  () => route.fullPath,
  () => {
    isOpen.value = false;
  },
);

watch(isOpen, (open) => {
  if (open) {
    refreshRecents();
  }
});

onMounted(() => {
  document.addEventListener('click', onDocumentClick);
  refreshRecents();
  void searchStore.initNLP();
});

onUnmounted(() => {
  document.removeEventListener('click', onDocumentClick);
  clearTimeout(searchTimer);
});
</script>

<template>
  <div ref="containerRef" class="global-search" data-testid="global-search-bar">
    <button
      v-if="searchStore.isNLPEnabled"
      type="button"
      class="global-search__nlp"
      :class="{ 'global-search__nlp--active': searchStore.isNLPActive }"
      data-testid="nlp-suggestions-button"
      :aria-label="searchStore.isNLPActive ? t('explore.nlpActive') : t('explore.nlpUse')"
      :aria-pressed="searchStore.isNLPActive"
      :title="searchStore.isNLPActive ? t('explore.nlpActive') : t('explore.nlpUse')"
      @click="onNlpToggle"
    >
      <SmIcon icon-key="action-nlp" />
    </button>
    <Input.Search
      data-testid="global-search"
      class="global-search__input"
      :placeholder="t('chrome.searchPlaceholder')"
      :value="searchValue"
      @search="submitSearch"
      @update:value="onInput"
      @keydown="onKeyDown"
      @focus="isOpen = true"
    >
      <template v-if="searchValue" #suffix>
        <button
          type="button"
          class="global-search__clear"
          data-testid="global-search-clear"
          :aria-label="t('label.clear')"
          @click="onClear"
        >
          ×
        </button>
      </template>
    </Input.Search>
    <Select
      data-testid="global-search-scope"
      class="global-search__scope"
      size="small"
      :value="scope"
      :options="scopeOptions"
      :aria-label="t('explore.searchScope')"
      @change="onScopeChange"
    />
    <div
      v-if="popoverVisible"
      class="global-search__popover"
      data-testid="global-search-popover"
    >
      <div v-if="suggesting" class="global-search__row global-search__row--muted">
        {{ t('crud.loading') }}
      </div>
      <template v-else-if="showAiQueries">
        <div class="global-search__group-title">{{ t('explore.globalSearchAiQueries') }}</div>
        <button
          v-for="query in AI_EXAMPLE_QUERIES"
          :key="query"
          type="button"
          class="global-search__row"
          data-testid="global-search-ai-query"
          @click="onAiQuery(query)"
        >
          {{ query }}
        </button>
      </template>
      <template v-else-if="showRecents">
        <div class="global-search__group-title">{{ t('explore.globalSearchRecent') }}</div>
        <button
          v-for="term in recentTerms"
          :key="term"
          type="button"
          class="global-search__row"
          data-testid="global-search-recent"
          @click="submitSearch(term)"
        >
          {{ term }}
        </button>
      </template>
      <template v-else-if="!groupedSuggestions.length">
        <div class="global-search__row global-search__row--muted">
          {{ t('explore.globalSearchEnterHint', { keyword: `"${searchValue}"` }) }}
        </div>
      </template>
      <template v-else>
        <div v-for="group in groupedSuggestions" :key="group.index" :data-testid="`global-search-group-${group.index}`">
          <div class="global-search__group-title">{{ group.label }}</div>
          <button
            v-for="hit in group.hits"
            :key="hit.fullyQualifiedName || hit.name"
            type="button"
            class="global-search__row"
            data-testid="global-search-suggestion"
            @click="openSuggestion(hit)"
          >
            <span class="global-search__suggestion-name">{{ hit.displayName || hit.name }}</span>
            <span v-if="hit.fullyQualifiedName" class="global-search__suggestion-fqn">
              {{ hit.fullyQualifiedName }}
            </span>
          </button>
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.global-search {
  position: relative;
  display: flex;
  align-items: center;
  flex: 1;
  gap: 8px;
  max-width: 520px;
  min-width: 0;
}
.global-search__nlp {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  padding: 0;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--sm-text-secondary);
  cursor: pointer;
  font-size: 16px;
  line-height: 0;
}
.global-search__nlp:hover {
  background: var(--sm-bg-base);
  color: var(--sm-color-primary);
}
.global-search__nlp--active {
  background: var(--sm-color-primary-bg);
  color: var(--sm-color-primary);
}
.global-search__input {
  flex: 1;
  min-width: 0;
}
.global-search__clear {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: transparent;
  color: var(--sm-text-tertiary);
  cursor: pointer;
  font-size: 16px;
  line-height: 1;
}
.global-search__clear:hover {
  background: var(--sm-bg-base);
  color: var(--sm-text-primary);
}
.global-search__scope {
  flex: none;
  width: 148px;
}
.global-search__popover {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  right: 0;
  z-index: var(--sm-z-dropdown);
  max-height: 360px;
  overflow-y: auto;
  padding: 4px;
  border: 1px solid var(--sm-border-secondary);
  border-radius: var(--sm-border-radius);
  background: var(--sm-bg-container);
  box-shadow: var(--sm-shadow-raised);
}
.global-search__group-title {
  padding: 6px 8px 2px;
  color: var(--sm-text-tertiary);
  font-size: 12px;
  font-weight: 600;
}
.global-search__row {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0;
  width: 100%;
  padding: 6px 8px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--sm-text-primary);
  cursor: pointer;
  font-size: 13px;
  line-height: 1.4;
  text-align: left;
}
.global-search__row:hover {
  background: var(--sm-color-primary-bg);
}
.global-search__row--muted {
  color: var(--sm-text-tertiary);
  cursor: default;
}
.global-search__row--muted:hover {
  background: transparent;
}
.global-search__suggestion-name {
  font-weight: 600;
}
.global-search__suggestion-fqn {
  color: var(--sm-text-tertiary);
  font-size: 12px;
}
</style>
