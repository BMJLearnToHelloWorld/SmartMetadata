<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { Button, Divider, Input, Tooltip } from 'ant-design-vue';
import { useI18n } from 'vue-i18n';
import { testAlertDestination } from '@/api/eventSubscriptions';
import type { AlertSelectionState } from '@/composables/useAlertSelection';
import type { EventSubscriptionDestination } from '@/types/quality';
import type { AlertFormDestination } from '@/types/notifications';
import type { AlertFormValidationErrors } from '@/utils/notifications/alertValidation';
import {
  alignDestinationsWithTestStatus,
  getTestableExternalDestinations,
  hasExternalDestination,
} from '@/utils/notifications/alertDestinations';
import { getDestinationsWithTestStatus, getFormattedDestinations } from '@/utils/notifications/alertUtils';
import {
  reportErrorToast,
  type AlertSearchHooks,
} from '@/utils/notifications/alertSourceSearch';
import AlertFormSection from './AlertFormSection.vue';
import DestinationSelectItem from './DestinationSelectItem.vue';

/**
 * Destination section, ported from pin
 * components/Alerts/DestinationFormItem/DestinationFormItem.component.tsx:
 * the shared connection/read timeouts, the destination rows, and the
 * Add/Test actions. Testing formats the rows, tests the testable
 * external ones, and aligns the returned statuses back onto the form
 * rows by index; with nothing testable it asks the form to surface
 * its destination errors instead.
 */
const props = withDefaults(
  defineProps<{
    isViewMode?: boolean;
    destinations?: AlertFormDestination[];
    timeout?: number;
    readTimeout?: number;
    sources?: string[];
    selection: AlertSelectionState;
    validationErrors: AlertFormValidationErrors;
    hooks: AlertSearchHooks;
  }>(),
  {
    isViewMode: false,
    destinations: () => [],
    timeout: undefined,
    readTimeout: undefined,
    sources: () => [],
  },
);
const emit = defineEmits<{
  'update:destinations': [destinations: AlertFormDestination[]];
  'update:timeout': [timeout: number | undefined];
  'update:readTimeout': [readTimeout: number | undefined];
  'request-validation': [];
}>();

const { t } = useI18n();

const destinationsWithStatus = ref<(EventSubscriptionDestination | undefined)[] | undefined>(
  undefined,
);
const isDestinationStatusLoading = ref(false);
const expandedDestinationConfigs = ref(new Set<number>());

// Stable row keys, mirroring pin's useFieldArray field ids: the row
// component is keyed by index, so removing a row remounts the rows
// that shift, and their dismissed warnings and statuses do not carry
// over to a different destination.
const rowKeys = ref<string[]>([]);
let rowKeyCounter = 0;
const newRowKey = (): string => `destination-row-${++rowKeyCounter}`;
watch(
  () => props.destinations.length,
  (length) => {
    if (rowKeys.value.length === length) {
      return;
    }
    rowKeys.value = Array.from({ length }, newRowKey);
  },
  { immediate: true },
);

const isExternalDestinationSelected = computed(() =>
  hasExternalDestination(props.destinations),
);
const disableTestDestinationButton = computed(
  () => props.sources.length === 0 || !isExternalDestinationSelected.value,
);
const destinationsRequiredError = computed(() => props.validationErrors.destinations);
const timeoutError = computed(() => props.validationErrors.timeout);
const readTimeoutError = computed(() => props.validationErrors.readTimeout);

function handleConfigExpandedChange(index: number, isExpanded: boolean): void {
  const updated = new Set(expandedDestinationConfigs.value);
  if (isExpanded) {
    updated.add(index);
  } else {
    updated.delete(index);
  }
  expandedDestinationConfigs.value = updated;
}

function handleAddDestination(): void {
  rowKeys.value.push(newRowKey());
  emit('update:destinations', [...props.destinations, {}]);
}

function handleRemoveDestination(index: number): void {
  rowKeys.value.splice(index, 1);
  emit(
    'update:destinations',
    props.destinations.filter((_, i) => i !== index),
  );
  // Destination indexes shift after removal, so stale UI-only
  // expansion state and index-aligned test statuses must not be
  // applied to a different destination.
  expandedDestinationConfigs.value = new Set();
  destinationsWithStatus.value = undefined;
}

function handleDestinationUpdate(index: number, destination: AlertFormDestination): void {
  emit(
    'update:destinations',
    props.destinations.map((item, i) => (i === index ? destination : item)),
  );
}

