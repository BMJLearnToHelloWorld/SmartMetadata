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
import { isCertificationTag } from '@/ingestion/tierTags';
import type { AssetTagOption } from '@/types/governance';

/**
 * Shared certification widget cell (D-2 batch 2): the product port of
 * pin `CertificationWidget` — the certification is read from the
 * entity's standalone `certification` field (`{tagLabel}`), not from
 * tags (pin `CertificationWidget` / `CertificationPicker` →
 * `updateCertificationTag` → `onUpdate`). `hasEditAccess` is the
 * caller's already-derived gate (`isAdminUser ||
 * can('EditCertification')`); the cell never reads a permission
 * object. `onChange` receives the new certification tag FQN (or
 * `undefined` when cleared); it throws on failure so the cell keeps
 * the editor open. Tag-backed entities (Glossary / GlossaryTerm)
 * keep the tag-based read/write in `WidgetCertificationTagCell`
 * semantics — this cell is for field-backed entities (Domain,
 * DataProduct, Metric).
 */
const props = withDefaults(
  defineProps<{
    certificationTagFqn?: string;
    options: AssetTagOption[];
    hasEditAccess: boolean;
    onChange: (tagFqn?: string) => Promise<unknown> | unknown;
    testId?: string;
  }>(),
  { certificationTagFqn: undefined, testId: 'widget-certification-cell' },
);

const { t } = useI18n();
/** antd Select filter, repo pattern (UserTeamPicker): the option is a
 * DefaultOptionType, never a narrower local shape. */
function filterOption(input: string, option?: DefaultOptionType): boolean {
  const haystack = `${String(option?.label ?? '')} ${String(option?.value ?? '')}`.toLowerCase();
  return haystack.includes(input.toLowerCase());
}


const pickerOptions = computed(() =>
  props.options
    .filter((option) => isCertificationTag(option.tagFQN))
    .map((option) => ({ label: option.displayName || option.name, value: option.tagFQN })),
);

const currentName = computed(
  () =>
    props.options.find((option) => option.tagFQN === props.certificationTagFqn)?.displayName ||
    props.options.find((option) => option.tagFQN === props.certificationTagFqn)?.name,
);

const editOpen = ref(false);
const saving = ref(false);
const selected = ref<string | undefined>(undefined);

const editTitle = computed(() => t('label.edit-entity', { entity: t('label.certification') }));
const addTitle = computed(() => t('label.add-entity', { entity: t('label.certification') }));

function openEdit(): void {
  selected.value = props.certificationTagFqn;
  editOpen.value = true;
}

function onPickerChange(value: unknown): void {
  selected.value = typeof value === 'string' ? value : undefined;
}

async function saveCertification(): Promise<void> {
  saving.value = true;
  try {
    await props.onChange(selected.value || undefined);
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
      <Typography.Text v-if="currentName">{{ currentName }}</Typography.Text>
      <Typography.Text v-if="!currentName" type="secondary">—</Typography.Text>
      <Button
        v-if="hasEditAccess && !currentName"
        type="text"
        size="small"
        data-testid="add-certification"
        :title="addTitle"
        @click="openEdit"
      >
        <PlusOutlined />
      </Button>
      <Button
        v-if="hasEditAccess && currentName"
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
      @ok="saveCertification"
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
