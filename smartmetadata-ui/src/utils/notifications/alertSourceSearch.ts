/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { apiRequest, ApiError } from '@/api/client';
import { asRecord, asString } from '@/api/json';
import { searchAssets } from '@/api/search';
import { getTermQuery } from '@/api/serviceSearch';
import { PAGE_SIZE_LARGE } from './alertConstants';
import {
  ENTITY_TYPE_SEARCH_INDEX_MAPPING,
  getFqnSearchIndexes,
  UUID_REGEX,
} from './alertSelection';
import { getAlertErrorText } from './alertSave';
import { getEntityName, type TranslateFn } from './alertUtils';

/**
 * Alert source search, ported from pin utils/Alerts/AlertSourceSearch.ts
 * and utils/Alerts/AlertsUtil.tsx (searchEntity, getFqnSearchIndexes).
 * Pin posts searchQuery; the port uses the product's GET searchAssets
 * (the established equivalent) with comma-joined indexes
 * (metadataTypes.ts precedent) and a JSON-string query_filter. Error
 * toasts go through injected hooks so unit tests can capture the exact
 * text; nothing in this module touches the toast UI directly.
 */

export interface NameOption {
  label: string;
  value: string;
}

export type NameSearch = (searchText: string) => Promise<NameOption[]>;

export interface FoundById {
  id: string;
  fullyQualifiedName: string;
}

export interface AlertSourceSearch {
  /** The indexes names are chosen from, so a name chosen earlier can be resolved again. */
  indexes: string[];
  containerEntities: string[];
  byName: NameSearch;
  byId: (searchText?: string) => Promise<FoundById[]>;
}

export interface AlertSearchHooks {
  t: TranslateFn;
  notifyError: (message: string) => void;
  /** Rule-violation failures toast as warnings in pin; falls back to notifyError. */
  notifyWarning?: (message: string) => void;
}

/**
 * searchEntity (AlertsUtil.tsx:84-154): one search over the given
 * indexes, page 1, PAGE_SIZE_LARGE, deduplicated by label (first win).
 * Labels use the display name unless showDisplayNameAsLabel is false
 * (fqnList inputs, where users also type regexes). Container options
 * show a display-only `.*` hint; the stored value stays the plain FQN.
 * Failures toast and yield no options. Pin's setSourceAsValue variant
 * is not ported: no 07 caller uses it and the product SearchHit carries
 * no raw `_source` to stringify.
 */
export async function searchEntity(
  args: {
    searchText: string;
    searchIndex: string | string[];
    queryFilter?: Record<string, unknown>;
    showDisplayNameAsLabel?: boolean;
    wildcardEntityTypes?: string[];
  },
  hooks: AlertSearchHooks,
): Promise<NameOption[]> {
  const { searchText, searchIndex, queryFilter, showDisplayNameAsLabel = true, wildcardEntityTypes } = args;
  try {
    const indexes = [searchIndex].flat();
    const page = await searchAssets(searchText, 0, PAGE_SIZE_LARGE, {
      index: indexes.join(','),
      query_filter: queryFilter ? JSON.stringify(queryFilter) : undefined,
    });
    const seen = new Set<string>();
    const options: NameOption[] = [];
    for (const hit of page.hits) {
      const fullyQualifiedName = hit.fullyQualifiedName ?? '';
      const displayName = showDisplayNameAsLabel ? getEntityName(hit) : fullyQualifiedName;
      const isContainerOption =
        Boolean(hit.entityType) && (wildcardEntityTypes ?? []).includes(hit.entityType);
      const label = isContainerOption ? `${displayName}.*` : displayName;
      if (seen.has(label)) {
        continue;
      }
      seen.add(label);
      options.push({ label, value: fullyQualifiedName });
    }
    return options;
  } catch (error) {
    const message = hooks.t('server.entity-fetch-error', { entity: hooks.t('label.search') });
    if (!isToastSuppressed(error, message, 'GET')) {
      hooks.notifyError(message);
    }
    return [];
  }
}

/**
 * searchDataContractNames (AlertsClassBase.ts:102-121): data contracts
 * are not in the search indexes, so their names come from the contract
 * search API. Failures toast and yield no options.
 */
export async function searchDataContractNames(
  searchText: string,
  hooks: AlertSearchHooks,
): Promise<NameOption[]> {
  try {
    const payload = await apiRequest<unknown>('/v1/dataContracts/search', {
      query: { q: searchText || undefined, limit: PAGE_SIZE_LARGE, offset: 0 },
    });
    const root = asRecord(payload);
    const data = Array.isArray(root?.data) ? root.data : [];
    return data
      .map((item) => asString(asRecord(item)?.fullyQualifiedName))
      .filter(Boolean)
      .map((fullyQualifiedName) => ({ label: fullyQualifiedName, value: fullyQualifiedName }));
  } catch (error) {
    const message = hooks.t('server.entity-fetch-error', {
      entity: hooks.t('label.data-contract'),
    });
    if (!isToastSuppressed(error, message, 'GET')) {
      hooks.notifyError(message);
    }
    return [];
  }
}

