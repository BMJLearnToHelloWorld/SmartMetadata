<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { Button, Modal, Select, Space, Tag, Typography, message } from 'ant-design-vue';
import type { DefaultOptionType } from 'ant-design-vue/es/select';
import { PlusOutlined, EditOutlined, StarOutlined } from '@ant-design/icons-vue';
import { isCertificationTag, isTierTag } from '@/ingestion/tierTags';
import { tagRefToInput, type TagLabelInput } from '@/governance/assetPatch';
import type { TagRef } from '@/types/api';
import type { AssetTagOption, TagSource } from '@/types/governance';

/**
 * Shared tags / glossary-terms widget cell (D-2 batch 2): the product
 * port of pin `TagsContainerV2` as used by `TagsWidget` (tagType
 * Classification) and `GlossaryWidget` (tagType Glossary).
 *
 * Pin shape kept: the cell shows only this source's labels (tier split
 * off — the tier has its own cell), an add (+) button when empty and
 * permitted, an edit (pencil) button when non-empty and permitted, and
 * a picker that commits the whole new selection for this source merged
 * with the other source's labels untouched. The pin popover picker is
 * an antd Modal + multi-Select here (the product has no popover
 * picker); the staged-commit semantics are the same.
 *
 * `hasEditAccess` is the caller's already-derived gate (`isAdminUser ||
 * canEditTags` / `canEditGlossaryTerms`); the cell never reads a
 * permission object. `onTagsChange` receives the full new tag list
 * (both sources, tier included) as `TagLabelInput`s; it throws on
 * failure so the cell keeps the editor open.
 *
 * `maxVisible` caps the displayed chips (pin `GlossaryTermsSection`
 * `maxVisibleGlossaryTerms={3}`): the rest hide behind a "+N more" /
 * "Show Less" toggle. The cap is display-only — the edit picker still
 * seeds from the full source list and the save merge still carries
 * every label. Unset means show all (the detail pages' behaviour).
 */
const props = withDefaults(
  defineProps<{
    tags: TagRef[];
    tagType: TagSource;
    options: AssetTagOption[];
    hasEditAccess: boolean;
    /** Pin `multiSelect` (GlossaryWidget: entityRules.canAddMultipleGlossaryTerm). */
    multiple?: boolean;
    /** Display cap; see the doc above. */
    maxVisible?: number;
    onTagsChange: (tags: TagLabelInput[]) => Promise<unknown> | unknown;
    testId?: string;
  }>(),
  { multiple: true, testId: 'widget-tags-cell' },
);

const { t } = useI18n();
/** antd Select filter, repo pattern (UserTeamPicker): the option is a
 * DefaultOptionType, never a narrower local shape. */
function filterOption(input: string, option?: DefaultOptionType): boolean {
  const haystack = `${String(option?.label ?? '')} ${String(option?.value ?? '')}`.toLowerCase();
  return haystack.includes(input.toLowerCase());
}


const isGlossary = computed(() => props.tagType === 'Glossary');

/**
 * Displayed labels: this source only. For Classification the tier and
 * certification labels are split off (pin `useTierSplit` + the
 * dedicated Tier/Certification cells); they stay in `tags` and are
 * preserved untouched by the save merge below.
 */
const sourceTags = computed(() =>
  (props.tags ?? []).filter((tag) => {
    if (tag.source !== props.tagType) {
      return false;
    }
    if (props.tagType === 'Classification' && (isTierTag(tag.tagFQN) || isCertificationTag(tag.tagFQN))) {
      return false;
    }
    return true;
  }),
);

const pickerOptions = computed(() =>
  props.options
    .filter((option) => {
      if (option.source !== props.tagType) {
        return false;
      }
      if (props.tagType === 'Classification' && (isTierTag(option.tagFQN) || isCertificationTag(option.tagFQN))) {
        return false;
      }
      return true;
    })
    .map((option) => ({ label: option.displayName || option.name, value: option.tagFQN })),
);

const editOpen = ref(false);
const saving = ref(false);
const selected = ref<string[]>([]);

