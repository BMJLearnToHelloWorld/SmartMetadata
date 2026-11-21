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
import { ownerKey, type OwnerOption } from '@/governance/catalogOptions';
import type { EntityRef } from '@/types/api';

/**
 * Shared entity-ref-list cell (D-2 batch 2): the common leaf behind
 * `WidgetOwnersCell`, `WidgetExpertsCell` and `WidgetReviewerCell`.
 * Pin shape kept: read render is the ref display names joined by
 * commas (pin `OwnerWidget`/`DomainExpertWidget`/`ReviewerLabelV2`
 * render a read-only list plus an edit affordance), an add (+) button
 * when empty and permitted, an edit (pencil) button when non-empty
 * and permitted, and a Modal + multi-Select that commits the whole
 * new selection. `hasEditAccess` is the caller's already-derived gate
 * (`isAdminUser || canEditOwners`, etc.); the cell never reads a
 * permission object. `onChange` receives the new owner list
 * (`{id, type}[]`); it throws on failure so the cell keeps the editor
 * open. `entityLabelKey` supplies the `label.add-entity` /
 * `label.edit-entity` entity word (`label.owner-plural`,
 * `label.expert-plural`, `label.reviewer-plural`).
 */
const props = withDefaults(
  defineProps<{
    refs: EntityRef[];
    options: OwnerOption[];
    hasEditAccess: boolean;
    entityLabelKey: string;
    /** Pin `DomainExpertWidget` / `ReviewerLabelV2` offer users only. */
    userOnly?: boolean;
    onChange: (owners: Array<{ id: string; type: 'user' | 'team' }>) => Promise<unknown> | unknown;
    testId?: string;
  }>(),
  { userOnly: false, testId: 'widget-ref-list-cell' },
);

const { t } = useI18n();
/** antd Select filter, repo pattern (UserTeamPicker): the option is a
 * DefaultOptionType, never a narrower local shape. */
function filterOption(input: string, option?: DefaultOptionType): boolean {
  const haystack = `${String(option?.label ?? '')} ${String(option?.value ?? '')}`.toLowerCase();
  return haystack.includes(input.toLowerCase());
}


/** Missing ref lists render as empty (`—`): the old read render
 * (`joinRefNames`) tolerated an absent array, and a cell must never
 * crash on partial payload data. */
const refs = computed(() => props.refs ?? []);

const pickerOptions = computed(() =>
  props.options
    .filter((option) => !props.userOnly || option.type === 'user')
    .map((option) => ({ label: option.label, value: ownerKey(option.id, option.type) })),
);

const editOpen = ref(false);
const saving = ref(false);
const selected = ref<string[]>([]);

const editTitle = computed(() => t('label.edit-entity', { entity: t(props.entityLabelKey) }));
const addTitle = computed(() => t('label.add-entity', { entity: t(props.entityLabelKey) }));

function displayName(refItem: EntityRef): string {
  return refItem.displayName || refItem.name;
}

function openEdit(): void {
  // Refs without an id cannot be re-selected; drop them instead of
  // passing `undefined` into the picker key.
  selected.value = refs.value
    .filter((refItem): refItem is EntityRef & { id: string } => refItem.id !== undefined)
    .map((refItem) => ownerKey(refItem.id, refItem.type === 'team' ? 'team' : 'user'));
  editOpen.value = true;
}

function onPickerChange(value: unknown): void {
  selected.value = Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

async function saveRefs(): Promise<void> {
  saving.value = true;
  try {
    const owners: Array<{ id: string; type: 'user' | 'team' }> = selected.value.flatMap((key) => {
      const option = props.options.find((candidate) => ownerKey(candidate.id, candidate.type) === key);
      return option ? [{ id: option.id, type: option.type }] : [];
    });
    await props.onChange(owners);
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
    <Space wrap>
      <Typography.Text v-if="refs.length">{{ refs.map(displayName).join(', ') }}</Typography.Text>
      <Typography.Text v-if="!refs.length" type="secondary">—</Typography.Text>
      <Button
        v-if="hasEditAccess && !refs.length"
        type="text"
        size="small"
        data-testid="add-ref"
        :title="addTitle"
        @click="openEdit"
      >
        <PlusOutlined />
      </Button>
      <Button
        v-if="hasEditAccess && refs.length"
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
      @ok="saveRefs"
      @cancel="editOpen = false"
    >
      <Select
        :value="selected" @change="onPickerChange"
        mode="multiple"
        show-search
        style="width: 100%"
        :placeholder="addTitle"
        :options="pickerOptions"
        :filter-option="filterOption"
      />
    </Modal>
  </div>
</template>
