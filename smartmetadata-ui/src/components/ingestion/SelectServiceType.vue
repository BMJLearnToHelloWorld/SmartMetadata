<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { Input, Select, Tag } from 'ant-design-vue';
import NoDataPlaceholder from '@/components/shared/NoDataPlaceholder.vue';
import ServiceLogo from '@/components/ingestion/ServiceLogo.vue';
import {
  SERVICE_CATEGORY_ROWS,
  type ServiceCategoryKind,
} from '@/ingestion/serviceCategories';
import {
  getWizardConnectors,
  getWizardDisplayName,
  isBetaService,
} from '@/ingestion/wizardServiceTypes';

/**
 * Port of official SelectServiceType (pin a3012259ca,
 * components/Settings/Services/AddService/Steps/SelectServiceType.tsx:
 * 63-217): the wizard step-1 connector picker. Category Select with
 * All Services first in title-keys order; an unknown category falls
 * back to the first category for display, and `all` is a legal
 * selection. Changing the category clears the search term. The
 * connector grid is five columns of 100px cards carrying the logo
 * circle, the display name, and a Beta badge for beta services.
 * Cards are keyed by category + type because the `all` view spans
 * every category. The empty state uses the category-default logo in
 * place of the pin's Database01 glyph (no such glyph exists in the
 * product icon set).
 */
const props = withDefaults(
  defineProps<{
    category: ServiceCategoryKind | 'all' | string;
    showError?: boolean;
  }>(),
  { showError: false },
);

const emit = defineEmits<{
  'category-change': [category: ServiceCategoryKind | 'all'];
  select: [payload: { category: ServiceCategoryKind; type: string }];
}>();

const { t } = useI18n();
const searchTerm = ref('');

const categoryOptions = computed(() => [
  { value: 'all', label: t('settings.services.wizard.allServices') },
  ...SERVICE_CATEGORY_ROWS.map((row) => ({
    value: row.kind,
    label: t(row.titleKey),
  })),
]);

const displayCategory = computed<ServiceCategoryKind | 'all'>(() => {
  if (props.category === 'all') {
    return 'all';
  }
  const known = SERVICE_CATEGORY_ROWS.some((row) => row.kind === props.category);
  return known ? (props.category as ServiceCategoryKind) : SERVICE_CATEGORY_ROWS[0].kind;
});

const connectors = computed(() => getWizardConnectors(displayCategory.value, searchTerm.value));

function onCategoryChange(value: string): void {
  searchTerm.value = '';
  emit('category-change', value as ServiceCategoryKind | 'all');
}
</script>

<template>
  <div>
    <Select
      :value="displayCategory"
      data-testid="service-category"
      style="width: 100%"
      @update:value="onCategoryChange($event as string)"
    >
      <Select.Option v-for="option in categoryOptions" :key="option.value" :value="option.value">
        {{ option.label }}
      </Select.Option>
    </Select>

    <div style="margin-top: 14px">
      <Input
        :value="searchTerm"
        :placeholder="t('settings.services.wizard.searchConnector')"
        data-testid="connector-search"
        allow-clear
        @update:value="searchTerm = $event"
      />

      <div v-if="!connectors.length" class="select-service-type__empty">
        <NoDataPlaceholder
          test-id="no-data-placeholder"
          :description="t('settings.services.wizard.noConnectorsAvailable')"
        >
          <template #icon>
            <ServiceLogo
              :default-kind="displayCategory === 'all' ? 'database' : displayCategory"
              :size="48"
            />
          </template>
        </NoDataPlaceholder>
      </div>

      <div class="select-service-type__grid" data-testid="select-service">
        <button
          v-for="connector in connectors"
          :key="`${connector.category}-${connector.type}`"
          type="button"
          class="select-service-type__card"
          :data-testid="connector.type"
          @click="emit('select', connector)"
        >
          <span class="select-service-type__icon" data-testid="service-icon">
            <ServiceLogo :source="{ serviceType: connector.type }" :size="24" />
          </span>
          <span class="select-service-type__name">
            {{ getWizardDisplayName(connector.type) }}
            <Tag v-if="isBetaService(connector.type)" color="blue">
              {{ t('settings.services.beta') }}
            </Tag>
          </span>
        </button>
      </div>

      <p v-if="props.showError" class="select-service-type__error">
        {{
          t('settings.services.fieldTextRequired', {
            fieldText: t('settings.services.service'),
          })
        }}
      </p>
    </div>
  </div>
</template>

<style scoped>
.select-service-type__empty {
  position: relative;
  min-height: 240px;
}

.select-service-type__grid {
  display: grid;
  margin-top: 16px;
  grid-template-columns: repeat(5, 1fr);
  gap: 12px;
}

.select-service-type__card {
  display: flex;
  height: 100px;
  width: 100%;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 16px 10px;
  border: 1px solid var(--hatch-widget-border, rgba(0, 0, 0, 0.1));
  border-radius: 8px;
  background: var(--sm-bg-container);
  cursor: pointer;
}

.select-service-type__icon {
  display: flex;
  width: 40px;
  height: 40px;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--hatch-widget-border, rgba(0, 0, 0, 0.1));
  border-radius: 50%;
}

.select-service-type__name {
  font-size: 12px;
  font-weight: 600;
  text-align: center;
}

.select-service-type__error {
  margin-top: 8px;
  color: var(--sm-color-error);
}
</style>
