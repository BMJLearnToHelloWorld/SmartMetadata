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
import { getCertificationTag, isCertificationTag } from '@/ingestion/tierTags';
import { tagRefToInput, withCertificationTag, type TagLabelInput } from '@/governance/assetPatch';
import type { TagRef } from '@/types/api';
import type { AssetTagOption } from '@/types/governance';

/**
 * Tag-backed certification widget cell (D-2 batch 2): the same pin
 * `CertificationWidget` shape as `WidgetCertificationCell`, for the
 * entities whose spec carries no `certification` field (Glossary,
 * GlossaryTerm) — the certification lives as a `Certification.*` tag
 * in `tags` there, so the cell reads it via `getCertificationTag`
 * and saves by replacing that tag (`withCertificationTag`) through
 * the tag-list save. `hasEditAccess` is the caller's already-derived
 * gate (`isAdminUser || can('EditCertification')`); the cell never
 * reads a permission object. `onTagsChange` receives the full new tag
 * list; it throws on failure so the cell keeps the editor open.
 */
const props = withDefaults(
  defineProps<{
    tags: TagRef[];
    options: AssetTagOption[];
    hasEditAccess: boolean;
    onTagsChange: (tags: TagLabelInput[]) => Promise<unknown> | unknown;
    testId?: string;
  }>(),
  { testId: 'widget-certification-tag-cell' },
);

const { t } = useI18n();
/** antd Select filter, repo pattern (UserTeamPicker): the option is a
 * DefaultOptionType, never a narrower local shape. */
function filterOption(input: string, option?: DefaultOptionType): boolean {
  const haystack = `${String(option?.label ?? '')} ${String(option?.value ?? '')}`.toLowerCase();
  return haystack.includes(input.toLowerCase());
}


const currentCertification = computed(() => getCertificationTag(props.tags ?? []));

const pickerOptions = computed(() =>
  props.options
    .filter((option) => isCertificationTag(option.tagFQN))
    .map((option) => ({ label: option.displayName || option.name, value: option.tagFQN })),
);

const editOpen = ref(false);
const saving = ref(false);
const selected = ref<string | undefined>(undefined);

const editTitle = computed(() => t('label.edit-entity', { entity: t('label.certification') }));
const addTitle = computed(() => t('label.add-entity', { entity: t('label.certification') }));

function onPickerChange(value: unknown): void {
  selected.value = typeof value === 'string' ? value : undefined;
}

function openEdit(): void {
  selected.value = currentCertification.value?.tagFQN;
  editOpen.value = true;
}

async function saveCertification(): Promise<void> {
  saving.value = true;
  try {
    const picked = props.options.find((option) => option.tagFQN === selected.value);
    const next = withCertificationTag(
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
      <Typography.Text v-if="currentCertification">{{ currentCertification.name }}</Typography.Text>
      <Typography.Text v-if="!currentCertification" type="secondary">—</Typography.Text>
      <Button
        v-if="hasEditAccess && !currentCertification"
        type="text"
        size="small"
        data-testid="add-certification"
        :title="addTitle"
        @click="openEdit"
      >
        <PlusOutlined />
      </Button>
      <Button
        v-if="hasEditAccess && currentCertification"
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
        :value="selected"
        allow-clear
        show-search
        style="width: 100%"
        :placeholder="addTitle"
        :options="pickerOptions"
        :filter-option="filterOption"
        @change="onPickerChange"
      />
    </Modal>
  </div>
</template>
