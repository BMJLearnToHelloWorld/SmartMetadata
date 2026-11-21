<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { Button, Input, Space, Tag, Typography, message } from 'ant-design-vue';
import { EditOutlined, PlusOutlined } from '@ant-design/icons-vue';
import {
  MAX_VISIBLE_SYNONYMS,
  findDuplicateSynonym,
  normalizeSynonyms,
} from '@/governance/glossaryTermWidgets';

/**
 * Synonyms widget cell (D-2 batch 5a). Pin
 * `U/components/Glossary/GlossaryTerms/tabs/GlossaryTermSynonyms.tsx:62`:
 * badges + free-text inline editor, case-insensitive duplicate
 * rejection, show more/less past MAX_VISIBLE_SYNONYMS (6), save only
 * when changed. The caller owns the gate (`has-edit-access`, P1
 * `isAdminUser || canEditAll`) and the save; a failed save shows an
 * error toast and keeps the editor open.
 */
const props = defineProps<{
  synonyms: string[];
  hasEditAccess: boolean;
  onSave: (synonyms: string[]) => Promise<unknown>;
}>();

const { t } = useI18n();

const editing = ref(false);
const draft = ref<string[]>([]);
const inputValue = ref('');
const duplicate = ref<string | undefined>(undefined);
const saving = ref(false);
const expanded = ref(false);

const savedSynonyms = computed(() => normalizeSynonyms(props.synonyms));
/** View mode shows the saved list; edit mode shows the draft. */
const shownSynonyms = computed(() => (editing.value ? draft.value : savedSynonyms.value));
const visibleSynonyms = computed(() =>
  expanded.value ? shownSynonyms.value : shownSynonyms.value.slice(0, MAX_VISIBLE_SYNONYMS),
);
const hiddenCount = computed(() => shownSynonyms.value.length - MAX_VISIBLE_SYNONYMS);
const changed = computed(
  () => JSON.stringify(draft.value) !== JSON.stringify(savedSynonyms.value),
);

function openEditor(): void {
  draft.value = [...savedSynonyms.value];
  inputValue.value = '';
  duplicate.value = undefined;
  expanded.value = false;
  editing.value = true;
}

function closeEditor(): void {
  duplicate.value = undefined;
  expanded.value = false;
  editing.value = false;
}

function addSynonym(): void {
  const value = inputValue.value.trim();
  if (!value) {
    return;
  }
  const existing = findDuplicateSynonym(draft.value, value);
  if (existing) {
    duplicate.value = existing;
    return;
  }
  duplicate.value = undefined;
  draft.value = [...draft.value, value];
  inputValue.value = '';
}

function removeSynonym(synonym: string): void {
  duplicate.value = undefined;
  draft.value = draft.value.filter((item) => item !== synonym);
}

function cancel(): void {
  draft.value = [...savedSynonyms.value];
  closeEditor();
}

async function save(): Promise<void> {
  if (!changed.value) {
    closeEditor();
    return;
  }
  saving.value = true;
  try {
    await props.onSave(draft.value);
    closeEditor();
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('crud.updateFailed'));
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <div>
    <div v-if="!editing" class="widget-synonyms__view">
      <Space wrap>
        <Tag v-for="synonym in visibleSynonyms" :key="synonym">{{ synonym }}</Tag>
        <Button
          v-if="hiddenCount > 0"
          type="link"
          size="small"
          data-testid="synonyms-show-more-btn"
          @click="expanded = !expanded"
        >
          {{ expanded ? t('terms.showLess') : t('terms.plusCount', { count: hiddenCount }) }}
        </Button>
        <Typography.Text v-if="!savedSynonyms.length && !hasEditAccess" type="secondary">—</Typography.Text>
      </Space>
      <Button
        v-if="hasEditAccess"
        type="text"
        size="small"
        :data-testid="savedSynonyms.length ? 'edit-button' : 'synonym-add-button'"
        @click="openEditor"
      >
        <PlusOutlined v-if="!savedSynonyms.length" />
        <EditOutlined v-else />
      </Button>
    </div>
    <div v-else class="widget-synonyms__editor">
      <Space wrap>
        <Tag
          v-for="synonym in draft"
          :key="synonym"
          closable
          :data-testid="`remove-synonym-${synonym}`"
          @close="removeSynonym(synonym)"
        >
          {{ synonym }}
        </Tag>
      </Space>
      <div class="widget-synonyms__input-row">
        <Input
          v-model:value="inputValue"
          data-testid="synonyms-select"
          :placeholder="t('terms.synonymPlaceholder')"
          @press-enter="addSynonym"
        />
        <Button data-testid="synonym-add-btn" @click="addSynonym">{{ t('terms.addSynonym') }}</Button>
      </div>
      <Typography.Text v-if="duplicate" type="danger" data-testid="synonym-duplicate-hint">
        {{ t('terms.synonymDuplicate') }}
      </Typography.Text>
      <div class="widget-synonyms__footer">
        <Typography.Text v-if="changed" type="secondary">{{ t('terms.unsavedChanges') }}</Typography.Text>
        <span class="widget-synonyms__footer-actions">
          <Button data-testid="cancel-synonym-btn" @click="cancel">{{ t('crud.cancel') }}</Button>
          <Button type="primary" data-testid="save-synonym-btn" :loading="saving" @click="save">
            {{ t('crud.save') }}
          </Button>
        </span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.widget-synonyms__view {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
}
.widget-synonyms__input-row {
  display: flex;
  gap: 8px;
  margin-top: 8px;
}
.widget-synonyms__footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 12px;
}
.widget-synonyms__footer-actions {
  display: flex;
  gap: 8px;
  margin-left: auto;
}
</style>
