/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { getTermQuery } from '@/api/serviceSearch';
import { searchAssets } from '@/api/search';
import type { SearchHit } from '@/types/api';
import type { AlertSourceSearch } from './alertSourceSearch';
import {
  reportErrorToast,
  searchEntity,
  type AlertSearchHooks,
} from './alertSourceSearch';
import { DATA_CONTRACT_STATUS_OPTIONS, PAGE_SIZE_LARGE } from './alertConstants';
import {
  getSelectOptionsFromEnum,
  getSelectOptionsFromValues,
  getSubscriptionTypeOptions,
  getEntityName,
  startCase,
  type TranslateFn,
} from './alertUtils';
import { buildGroupedOptions, type GroupedDestinationOption } from './alertDestinations';
import { EVENT_TYPES } from '@/types/notifications';

/**
 * Rule-argument options, ported from pin
 * AlertAiFormFieldsSearchUtils.ts and AlertAiFormFieldsSelectUtils.tsx.
 * The classic form's argument fields reuse this machinery: names and
 * ids come from what the chosen sources hold, through their search;
 * the other arguments search a fixed index; enum-backed arguments
 * offer a fixed list. Pin posts searchQuery; the port uses the
 * product's GET searchAssets with comma-joined indexes.
 */

/** StatusType (generated/entity/data/pipeline.ts). */
export const PIPELINE_STATUS_TYPE_VALUES = ['Failed', 'Pending', 'Skipped', 'Successful'] as const;

/** PipelineState (generated/entity/services/ingestionPipelines/ingestionPipeline.ts). */
export const PIPELINE_STATE_VALUES = [
  'failed',
  'partialSuccess',
  'queued',
  'running',
  'stopped',
  'success',
] as const;

/** TestCaseStatus (generated/tests/testCase.ts). */
export const TEST_CASE_STATUS_VALUES = ['Aborted', 'Failed', 'Queued', 'Success'] as const;

export interface AlertSearchOption {
  label: string;
  value: string;
}

export interface AlertSelectItem {
  id: string;
  label: string;
  supportingText?: string;
  isDisabled?: boolean;
}

/** getAlertAiUserOptions (SearchUtils.ts:40-47): selectable non-bot users. */
export const getAlertAiUserOptions = (
  searchText: string,
  hooks: AlertSearchHooks,
): Promise<AlertSearchOption[]> =>
  searchEntity(
    {
      searchText,
      searchIndex: 'user',
      queryFilter: getTermQuery({ isBot: 'false' }),
    },
    hooks,
  );

/** getAlertAiTeamOptions (SearchUtils.ts:50-53): selectable teams. */
export const getAlertAiTeamOptions = (
  searchText: string,
  hooks: AlertSearchHooks,
): Promise<AlertSearchOption[]> =>
  searchEntity({ searchText, searchIndex: 'team' }, hooks);

const toSearchSelectItems = (
  hits: SearchHit[],
  showDisplayNameAsLabel: boolean,
): AlertSelectItem[] => {
  const seen = new Set<string>();
  const items: AlertSelectItem[] = [];
  for (const hit of hits) {
    const fqn = hit.fullyQualifiedName ?? '';
    const label = showDisplayNameAsLabel ? getEntityName(hit) : fqn;
    const item = { id: fqn, label: label || fqn };
    if (seen.has(item.id) || !item.id) {
      continue;
    }
    seen.add(item.id);
    items.push(item);
  }
  return items;
};

interface AlertArgumentConfig {
  searchIndex: string | string[];
  queryFilter?: Record<string, unknown>;
  showDisplayNameAsLabel?: boolean;
}

// The arguments that search what the chosen sources hold go through the source search instead.
const ALERT_ARGUMENT_CONFIGS: Record<string, AlertArgumentConfig> = {
  domainList: { searchIndex: 'domain' },
  tableNameList: { searchIndex: 'table', showDisplayNameAsLabel: false },
  entityNameList: { searchIndex: 'table', showDisplayNameAsLabel: false },
  ownerNameList: {
    searchIndex: ['team', 'user'],
    queryFilter: getTermQuery({ isBot: 'false' }),
  },
  updateByUserList: { searchIndex: 'user' },
  userList: { searchIndex: 'user', queryFilter: getTermQuery({ isBot: 'false' }) },
  testSuiteList: { searchIndex: 'testSuite' },
};

const SOURCE_ARGUMENT_SEARCHERS: Record<
  string,
  (search: AlertSourceSearch, text: string) => Promise<AlertSelectItem[]>
> = {
  fqnList: async (search, text) =>
    (await search.byName(text)).map(({ value, label }) => ({ id: value, label })),
  entityIdList: async (search, text) =>
    (await search.byId(text)).map(({ id, fullyQualifiedName }) => ({
      id,
      label: id,
      supportingText: fullyQualifiedName,
    })),
};

const searchIndexedOptions = async (
  config: AlertArgumentConfig,
  searchText: string,
): Promise<AlertSelectItem[]> => {
  const { searchIndex, queryFilter, showDisplayNameAsLabel = true } = config;
  const page = await searchAssets(searchText, 0, PAGE_SIZE_LARGE, {
    index: [searchIndex].flat().join(','),
    query_filter: queryFilter ? JSON.stringify(queryFilter) : undefined,
  });
  return toSearchSelectItems(page.hits, showDisplayNameAsLabel);
};

