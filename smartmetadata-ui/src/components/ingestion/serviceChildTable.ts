/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import type { TableProps } from 'ant-design-vue';
import { onUnmounted, ref, watch, type ComputedRef, type Ref } from 'vue';
import type { ServicePageData } from '@/api/servicePageData';
import {
  getCertificationTag,
  getTagsWithoutCertification,
  getTagsWithoutTier,
  getTierTag,
} from '@/ingestion/tierTags';

/**
 * Shared child-table chrome for the service detail tabs (pin
 * ServiceMainTabContent / DataModelsTable / FilesTable at
 * a3012259ca): the main tab and the version page share one column
 * definition, and every child table shares the tag-cell splits, the
 * name sorter, the debounced search, and the two-variant empty text.
 * The data-models and drive tables keep their own column sets (pin
 * gives them different visible columns) but reuse the rest.
 */

/** Pin name-column sorter: locale compare on `name`, inert otherwise. */
export function compareChildNames(a: { name?: unknown }, b: { name?: unknown }): number {
  if (typeof a.name === 'string' && typeof b.name === 'string') {
    return a.name.localeCompare(b.name);
  }
  return 0;
}

export interface ServiceChildColumnTitles {
  name: string;
  description: string;
  owners: string;
  tags: string;
  tier: string;
  certification: string;
}

/**
 * Pin `getServiceMainTabColumns` default visible set: Name +
 * Description + Owners + Tags + Tier + Certification, with the
 * detail page's widths. The version page reuses it verbatim — pin
 * ServiceVersionMainTabContent uses the same column builder.
 */
export function serviceChildColumns(
  titles: ServiceChildColumnTitles,
): TableProps['columns'] {
  return [
    {
      title: titles.name,
      dataIndex: 'name',
      key: 'name',
      width: 280,
      sorter: compareChildNames,
    },
    { title: titles.description, dataIndex: 'description', key: 'description', width: 300 },
    { title: titles.owners, dataIndex: 'owners', key: 'owners', width: 280 },
    { title: titles.tags, dataIndex: 'tags', key: 'tags', width: 240 },
    { title: titles.tier, dataIndex: 'tier', key: 'tier', width: 120 },
    { title: titles.certification, dataIndex: 'certification', key: 'certification', width: 150 },
  ];
}

/** The tier cell shows the first `Tier.*` label only, capped at one. */
export function tierCellTags<T extends { tagFQN: string }>(
  tags: readonly T[] | undefined,
): T[] {
  const tier = getTierTag(tags ?? []);
  return tier ? [tier] : [];
}

/**
 * The certification cell shows the entity's `certification.tagLabel`,
 * falling back to the first `Certification.*` label in `tags` (pin
 * ServiceMainTabContentUtils certification column).
 */
export function certificationCellTags<T extends { tagFQN: string }>(row: {
  certification?: { tagLabel?: T };
  tags?: readonly T[];
}): T[] {
  const tag = row.certification?.tagLabel ?? getCertificationTag(row.tags ?? []);
  return tag ? [tag] : [];
}

/** The tags cell shows every label except the tier and certification ones. */
export function visibleChildTags<T extends { tagFQN: string }>(
  tags: readonly T[] | undefined,
): T[] {
  return getTagsWithoutCertification(getTagsWithoutTier(tags ?? []));
}

/** Single-line name for the data-models and drive tables (pin `getEntityName`). */
export function entityDisplayName(row: { displayName?: string; name?: string }): string {
  return row.displayName || row.name || '';
}

/**
 * The two-variant empty text every child table shows: the
 * no-matching-results spelling hint while searching, the
 * no-data-for-entity text otherwise.
 */
export function childTableEmptyText(
  searching: boolean,
  messages: { noMatchingResults: string; checkSpelling: string; noData: string },
): string {
  return searching
    ? `${messages.noMatchingResults} — ${messages.checkSpelling}`
    : messages.noData;
}

/**
 * Debounced table search: the input mirrors the URL search value and
 * commits 500ms after the last keystroke, only when the text
 * actually changed. The pending timer is cleared on unmount so a
 * late commit cannot fire after the tab is gone.
 */
export function useDebouncedTableSearch(
  searchValue: ComputedRef<string | undefined>,
  onSearch: (value: string) => void,
  delay = 500,
): Ref<string> {
  const inputValue = ref('');
  watch(
    searchValue,
    (value) => {
      inputValue.value = value ?? '';
    },
    { immediate: true },
  );
  let timer: ReturnType<typeof setTimeout> | undefined;
  watch(inputValue, (value) => {
    if (timer !== undefined) {
      clearTimeout(timer);
    }
    timer = setTimeout(() => {
      if (value !== (searchValue.value ?? '')) {
        onSearch(value);
      }
    }, delay);
  });
  onUnmounted(() => {
    if (timer !== undefined) {
      clearTimeout(timer);
    }
  });
  return inputValue;
}

/** Table rows require an FQN; list items carry it optionally. */
export function withRequiredFqn(
  page: ServicePageData,
): ServicePageData & { fullyQualifiedName: string } {
  return { ...page, fullyQualifiedName: page.fullyQualifiedName ?? '' };
}