async function handleTestDestinationClick(): Promise<void> {
  try {
    isDestinationStatusLoading.value = true;
    const formattedDestinations = getFormattedDestinations(props.destinations);
    const externalDestinations = getTestableExternalDestinations(formattedDestinations);
    if (externalDestinations.length === 0) {
      destinationsWithStatus.value = undefined;
      emit('request-validation');
      return;
    }
    const results = await testAlertDestination({ destinations: externalDestinations });
    destinationsWithStatus.value = alignDestinationsWithTestStatus(
      formattedDestinations,
      getDestinationsWithTestStatus(externalDestinations, results),
    );
  } catch (error) {
    reportErrorToast(error, props.hooks, { method: 'POST' });
  } finally {
    isDestinationStatusLoading.value = false;
  }
}

function onTimeoutInput(raw: string): void {
  emit('update:timeout', raw === '' ? undefined : Number(raw));
}

function onReadTimeoutInput(raw: string): void {
  emit('update:readTimeout', raw === '' ? undefined : Number(raw));
}
</script>

<template>
  <AlertFormSection
    :heading="t('label.destination')"
    :sub-heading="t('message.alerts-destination-description')"
  >
    <div class="destination-form-item">
      <div class="destination-form-item__timeout-row">
        <span class="destination-form-item__timeout-label">
          {{ `${t('label.connection-timeout')} (${t('label.second-plural')})` }}
        </span>
        <span>:</span>
        <div :data-testid="'connection-timeout'" class="destination-form-item__timeout-input">
          <Input
            :value="timeout === undefined ? '' : String(timeout)"
            type="number"
            :disabled="isViewMode"
            data-testid="connection-timeout-input"
            :placeholder="`${t('label.connection-timeout')} (${t('label.second-plural')})`"
            :status="timeoutError ? 'error' : undefined"
            @change="(event) => onTimeoutInput((event.target as HTMLInputElement).value)"
          />
          <p v-if="timeoutError" class="destination-form-item__error">{{ timeoutError }}</p>
        </div>
      </div>

      <div class="destination-form-item__timeout-row">
        <span class="destination-form-item__timeout-label">
          {{ `${t('label.read-type', { type: t('label.timeout') })} (${t('label.second-plural')})` }}
        </span>
        <span>:</span>
        <div :data-testid="'read-timeout'" class="destination-form-item__timeout-input">
          <Input
            :value="readTimeout === undefined ? '' : String(readTimeout)"
            type="number"
            :disabled="isViewMode"
            data-testid="read-timeout-input"
            :placeholder="`${t('label.read-type', { type: t('label.timeout') })} (${t('label.second-plural')})`"
            :status="readTimeoutError ? 'error' : undefined"
            @change="(event) => onReadTimeoutInput((event.target as HTMLInputElement).value)"
          />
          <p v-if="readTimeoutError" class="destination-form-item__error">{{ readTimeoutError }}</p>
        </div>
      </div>

      <Divider />

      <div data-testid="destination-list" class="destination-form-item__list">
        <div
          v-for="(destination, index) in destinations"
          :key="rowKeys[index] ?? index"
        >
          <DestinationSelectItem
            :key="index"
            :id="index"
            :destination="destination"
            :destinations-with-status="destinationsWithStatus"
            :is-config-expanded="expandedDestinationConfigs.has(index)"
            :is-destination-status-loading="isDestinationStatusLoading"
            :is-view-mode="isViewMode"
            :selection="selection"
            :validation-errors="validationErrors"
            :hooks="hooks"
            @update:destination="(next) => handleDestinationUpdate(index, next)"
            @remove="handleRemoveDestination(index)"
            @config-expanded-change="(expanded) => handleConfigExpandedChange(index, expanded)"
          />
          <Divider v-if="index < destinations.length - 1" />
        </div>
      </div>

      <p v-if="destinationsRequiredError" class="destination-form-item__error">
        {{ destinationsRequiredError }}
      </p>

      <div v-if="!isViewMode" class="destination-form-item__actions">
        <Button
          type="primary"
          data-testid="add-destination-button"
          :disabled="sources.length === 0"
          @click="handleAddDestination"
        >
          {{ t('label.add-entity', { entity: t('label.destination') }) }}
        </Button>
        <Tooltip placement="right" :title="t('message.external-destination-selection')">
          <span>
            <Button
              data-testid="test-destination-button"
              :disabled="disableTestDestinationButton"
              @click="handleTestDestinationClick"
            >
              {{ t('label.test-entity', { entity: t('label.destination-plural') }) }}
            </Button>
          </span>
        </Tooltip>
      </div>
    </div>
  </AlertFormSection>
</template>

<style scoped>
.destination-form-item {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.destination-form-item__timeout-row {
  display: flex;
  align-items: flex-start;
  gap: 8px;
}

.destination-form-item__timeout-label {
  flex: 0 0 220px;
  font-size: 14px;
  padding-top: 6px;
}

.destination-form-item__timeout-input {
  flex: 1;
}

.destination-form-item__error {
  font-size: 14px;
  color: var(--sm-color-error);
}

.destination-form-item__list {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.destination-form-item__actions {
  display: flex;
  gap: 16px;
}
</style>
