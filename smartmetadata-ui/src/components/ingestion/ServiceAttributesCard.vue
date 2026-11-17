<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { Button, Card, Input, Select } from 'ant-design-vue';
import { SERVICE_ENVIRONMENTS, type ServiceAttributes } from '@/types/ingestion';

/**
 * Service attributes card, ported from official
 * components/Settings/Services/ServiceAttributes/ServiceAttributesCard.tsx
 * (pin a3012259ca). Three fixed columns (environment / region /
 * deployment); an unset attribute reads as a dash so the columns stay
 * aligned. The edit affordance is not rendered without permission, and
 * a failed save stays in edit mode so nothing typed is lost (the caller
 * surfaces the failure). The environment option order is the pin's
 * generated Environment enum order.
 */

const props = withDefaults(
  defineProps<{
    serviceAttributes?: ServiceAttributes;
    /** Hides the edit affordance when the user cannot edit the service. */
    hasEditPermission: boolean;
    onSave: (serviceAttributes: ServiceAttributes) => Promise<void>;
  }>(),
  { serviceAttributes: undefined },
);

const { t } = useI18n();

const isEditing = ref(false);
const isSaving = ref(false);
// Copied, never the props object itself: the draft is mutated in place
// while editing and must never write through to the caller's attributes.
const draft = ref<ServiceAttributes>({ ...(props.serviceAttributes ?? {}) });

const displayColumns = computed(() => [
  {
    key: 'environment',
    label: t('serviceDetail.attributes.environment'),
    value: props.serviceAttributes?.environment,
  },
  {
    key: 'region',
    label: t('serviceDetail.attributes.region'),
    value: props.serviceAttributes?.region,
  },
  {
    key: 'deployment',
    label: t('serviceDetail.attributes.deployment'),
    value: props.serviceAttributes?.deployment,
  },
]);

/** Blank strings would persist as empty values; the field is absent, not empty. */
function trimmedOrUndefined(value?: string): string | undefined {
  return value && value.trim() !== '' ? value.trim() : undefined;
}

function startEditing(): void {
  draft.value = { ...(props.serviceAttributes ?? {}) };
  isEditing.value = true;
}

function cancelEditing(): void {
  draft.value = { ...(props.serviceAttributes ?? {}) };
  isEditing.value = false;
}

async function handleSave(): Promise<void> {
  isSaving.value = true;
  try {
    await props.onSave({
      environment: draft.value.environment,
      region: trimmedOrUndefined(draft.value.region),
      deployment: trimmedOrUndefined(draft.value.deployment),
    });
    isEditing.value = false;
  } catch {
    // Swallowed on purpose: the caller has already surfaced the failure.
    // Catching here keeps the card in edit mode so nothing typed is lost
    // and keeps a rejected save from escaping as an unhandled rejection.
  } finally {
    isSaving.value = false;
  }
}
</script>

<template>
  <Card data-testid="service-attributes-card">
    <template #title>
      <div class="service-attributes-head">
        <span>{{ t('serviceDetail.attributes.title') }}</span>
        <span class="service-attributes-description">{{
          t('serviceDetail.attributes.description')
        }}</span>
      </div>
    </template>
    <template #extra>
      <template v-if="isEditing">
        <Button
          data-testid="cancel-service-attributes"
          :disabled="isSaving"
          size="small"
          @click="cancelEditing"
        >
          {{ t('crud.cancel') }}
        </Button>
        <Button
          data-testid="save-service-attributes"
          :loading="isSaving"
          size="small"
          type="primary"
          @click="handleSave"
        >
          {{ t('crud.save') }}
        </Button>
      </template>
      <Button
        v-else-if="hasEditPermission"
        data-testid="edit-service-attributes"
        size="small"
        @click="startEditing"
      >
        {{ t('crud.edit') }}
      </Button>
    </template>
    <div v-if="isEditing" class="service-attributes-grid">
      <div class="service-attributes-field">
        <label for="service-environment-select">{{
          t('serviceDetail.attributes.environment')
        }}</label>
        <Select
          id="service-environment-select"
          v-model:value="draft.environment"
          data-testid="service-environment-select"
          :options="
            SERVICE_ENVIRONMENTS.map((option) => ({ value: option, label: option }))
          "
          allow-clear
        />
      </div>
      <div class="service-attributes-field">
        <label for="service-region">{{ t('serviceDetail.attributes.region') }}</label>
        <Input
          id="service-region"
          v-model:value="draft.region"
          data-testid="service-region"
        />
      </div>
      <div class="service-attributes-field">
        <label for="service-deployment">{{
          t('serviceDetail.attributes.deployment')
        }}</label>
        <Input
          id="service-deployment"
          v-model:value="draft.deployment"
          data-testid="service-deployment"
        />
      </div>
    </div>
    <div v-else class="service-attributes-grid" data-testid="service-attributes-values">
      <div
        v-for="(column, index) in displayColumns"
        :key="column.key"
        :class="['service-attributes-column', { divided: index > 0 }]"
      >
        <div class="service-attributes-label">{{ column.label }}</div>
        <div class="service-attributes-value" :data-testid="`service-${column.key}-value`">
          {{ column.value ? column.value : '-' }}
        </div>
      </div>
    </div>
  </Card>
</template>

<style scoped>
.service-attributes-head {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.service-attributes-description {
  color: var(--sm-text-secondary);
  font-size: 12px;
  font-weight: normal;
  white-space: normal;
}

.service-attributes-grid {
  display: grid;
  gap: 24px;
  grid-template-columns: 1fr;
}

@media (min-width: 768px) {
  .service-attributes-grid {
    grid-template-columns: repeat(3, 1fr);
  }
}

.service-attributes-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.service-attributes-column.divided {
  border-left: 1px solid var(--sm-border-secondary);
  padding-left: 24px;
}

.service-attributes-label {
  color: var(--sm-text-tertiary);
  font-size: 12px;
}

.service-attributes-value {
  font-size: 14px;
  font-weight: 500;
  margin-top: 4px;
}
</style>
