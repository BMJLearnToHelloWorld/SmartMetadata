<!--
  Copyright 2026 SmartMetadata authors.

  Licensed under the Apache License, Version 2.0 (the "License");
  you may not use this file except in compliance with the License.
  You may obtain a copy of the License at

      http://www.apache.org/licenses/LICENSE-2.0
-->
<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { Button, Form, Input, Select } from 'ant-design-vue';
import type { SelectValue } from 'ant-design-vue/es/select';
import FormModal from '@/components/shared/FormModal.vue';
import AsyncEntitySelect, {
  type AsyncSelectOption,
} from '@/components/shared/AsyncEntitySelect.vue';
import { confirmDelete } from '@/features/crud/confirmDelete';
import { searchAssets } from '@/api/search';
import {
  MEMORY_TYPE_OPTIONS,
  VISIBILITY_OPTIONS,
  buildMemoryFormState,
  type MemoryCreateInput,
  type MemoryEditInput,
} from '@/catalog/contextCenterMemories';
import type { ContextMemory, ContextMemoryType, ShareVisibility } from '@/types/contextCenter';
import type { EntityRef, TagRef } from '@/types/api';
import { fetchTagOptions } from '@/utils/conditionBuilderValueFetchers';

const { t } = useI18n();

const props = defineProps<{
  open: boolean;
  memoryToEdit?: ContextMemory | null;
  canDelete?: boolean;
}>();

const emit = defineEmits<{
  ok: [value: MemoryCreateInput];
  save: [value: { id: string; input: MemoryEditInput }];
  delete: [id: string];
  cancel: [];
  'update:open': [open: boolean];
}>();

const MEMORY_TYPE_LABEL_KEYS: Record<ContextMemoryType, string> = {
  FAQ: 'contextCenter.memoryTypeFaq',
  Note: 'contextCenter.memoryTypeNote',
  Preference: 'contextCenter.memoryTypePreference',
  Runbook: 'contextCenter.memoryTypeRunbook',
  UseCase: 'contextCenter.memoryTypeUseCase',
  Learning: 'contextCenter.memoryTypeLearning',
};

const VISIBILITY_LABEL_KEYS: Record<ShareVisibility, string> = {
  Public: 'contextCenter.visibilityPublic',
  Shared: 'contextCenter.visibilityShared',
  Entity: 'contextCenter.visibilityEntity',
  Private: 'contextCenter.visibilityPrivate',
};

const form = reactive({
  title: '',
  memory: '',
  memoryType: null as ContextMemoryType | null,
  visibility: 'Private' as ShareVisibility,
  tagFqns: [] as string[],
  assetIds: [] as string[],
});

// Full tag refs behind the selected FQNs: seeded from the edited memory so
// an untouched tag list diffs to no-op; new FQNs carry their last segment
// as the name (the server resolves tags by FQN).
const selectedTags = ref<TagRef[]>([]);
// Full entity refs behind the selected asset ids, seeded from the edited
// memory and from search hits as they arrive.
const assetRefById = new Map<string, EntityRef>();

const typeOptions = computed(() =>
  MEMORY_TYPE_OPTIONS.map((id) => ({ value: id, label: t(MEMORY_TYPE_LABEL_KEYS[id]) })),
);
const visibilityOptions = computed(() =>
  VISIBILITY_OPTIONS.map((id) => ({ value: id, label: t(VISIBILITY_LABEL_KEYS[id]) })),
);

const tagSeedOptions = computed<AsyncSelectOption[]>(() =>
  selectedTags.value.map((tag) => ({
    value: tag.tagFQN,
    label: tag.name || tag.tagFQN,
  })),
);
const assetSeedOptions = computed<AsyncSelectOption[]>(() =>
  form.assetIds.flatMap((id) => {
    const ref = assetRefById.get(id);
    return ref ? [{ value: id, label: ref.displayName || ref.name || id }] : [];
  }),
);

async function fetchAssetOptions(term: string): Promise<AsyncSelectOption[]> {
  const page = await searchAssets(term, 0, 25);
  return page.hits.flatMap((hit) => {
    if (!hit.id) {
      return [];
    }
    assetRefById.set(hit.id, {
      id: hit.id,
      type: hit.entityType,
      name: hit.name,
      displayName: hit.displayName,
      fullyQualifiedName: hit.fullyQualifiedName,
    });
    return [{ value: hit.id, label: hit.displayName || hit.name || hit.fullyQualifiedName }];
  });
}

/**
 * antd Select emits SelectValue (RawValue | LabeledValue, single or array);
 * this single select only ever carries a plain ContextMemoryType value,
 * so normalise to ContextMemoryType | null here (clear means null).
 */
function onMemoryTypeChange(value: SelectValue): void {
  const next = Array.isArray(value) ? value[0] : value;
  form.memoryType =
    next === undefined
      ? null
      : (typeof next === 'object' && next !== null ? String(next.value) : String(next)) as ContextMemoryType;
}

function onTagChange(fqns: string | string[] | null): void {
  const next = Array.isArray(fqns) ? fqns : [];
  form.tagFqns = next;
  selectedTags.value = next.map(
    (fqn) =>
      selectedTags.value.find((tag) => tag.tagFQN === fqn) ?? {
        tagFQN: fqn,
        name: fqn.split('.').pop() ?? fqn,
      },
  );
}

