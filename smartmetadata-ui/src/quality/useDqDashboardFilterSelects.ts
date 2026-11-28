/**
 * Official useDataQualityDashboardFilters async option loading for the Vue
 * dashboard: defaults on mount for visible filters, onGetInitialOptions when the
 * dropdown opens, debounced onSearch (500ms, pin FilterSelectDropdown), empty
 * search restores defaults (tier/cert merge current selection).
 */
import { debounce } from 'lodash-es';
import { onMounted, reactive, watch, type Ref } from 'vue';
import type { DqDashboardFilterState, DqHiddenFilter } from './dashboard';
import {
  fetchDqDashboardCertificationOptions,
  fetchDqDashboardDataProductOptions,
  fetchDqDashboardGlossaryTermOptions,
  fetchDqDashboardTagOptions,
  fetchDqDashboardTierOptions,
  type DqDashboardFilterOption,
} from './dqDashboardFilterOptions';

export type DqDashboardSearchFilterId = 'tier' | 'certification' | 'tag' | 'glossaryTerm' | 'dataProduct';

interface FilterSlot {
  defaultOptions: DqDashboardFilterOption[];
  options: DqDashboardFilterOption[];
  loading: boolean;
}

const VISIBLE_KEY_TO_ID: Partial<Record<DqHiddenFilter, DqDashboardSearchFilterId>> = {
  tier: 'tier',
  certification: 'certification',
  tags: 'tag',
  glossaryTerms: 'glossaryTerm',
  dataProducts: 'dataProduct',
};

const FETCHERS = {
  tier: fetchDqDashboardTierOptions,
  certification: fetchDqDashboardCertificationOptions,
  tag: fetchDqDashboardTagOptions,
  glossaryTerm: fetchDqDashboardGlossaryTermOptions,
  dataProduct: fetchDqDashboardDataProductOptions,
} as const;

function uniqueOptions(options: DqDashboardFilterOption[]): DqDashboardFilterOption[] {
  const seen = new Set<string>();
  return options.filter((option) => {
    if (seen.has(option.value)) {
      return false;
    }
    seen.add(option.value);
    return true;
  });
}

function selectedAsOptions(values: string[]): DqDashboardFilterOption[] {
  return values.map((value) => ({ value, label: value }));
}

function mergeTierOrCertDefaults(
  selectedValues: string[],
  defaults: DqDashboardFilterOption[],
  current: DqDashboardFilterOption[],
): DqDashboardFilterOption[] {
  const known = new Map([...current, ...defaults].map((option) => [option.value, option]));
  return uniqueOptions([
    ...selectedValues.map((value) => known.get(value) ?? { value, label: value }),
    ...defaults,
  ]);
}

function mergeTagLikeDefaults(
  selectedValues: string[],
  defaults: DqDashboardFilterOption[],
): DqDashboardFilterOption[] {
  return uniqueOptions([...selectedAsOptions(selectedValues), ...defaults]);
}

export function useDqDashboardFilterSelects(
  visibleKeys: Ref<readonly DqHiddenFilter[]>,
  filterState: DqDashboardFilterState,
) {
  const slots = reactive<Record<DqDashboardSearchFilterId, FilterSlot>>({
    tier: { defaultOptions: [], options: [], loading: false },
    certification: { defaultOptions: [], options: [], loading: false },
    tag: { defaultOptions: [], options: [], loading: false },
    glossaryTerm: { defaultOptions: [], options: [], loading: false },
    dataProduct: { defaultOptions: [], options: [], loading: false },
  });

  function restoreEmptySearch(id: DqDashboardSearchFilterId): void {
    const slot = slots[id];
    if (id === 'tier') {
      slot.options = mergeTierOrCertDefaults(filterState.tier, slot.defaultOptions, slot.options);
      return;
    }
    if (id === 'certification') {
      slot.options = mergeTierOrCertDefaults(filterState.certification, slot.defaultOptions, slot.options);
      return;
    }
    if (id === 'glossaryTerm') {
      slot.options = slot.defaultOptions.length
        ? mergeTagLikeDefaults(filterState.glossaryTerm, slot.defaultOptions)
        : [...slot.defaultOptions];
      return;
    }
    slot.options = [...slot.defaultOptions];
  }

  async function loadDefaultOptions(id: DqDashboardSearchFilterId): Promise<void> {
    const slot = slots[id];
    if (slot.defaultOptions.length) {
      if (id === 'tag') {
        slot.options = mergeTagLikeDefaults(filterState.tag, slot.defaultOptions);
      } else if (id === 'glossaryTerm') {
        slot.options = mergeTagLikeDefaults(filterState.glossaryTerm, slot.defaultOptions);
      } else if (id === 'dataProduct') {
        slot.options = mergeTagLikeDefaults(filterState.dataProduct, slot.defaultOptions);
      } else {
        restoreEmptySearch(id);
      }
      return;
    }
    slot.loading = true;
    try {
      const response = await FETCHERS[id]('');
      slot.defaultOptions = response;
      slot.options = response;
    } catch {
      // pin: no toast on suggestion/search failures
    } finally {
      slot.loading = false;
    }
  }

  async function runSearch(id: DqDashboardSearchFilterId, query: string): Promise<void> {
    if (!query.trim()) {
      restoreEmptySearch(id);
      return;
    }
    const slot = slots[id];
    slot.loading = true;
    try {
      slot.options = await FETCHERS[id](query);
    } catch {
      // pin: no toast on suggestion/search failures
    } finally {
      slot.loading = false;
    }
  }

  const debouncedSearch = debounce((id: DqDashboardSearchFilterId, query: string) => {
    void runSearch(id, query);
  }, 500);

  function onDropdownOpen(id: DqDashboardSearchFilterId, open: boolean): void {
    if (open) {
      void loadDefaultOptions(id);
    } else {
      debouncedSearch.cancel();
    }
  }

  function preloadVisibleDefaults(keys: readonly DqHiddenFilter[]): void {
    for (const visibleKey of keys) {
      const id = VISIBLE_KEY_TO_ID[visibleKey];
      if (id) {
        void loadDefaultOptions(id);
      }
    }
  }

  onMounted(() => {
    preloadVisibleDefaults(visibleKeys.value);
  });

  watch(visibleKeys, (keys) => {
    preloadVisibleDefaults(keys);
  });

  return {
    optionsFor: (id: DqDashboardSearchFilterId) => uniqueOptions(slots[id].options),
    loadingFor: (id: DqDashboardSearchFilterId) => slots[id].loading,
    onSearch: (id: DqDashboardSearchFilterId, query: string) => debouncedSearch(id, query),
    onDropdownOpen,
  };
}