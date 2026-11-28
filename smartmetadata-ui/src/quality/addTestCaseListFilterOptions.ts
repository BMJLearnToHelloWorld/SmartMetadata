/**
 * Copyright 2026 SmartMetadata authors.
 * Licensed under the Apache License, Version 2.0.
 *
 * Pin AddTestCaseList table/column filter fetchers (searchQuery on TABLE,
 * getAggregateFieldOptions on DATA_ASSET + columns.name.keyword).
 */
import { mapAggregateBuckets, postAggregateFieldOptions, searchAssets } from '@/api/search';
import { getEntityName } from '@/components/shared/profilePictureUtils';
import { DQ_DASHBOARD_FILTER_PAGE_SIZE, WILD_CARD_CHAR } from '@/quality/dqDashboardFilterOptions';
import { COLUMN_AGGREGATE_FIELD, parseColumnAggregateBuckets } from '@/quality/addTestCaseListUtils';

export interface AddTestCaseListFilterOption {
  value: string;
  label: string;
}

export async function fetchAddTestCaseTableOptions(search = WILD_CARD_CHAR): Promise<AddTestCaseListFilterOption[]> {
  const query = search === WILD_CARD_CHAR || search === '' ? WILD_CARD_CHAR : `*${search}*`;
  try {
    const page = await searchAssets(query, 0, DQ_DASHBOARD_FILTER_PAGE_SIZE, {
      index: 'table',
      includeAggregations: false,
    });
    return page.hits
      .map((hit) => {
        const value = hit.fullyQualifiedName ?? hit.name;
        if (!value) {
          return null;
        }
        return { value, label: getEntityName(hit) };
      })
      .filter((row): row is AddTestCaseListFilterOption => row !== null);
  } catch {
    return [];
  }
}

export async function fetchAddTestCaseColumnOptions(
  search = '',
  tableFqn?: string,
): Promise<AddTestCaseListFilterOption[]> {
  const query = tableFqn ? `entityFQN:"${tableFqn}"` : undefined;
  try {
    const response = await postAggregateFieldOptions({
      fieldName: COLUMN_AGGREGATE_FIELD,
      fieldValue: search,
      index: 'dataAsset',
      query,
      size: DQ_DASHBOARD_FILTER_PAGE_SIZE,
    });
    const buckets = mapAggregateBuckets(response, COLUMN_AGGREGATE_FIELD);
    return parseColumnAggregateBuckets(buckets, tableFqn);
  } catch {
    return [];
  }
}