function resetForm(): void {
  if (props.memoryToEdit) {
    const state = buildMemoryFormState(props.memoryToEdit);
    form.title = state.title;
    form.memory = state.memory;
    form.memoryType = state.memoryType ?? null;
    form.visibility = state.visibility;
    form.tagFqns = state.tagFqns;
    form.assetIds = state.assets.map((asset) => asset.id ?? '').filter(Boolean);
    selectedTags.value = [...(props.memoryToEdit.tags ?? [])];
    assetRefById.clear();
    for (const asset of state.assets) {
      if (asset.id) {
        assetRefById.set(asset.id, asset);
      }
    }
    return;
  }
  form.title = '';
  form.memory = '';
  form.memoryType = null;
  form.visibility = 'Private';
  form.tagFqns = [];
  form.assetIds = [];
  selectedTags.value = [];
  assetRefById.clear();
}

watch(
  () => props.open,
  (open) => {
    if (open) {
      resetForm();
    }
  },
);

function linkedAssets(): { primaryEntity?: EntityRef; relatedEntities: EntityRef[] } {
  const refs = form.assetIds.flatMap((id) => {
    const ref = assetRefById.get(id);
    return ref ? [ref] : [];
  });
  return { primaryEntity: refs[0], relatedEntities: refs.slice(1) };
}

function onOk(): void {
  const { primaryEntity, relatedEntities } = linkedAssets();
  if (props.memoryToEdit) {
    emit('save', {
      id: props.memoryToEdit.id,
      input: {
        title: form.title,
        memory: form.memory,
        memoryType: form.memoryType ?? undefined,
        visibility: form.visibility,
        tags: selectedTags.value,
        primaryEntity,
        relatedEntities,
      },
    });
    return;
  }
  emit('ok', {
    title: form.title.trim() ? form.title : undefined,
    memory: form.memory,
    memoryType: form.memoryType ?? undefined,
    visibility: form.visibility,
    tags: selectedTags.value,
    primaryEntity,
    relatedEntities,
  });
}

async function onDelete(): Promise<void> {
  if (!props.memoryToEdit) {
    return;
  }
  const confirmed = await confirmDelete({
    title: t('contextCenter.deleteMemory'),
    content:
      props.memoryToEdit.title || props.memoryToEdit.question || props.memoryToEdit.id,
    okText: t('crud.delete'),
    cancelText: t('crud.cancel'),
  });
  if (confirmed) {
    emit('delete', props.memoryToEdit.id);
  }
}
</script>

<template>
  <FormModal
    :open="open"
    :title="memoryToEdit ? t('contextCenter.editMemory') : t('contextCenter.createMemory')"
    :ok-disabled="!form.memory.trim()"
    test-id="memory-form-modal"
    @ok="onOk"
    @cancel="emit('cancel')"
    @update:open="emit('update:open', $event)"
  >
    <Form layout="vertical">
      <Form.Item :label="t('contextCenter.title')">
        <Input
          v-model:value="form.title"
          data-testid="memory-form-title"
          :placeholder="t('contextCenter.title')"
        />
      </Form.Item>
      <Form.Item :label="t('contextCenter.memory')" required>
        <Input.TextArea
          v-model:value="form.memory"
          data-testid="memory-form-memory"
          :rows="3"
        />
      </Form.Item>
      <Form.Item :label="t('contextCenter.memoryType')">
        <Select
          :value="form.memoryType ?? undefined"
          data-testid="memory-form-type"
          :options="typeOptions"
          allow-clear
          :placeholder="t('contextCenter.memoryType')"
          @change="onMemoryTypeChange"
        />
      </Form.Item>
      <Form.Item :label="t('contextCenter.visibility')">
        <Select
          v-model:value="form.visibility"
          data-testid="memory-form-visibility"
          :options="visibilityOptions"
        />
      </Form.Item>
      <Form.Item :label="t('contextCenter.tags')">
        <AsyncEntitySelect
          :model-value="form.tagFqns"
          multiple
          :fetch-options="fetchTagOptions"
          :seed-options="tagSeedOptions"
          test-id="memory-form-tags"
          :placeholder="t('contextCenter.searchTagPlaceholder')"
          @update:model-value="onTagChange"
        />
      </Form.Item>
      <Form.Item :label="t('contextCenter.linkedAssets')">
        <AsyncEntitySelect
          :model-value="form.assetIds"
          multiple
          :fetch-options="fetchAssetOptions"
          :seed-options="assetSeedOptions"
          test-id="memory-form-assets"
          :placeholder="t('contextCenter.searchAssetPlaceholder')"
          @update:model-value="(value: string | string[] | null) => { form.assetIds = Array.isArray(value) ? value : []; }"
        />
      </Form.Item>
      <Button
        v-if="memoryToEdit && canDelete"
        danger
        data-testid="memory-form-delete"
        @click="onDelete"
      >
        {{ t('crud.delete') }}
      </Button>
    </Form>
  </FormModal>
</template>
