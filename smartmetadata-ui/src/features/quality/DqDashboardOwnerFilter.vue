<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { Button, Dropdown } from 'ant-design-vue';
import SmIcon from '@/components/shared/SmIcon.vue';
import UserTeamPicker from '@/components/governance/workflowBuilder/forms/UserTeamPicker.vue';
import type { EntityRef } from '@/types/api';
import { getEntityName } from '@/components/shared/profilePictureUtils';

/**
 * Official DataQualityDashboard DQ_FILTER_TYPES.OWNER + UserTeamSelectableList
 * (DataQualityDashboard.component.tsx). Values are owner names/FQNs for the
 * chart filter; the query carries only the first pick (handleOwnerChange).
 */
const props = defineProps<{
  modelValue: string[];
  testId?: string;
}>();

const emit = defineEmits<{ 'update:modelValue': [value: string[]] }>();

const { t } = useI18n();
const open = ref(false);

const ownerRefs = computed<EntityRef[]>(() =>
  props.modelValue.map((name) => ({
    name,
    type: 'user',
    fullyQualifiedName: name,
  })),
);

const summary = computed(() => {
  if (!props.modelValue.length) {
    return '';
  }
  return props.modelValue.map((name) => getEntityName({ name }) || name).join(', ');
});

function onOwnersUpdate(refs: EntityRef[]): void {
  const names = refs
    .map((ref) => ref.name ?? ref.fullyQualifiedName)
    .filter((name): name is string => Boolean(name));
  emit('update:modelValue', names);
}
</script>

<template>
  <Dropdown v-model:open="open" :trigger="['click']" placement="bottomLeft">
    <Button class="dq-dashboard__filter dq-dashboard__filter-trigger" :data-testid="testId ?? 'dq-dashboard-filter-owner'">
      <span class="dq-dashboard__filter-trigger-label">
        {{ t('label.owner') }}
        <template v-if="modelValue.length">
          :
          <span class="dq-dashboard__filter-trigger-value">{{ summary }}</span>
        </template>
      </span>
      <SmIcon icon-key="action-chevron-down" />
    </Button>
    <template #overlay>
      <div class="dq-dashboard__owner-picker" data-testid="dq-dashboard-owner-picker">
        <UserTeamPicker
          :model-value="ownerRefs"
          test-id="dq-dashboard-owner-user-team"
          @update:model-value="onOwnersUpdate"
        />
      </div>
    </template>
  </Dropdown>
</template>

<style scoped>
.dq-dashboard__filter-trigger {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  max-width: 280px;
}
.dq-dashboard__filter-trigger-label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.dq-dashboard__filter-trigger-value {
  font-weight: 600;
  color: var(--sm-color-primary);
}
.dq-dashboard__owner-picker {
  padding: 12px;
  width: 320px;
  background: var(--sm-color-bg-container, #fff);
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.08);
}
</style>