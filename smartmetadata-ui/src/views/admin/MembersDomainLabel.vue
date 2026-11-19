<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { Button, Card } from 'ant-design-vue';
import { EditOutlined, PlusOutlined } from '@ant-design/icons-vue';
import { getEntityName } from '@/components/shared/profilePictureUtils';
import type { AdminEntityRef } from '@/types/admin';
import MembersEntityPicker from './MembersEntityPicker.vue';

/** Picker options forwarded on save (structural: the picker's PickerOption). */
export interface DomainPickerOption {
  id: string;
  name: string;
  displayName?: string;
  fullyQualifiedName?: string;
}

/**
 * DomainLabel equivalent (pin DomainLabel.component.tsx): domain links
 * + add/edit affordances + the card (WidgetCard) variant used by the
 * user-detail Domains card. Empty text is label.no-entity with the
 * domain-plural entity. Domain links stay id-based (the product
 * domain-detail route takes :id; FQN migration is another batch).
 */

const props = withDefaults(
  defineProps<{
    domains: AdminEntityRef[];
    canEdit: boolean;
    multiple?: boolean;
    variant?: 'inline' | 'card';
    saving?: boolean;
  }>(),
  { multiple: true, variant: 'inline', saving: false },
);

const emit = defineEmits<{
  save: [ids: string[], options: DomainPickerOption[]];
}>();

const { t } = useI18n();
const pickerOpen = ref(false);

const widgetTitle = computed(() =>
  props.multiple ? t('label.domain-plural') : t('label.domain'),
);
const emptyText = computed(() =>
  t('label.no-entity', { entity: t('label.domain-plural') }),
);

function onPickerSave(ids: string[], options: DomainPickerOption[]): void {
  pickerOpen.value = false;
  emit('save', ids, options);
}
</script>

<template>
  <Card v-if="variant === 'card'" :title="widgetTitle" size="small">
    <template #extra>
      <Button
        v-if="canEdit && domains.length === 0"
        type="text"
        size="small"
        data-testid="add-domain"
        :title="t('label.add-entity', { entity: widgetTitle })"
        @click="pickerOpen = true"
      >
        <PlusOutlined />
      </Button>
      <Button
        v-if="canEdit && domains.length > 0"
        type="text"
        size="small"
        data-testid="edit-domain"
        :title="t('label.edit-entity', { entity: widgetTitle })"
        @click="pickerOpen = true"
      >
        <EditOutlined />
      </Button>
    </template>
    <span v-if="domains.length === 0" data-testid="no-domain-text">{{ emptyText }}</span>
    <span v-else class="domain-label__list">
      <RouterLink
        v-for="domain in domains"
        :key="domain.id"
        :to="{ name: 'governance-domain', params: { id: domain.id } }"
      >
        {{ getEntityName(domain) }}
      </RouterLink>
    </span>
  </Card>
  <span v-else class="domain-label">
    <span v-if="domains.length === 0" data-testid="no-domain-text">{{ emptyText }}</span>
    <span v-else class="domain-label__list">
      <RouterLink
        v-for="domain in domains"
        :key="domain.id"
        :to="{ name: 'governance-domain', params: { id: domain.id } }"
      >
        {{ getEntityName(domain) }}
      </RouterLink>
    </span>
    <Button
      v-if="canEdit && domains.length === 0"
      type="text"
      size="small"
      data-testid="add-domain"
      :title="t('label.add-entity', { entity: widgetTitle })"
      @click="pickerOpen = true"
    >
      <PlusOutlined />
    </Button>
    <Button
      v-if="canEdit && domains.length > 0"
      type="text"
      size="small"
      data-testid="edit-domain"
      :title="t('label.edit-entity', { entity: widgetTitle })"
      @click="pickerOpen = true"
    >
      <EditOutlined />
    </Button>
  </span>
  <MembersEntityPicker
    :open="pickerOpen"
    kind="domain"
    :multiple="multiple"
    :selected-ids="domains.flatMap((domain) => (domain.id === undefined ? [] : [domain.id]))"
    :title="t('label.edit-entity', { entity: widgetTitle })"
    :saving="saving"
    @cancel="pickerOpen = false"
    @save="onPickerSave"
  />
</template>

<style scoped>
.domain-label__list {
  display: inline-flex;
  flex-wrap: wrap;
  gap: 8px;
}
</style>