/**
 * searchAlertAiArgumentOptions (SearchUtils.ts:141-165). Failures toast
 * the server's message — except unauthorized/forbidden reads, which
 * pin's showErrorToast suppresses (ToastUtils.ts:43-50) — and yield no
 * options.
 */
export const searchAlertAiArgumentOptions = async (
  args: {
    argument: string;
    searchText: string;
    sourceSearch: AlertSourceSearch;
  },
  hooks: AlertSearchHooks,
): Promise<AlertSelectItem[]> => {
  const trimmedSearchText = args.searchText.trim();
  const searchSources = SOURCE_ARGUMENT_SEARCHERS[args.argument];
  const config = ALERT_ARGUMENT_CONFIGS[args.argument];
  try {
    if (searchSources) {
      return await searchSources(args.sourceSearch, trimmedSearchText);
    }
    return config ? await searchIndexedOptions(config, trimmedSearchText) : [];
  } catch (error) {
    reportErrorToast(error, hooks);
    return [];
  }
};

/**
 * resolveAlertAiArgumentLabels (SearchUtils.ts:168-188): resolves saved
 * argument values to display-name options, since they may be outside
 * the first page. Silent on failure. Arguments without a config, or
 * whose labels are FQNs, resolve to nothing.
 */
export const resolveAlertAiArgumentLabels = async (
  argument: string,
  values: string[],
): Promise<AlertSelectItem[]> => {
  const config = ALERT_ARGUMENT_CONFIGS[argument];
  if (!config || config.showDisplayNameAsLabel === false || !values.length) {
    return [];
  }
  try {
    return await searchIndexedOptions(
      {
        searchIndex: config.searchIndex,
        queryFilter: getTermQuery({ fullyQualifiedName: values }, 'should', 1),
      },
      '',
    );
  } catch {
    return [];
  }
};

const toSelectItems = (
  options: Array<{ label: string; value: string }>,
): AlertSelectItem[] =>
  options.map((option) => ({ id: option.value, label: option.label }));

/** getDestinationCategoryItems (SelectUtils.tsx:60-70). */
export const getDestinationCategoryItems = (
  t: TranslateFn,
  offeredCategories?: string[],
  currentCategory?: string,
): GroupedDestinationOption[] =>
  buildGroupedOptions(t('label.internal'), t('label.external'), offeredCategories, currentCategory);

/** getAuthTypeItems (SelectUtils.tsx:72-76). */
export const getAuthTypeItems = (t: TranslateFn): AlertSelectItem[] => [
  { id: 'none', label: t('label.no-authentication') },
  { id: 'bearer', label: t('label.bearer-hmac-signature') },
  { id: 'oauth2', label: t('label.oauth2-client-credential-plural') },
];

/** getSubscriptionItems (SelectUtils.tsx:79-86). */
export const getSubscriptionItems = (destinationType?: string): AlertSelectItem[] =>
  getSubscriptionTypeOptions(destinationType ?? '').map((option) => ({
    id: String(option.value),
    isDisabled: option.disabled,
    label: option.label ? option.label : startCase(String(option.value)),
  }));

export interface SelectArgumentConfig {
  items: AlertSelectItem[];
  label: string;
  placeholder: string;
}

/** getSelectArgumentConfig (SelectUtils.tsx:89-157). */
export const getSelectArgumentConfig = (
  argument: string,
  t: TranslateFn,
  supportedEventTypes?: string[],
): SelectArgumentConfig | undefined => {
  switch (argument) {
    case 'eventTypeList':
      return {
        // Same narrowing as the classic notification form: only offer event
        // types the selected source can emit.
        items: toSelectItems(
          !supportedEventTypes || supportedEventTypes.length === 0
            ? getSelectOptionsFromEnum([...EVENT_TYPES])
            : getSelectOptionsFromValues(supportedEventTypes),
        ),
        label: t('label.event-type'),
        placeholder: t('label.search-by-type', { type: t('label.event-type-lowercase') }),
      };
    case 'pipelineStateList':
      return {
        items: toSelectItems(getSelectOptionsFromEnum([...PIPELINE_STATUS_TYPE_VALUES])),
        label: t('label.pipeline-state'),
        placeholder: t('label.search-by-type', { type: t('label.pipeline-state') }),
      };
    case 'ingestionPipelineStateList':
      return {
        items: toSelectItems(getSelectOptionsFromEnum([...PIPELINE_STATE_VALUES])),
        label: t('label.pipeline-state'),
        placeholder: t('label.search-by-type', { type: t('label.pipeline-state') }),
      };
    case 'testStatusList':
      return {
        items: toSelectItems(getSelectOptionsFromEnum([...TEST_CASE_STATUS_VALUES])),
        label: t('label.test-suite-status'),
        placeholder: t('label.search-by-type', { type: t('label.test-suite-status') }),
      };
    case 'testResultList':
      return {
        items: toSelectItems(getSelectOptionsFromEnum([...TEST_CASE_STATUS_VALUES])),
        label: t('label.test-case-result'),
        placeholder: t('label.search-by-type', { type: t('label.test-case-result') }),
      };
    case 'contractStatusList':
      return {
        items: toSelectItems(
          DATA_CONTRACT_STATUS_OPTIONS.map((option) => ({
            label: t(option.labelKey),
            value: option.value,
          })),
        ),
        label: t('label.data-contract-status'),
        placeholder: t('label.search-by-type', { type: t('label.data-contract-status') }),
      };
    default:
      return undefined;
  }
};
