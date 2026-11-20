<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { Button, Modal, Select, Space, Typography, message } from 'ant-design-vue';
import type { DefaultOptionType } from 'ant-design-vue/es/select';
import { PlusOutlined, EditOutlined } from '@ant-design/icons-vue';
import { getTierTag, isTierTag } from '@/ingestion/tierTags';
import { tagRefToInput, withTierTag, type TagLabelInput } from '@/governance/assetPatch';
import type { TagRef } from '@/types/api';
import type { AssetTagOption } from '@/types/governance';

/**
 * Shared tier widget cell (D-2 batch 2): the product port of pin
 * `TierWidget` — the tier is read from `tags` via `getTierTags`
 * (pin `TierWidget`); the edit popover (`TierCard` → `updateTierTag`)
 * becomes a Modal + single Select here. `hasEditAccess` is the
 * caller's already-derived gate (`isAdminUser || canEditTier`); the
 * cell never reads a permission object. `onTagsChange` receives the
 * full new tag list (old tier dropped, new tier appended, or cleared);
 * it throws on failure so the cell keeps the editor open.
 */
const props = withDefaults(
  defineProps<{
    tags: TagRef[];
    options: AssetTagOption[];
    hasEditAccess: boolean;
    onTagsChange: (tags: TagLabelInput[]) => Promise<unknown> | unknown;
    testId?: string;
  }>(),
  { testId: 'widget-tier-cell' },
);

const { t } = useI18n();
/** antd Select filter, repo pattern (UserTeamPicker): the option is a
 * DefaultOptionType, never a narrower local shape. */
function filterOption(input: string, option?: DefaultOptionType): boolean {
  const haystack = `${String(option?.label ?? '')} ${String(option?.value ?? '')}`.toLowerCase();
  return haystack.includes(input.toLowerCase());
}


const currentTier = computed(() => getTierTag(props.tags ?? []));

const pickerOptions = computed(() =>
  props.options
    .filter((option) => isTierTag(option.tagFQN))
    .map((option) => ({ label: option.displayName || option.name, value: option.tagFQN })),
);

const editOpen = ref(false);
const saving = ref(false);
const selected = ref<string | undefined>(undefined);

const editTitle = computed(() => t('label.edit-entity', { entity: t('label.tier') }));
const addTitle = computed(() => t('label.add-entity', { entity: t('label.tier') }));

function openEdit(): void {
  selected.value = currentTier.value?.tagFQN;
  editOpen.value = true;
}

function onPickerChange(value: unknown): void {
  selected.value = typeof value === 'string' ? value : undefined;
}

async function saveTier(): Promise<void> {
  saving.value = true;
  try {
    const picked = props.options.find((option) => option.tagFQN === selected.value);
    const next = withTierTag(
      (props.tags ?? []).map((tag) => tagRefToInput(tag)),
      picked ? { tagFQN: picked.tagFQN, name: picked.name, source: picked.source ?? 'Classification' } : undefined,
    );
    await props.onTagsChange(next);
    editOpen.value = false;
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('crud.loadFailed'));
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <div :data-testid="testId">
    <Space>
      <Typography.Text v-if="currentTier">{{ currentTier.name }}</Typography.Text>
      <Typography.Text v-if="!currentTier" type="secondary">—</Typography.Text>
      <Button
        v-if="hasEditAccess && !currentTier"
        type="text"
        size="small"
        data-testid="add-tier"
        :title="addTitle"
        @click="openEdit"
      >
        <PlusOutlined />
      </Button>
      <Button
        v-if="hasEditAccess && currentTier"
        type="text"
        size="small"
        data-testid="edit-button"
        :title="editTitle"
        @click="openEdit"
      >
        <EditOutlined />
      </Button>
    </Space>
    <Modal
      :open="editOpen"
      :title="editTitle"
      :mask-closable="false"
      :keyboard="false"
      :closable="false"
      :confirm-loading="saving"
      :ok-text="t('crud.save')"
      :cancel-text="t('crud.cancel')"
      @ok="saveTier"
      @cancel="editOpen = false"
    >
      <Select
        :value="selected" @change="onPickerChange"
        allow-clear
        show-search
        style="width: 100%"
        :placeholder="addTitle"
        :options="pickerOptions"
        :filter-option="filterOption"
      />
    </Modal>
  </div>
</template>
