/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0.
 */
import { ref } from 'vue';
import { customPropertyFieldDefs, fieldsForSearchIndex } from '@/catalog/advancedSearchFields';
import { ruleEsField, type QueryBuilderFieldDef, type QueryFieldOption } from '@/catalog/queryBuilder';
import { listMetadataTypes } from '@/api/customProperties';
import { mapAggregateBuckets, postAggregateFieldOptions } from '@/api/search';

/**
 * Advanced-search field supply for Explore, mirroring the pin
 * `AdvanceSearchProvider` load path:
 *
 * - base fields come from the per-tab table
 *   (`catalog/advancedSearchFields.ts`, pin `getQbConfigs`);
 * - custom-property fields come from the server
 *   (`GET /v1/metadata/types`, pin `getAllCustomProperties`) and are
 *   grouped under `extension.<entityType>`;
 * - select/multiselect value options come from the server aggregate
 *   endpoint (`POST /v1/search/aggregate`, pin `getAggregateFieldOptions`,
 *   300ms-debounced at the call site).
 *
 * A custom-property fetch failure leaves the builder working with the base
 * fields only, the same fallback the pin provider takes.
 */
export function useAdvancedSearchFields() {
  const customPropertyFields = ref<QueryBuilderFieldDef[]>([]);
  const customPropertiesLoaded = ref(false);
  const customPropertiesLoading = ref(false);

  async function loadCustomPropertyFields(): Promise<void> {
    if (customPropertiesLoaded.value || customPropertiesLoading.value) {
      return;
    }
    customPropertiesLoading.value = true;
    try {
      const page = await listMetadataTypes({ limit: 100 });
      const defs: QueryBuilderFieldDef[] = [];
      for (const type of page.data ?? []) {
        for (const property of type.customProperties ?? []) {
          defs.push(
            ...customPropertyFieldDefs(type.name, {
              name: property.name,
              displayName: property.displayName,
              propertyType: property.propertyType,
              config: property.customPropertyConfig?.config,
            }),
          );
        }
      }
      customPropertyFields.value = defs;
    } catch {
      customPropertyFields.value = [];
    } finally {
      customPropertiesLoaded.value = true;
      customPropertiesLoading.value = false;
    }
  }

  function fieldsForTab(tabIndex: string): QueryBuilderFieldDef[] {
    return [...fieldsForSearchIndex(tabIndex), ...customPropertyFields.value];
  }

  async function fetchFieldOptions(
    field: QueryBuilderFieldDef,
    searchText: string,
    index: string,
  ): Promise<QueryFieldOption[]> {
    if (field.listValues) {
      const query = searchText.trim().toLowerCase();
      return query
        ? field.listValues.filter((option) => option.label.toLowerCase().includes(query))
        : [...field.listValues];
    }
    try {
      const response = await postAggregateFieldOptions({
        fieldName: field.aggregateField ?? ruleEsField(field),
        fieldValue: searchText,
        index,
        size: 50,
      });
      return mapAggregateBuckets(response, field.aggregateField ?? ruleEsField(field)).map((bucket) => ({
        value: bucket.key,
        label: bucket.key,
      }));
    } catch {
      return [];
    }
  }

  return {
    customPropertyFields,
    customPropertiesLoaded,
    customPropertiesLoading,
    loadCustomPropertyFields,
    fieldsForTab,
    fetchFieldOptions,
  };
}