/**
 * resolveWildcardFqns (FQNListSelect.utils.ts:40-67): which of the
 * saved FQNs refer to a container (ancestor) entity type for the
 * current source, so the saved-alert view can re-apply the
 * display-only `.*` subtree hint that is not persisted. Silent on
 * failure.
 */
export async function resolveWildcardFqns(
  fqns: string[],
  searchIndex: string | string[],
  containerEntities: string[] = [],
): Promise<string[]> {
  if (fqns.length === 0 || containerEntities.length === 0) {
    return [];
  }
  try {
    const page = await searchAssets('*', 0, fqns.length, {
      index: [searchIndex].flat().join(','),
      query_filter: JSON.stringify(
        getTermQuery({ fullyQualifiedName: fqns }, 'should', 1),
      ),
    });
    return page.hits
      .filter((hit) => hit.entityType && containerEntities.includes(hit.entityType))
      .map((hit) => hit.fullyQualifiedName ?? '')
      .filter(Boolean);
  } catch {
    return [];
  }
}

/**
 * showErrorToast's suppression (ToastUtils.ts:43-50): unauthorized
 * responses stay silent whatever the method; forbidden responses stay
 * silent only for reads; either still shows when the message calls
 * out a principal-domain issue.
 */
const isToastSuppressed = (error: unknown, message: string, method: string): boolean =>
  error instanceof ApiError &&
  (error.status === 401 || (error.status === 403 && method === 'GET')) &&
  !message.includes('principal domain');

/** A rule-violation failure (ToastUtils.ts:41-42) toasts as a warning. */
const isRuleViolation = (error: unknown): boolean => {
  if (!(error instanceof ApiError) || !error.body) {
    return false;
  }
  try {
    const parsed: unknown = JSON.parse(error.body);
    return (
      Boolean(parsed) &&
      typeof parsed === 'object' &&
      (parsed as Record<string, unknown>).errorType === 'RULE_VIOLATION'
    );
  } catch {
    return false;
  }
};

/**
 * showErrorToast (ToastUtils.ts:96-121): the server text via
 * getErrorText, suppressed for unauthorized/forbidden reads, warning
 * variant for rule violations. The method defaults to GET — the
 * search call sites; mutations pass their own, since a forbidden
 * mutation must still toast.
 */
export function reportErrorToast(
  error: unknown,
  hooks: AlertSearchHooks,
  options: { method?: string; fallbackMessage?: string } = {},
): void {
  const method = (options.method ?? 'GET').toUpperCase();
  const fallback =
    options.fallbackMessage && options.fallbackMessage.length > 0
      ? options.fallbackMessage
      : hooks.t('server.unexpected-error');
  const message = getAlertErrorText(error, fallback);
  if (isToastSuppressed(error, message, method)) {
    return;
  }
  if (isRuleViolation(error)) {
    (hooks.notifyWarning ?? hooks.notifyError)(message);
    return;
  }
  hooks.notifyError(message);
}
/**
 * getAlertSourceSearch (AlertSourceSearch.ts:49-111). A source with a
 * search of its own (dataContract) uses it; the other sources share one
 * search over their indexes plus their containers'. An id is looked up
 * in the index of every selected source; a UUID term narrows it to an
 * id term query. byId failures propagate to the caller, as in pin.
 */
export function getAlertSourceSearch(
  sources: string[],
  containerEntities: string[] = [],
  hooks: AlertSearchHooks,
): AlertSourceSearch {
  const ownSearches: Record<string, NameSearch> = {
    dataContract: (searchText: string) => searchDataContractNames(searchText, hooks),
  };
  const withOwnSearch = sources.filter((source) => ownSearches[source]);
  const indexed = sources.filter((source) => !ownSearches[source]);
  const idIndexes = [
    ...new Set(
      sources
        .map((source) => ENTITY_TYPE_SEARCH_INDEX_MAPPING[source])
        .filter((index): index is string => Boolean(index)),
    ),
  ];

  const byName: NameSearch = async (searchText) => {
    const [own, entities] = await Promise.all([
      Promise.all(withOwnSearch.map((source) => ownSearches[source](searchText))),
      indexed.length === 0
        ? []
        : searchEntity(
            {
              searchText,
              searchIndex: getFqnSearchIndexes(indexed, containerEntities),
              showDisplayNameAsLabel: false,
              wildcardEntityTypes: containerEntities,
            },
            hooks,
          ),
    ]);
    return [...own.flat(), ...entities];
  };

  const byId = async (searchText = ''): Promise<FoundById[]> => {
    if (idIndexes.length === 0) {
      return [];
    }
    const trimmed = searchText.trim();
    const page = await searchAssets(trimmed, 0, PAGE_SIZE_LARGE, {
      index: idIndexes.join(','),
      query_filter: UUID_REGEX.test(trimmed) ? JSON.stringify(getTermQuery({ id: trimmed })) : undefined,
    });
    return page.hits.map((hit) => ({
      id: hit.id ?? '',
      fullyQualifiedName: hit.fullyQualifiedName ?? '',
    }));
  };

  return {
    indexes: getFqnSearchIndexes(sources, containerEntities),
    containerEntities,
    byName,
    byId,
  };
}