/** Pin `GlossaryTermsSection` overflow: first `maxVisible` chips, the rest behind a toggle. */
const showAll = ref(false);
const visibleTags = computed(() =>
  showAll.value || props.maxVisible === undefined
    ? sourceTags.value
    : sourceTags.value.slice(0, props.maxVisible),
);
/** Labels past the cap, whether or not they are currently revealed. */
const hiddenCount = computed(() =>
  props.maxVisible === undefined
    ? 0
    : Math.max(0, sourceTags.value.length - props.maxVisible),
);
// New data collapses the list again (pin remounts the section per entity id + tag count).
watch(
  () => props.tags,
  () => {
    showAll.value = false;
  },
);

const editTitle = computed(() =>
  t('label.edit-entity', {
    entity: isGlossary.value ? t('label.glossary-term') : t('label.tag-plural'),
  }),
);
const addTitle = computed(() =>
  t('label.add-entity', {
    entity: isGlossary.value ? t('label.glossary-term') : t('label.tag-plural'),
  }),
);

function isGeneratedTag(tag: TagRef): boolean {
  return tag.labelType === 'Generated';
}

function openEdit(): void {
  selected.value = sourceTags.value.map((tag) => tag.tagFQN);
  editOpen.value = true;
}

function onPickerChange(value: unknown): void {
  selected.value = Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

async function saveTags(): Promise<void> {
  saving.value = true;
  try {
    // Merge rule (pin TagsContainerV2 + onSchemaTagChange): the write
    // carries the full tag list — the edited source's new selection
    // plus every label that is not part of this cell's displayed set
    // (other source, tier, certification) untouched, with labelType /
    // state preserved from the stored label.
    const displayedFqns = new Set(sourceTags.value.map((tag) => tag.tagFQN));
    const kept = (props.tags ?? [])
      .filter((tag) => !displayedFqns.has(tag.tagFQN))
      .map((tag) => tagRefToInput(tag));
    const picked: TagLabelInput[] = selected.value.flatMap((fqn) => {
      const existing = (props.tags ?? []).find((tag) => tag.tagFQN === fqn);
      const fromOptions = props.options.find((option) => option.tagFQN === fqn);
      if (fromOptions) {
        return [{ ...fromOptions, labelType: existing?.labelType, state: existing?.state }];
      }
      if (existing) {
        return [tagRefToInput(existing)];
      }
      return [];
    });
    await props.onTagsChange([...kept, ...picked]);
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
      <Tag
        v-for="tag in visibleTags"
        :key="tag.tagFQN"
        :class="isGeneratedTag(tag) ? 'asset-overview__generated-tag' : undefined"
      >
        <StarOutlined v-if="isGeneratedTag(tag)" class="asset-overview__generated-tag-icon" />
        {{ tag.name }}
      </Tag>
      <Button
        v-if="hiddenCount > 0 && !showAll"
        type="link"
        size="small"
        data-testid="show-more-tags"
        @click="showAll = true"
      >
        {{ t('label.show-more-count', { count: hiddenCount }) }}
      </Button>
      <Button
        v-if="hiddenCount > 0 && showAll"
        type="link"
        size="small"
        data-testid="show-less-tags"
        @click="showAll = false"
      >
        {{ t('label.show-less') }}
      </Button>
      <Typography.Text v-if="!sourceTags.length" type="secondary">—</Typography.Text>
      <Button
        v-if="hasEditAccess && !sourceTags.length"
        type="text"
        size="small"
        data-testid="add-tag"
        :title="addTitle"
        @click="openEdit"
      >
        <PlusOutlined />
      </Button>
      <Button
        v-if="hasEditAccess && sourceTags.length"
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
      @ok="saveTags"
      @cancel="editOpen = false"
    >
      <Select
        :value="selected" @change="onPickerChange"
        :mode="multiple ? 'multiple' : undefined"
        show-search
        style="width: 100%"
        :placeholder="addTitle"
        :options="pickerOptions"
        :filter-option="filterOption"
      />
    </Modal>
  </div>
</template>

<style scoped>
.asset-overview__generated-tag.ant-tag {
  color: var(--sm-color-primary);
  background: var(--sm-color-primary-bg);
  border-color: var(--sm-color-primary-50);
}

.asset-overview__generated-tag-icon {
  font-size: 12px;
  margin-inline-end: 4px;
}
</style>
