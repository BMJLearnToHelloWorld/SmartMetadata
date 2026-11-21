<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { Button, Select, Space, Tag, Typography, message } from 'ant-design-vue';
import { DeleteOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons-vue';
import type { EntityRef } from '@/types/api';
import {
  DEFAULT_RELATED_TO,
  MAX_VISIBLE_RELATED_BADGES,
  groupRelatedTerms,
  toRelationRows,
  toTermRelations,
  type TermRelationInput,
} from '@/governance/glossaryTermWidgets';

/**
 * RelatedTerms widget cell (D-2 batch 5a). Pin
 * `U/components/Glossary/GlossaryTerms/tabs/RelatedTerms.tsx:142`:
 * related terms grouped by relation type (at most 5 badges per group
 * before the show-more toggle), row click navigates to the term, and
 * an inline row editor with edit (replace all) and add (append one
 * row) modes. Relation types come from `listRelationshipTypes` with
 * the pin `relatedTo`-only fallback; term options are the sibling
 * terms (same source as the page-level edit modal). The caller owns
 * the gate (`has-edit-access`, P1 `isAdminUser || canEditGlossaryTerms`)
 * and the save.
 */
const props = defineProps<{
  relations: EntityRef[];
  relationTypes: Array<{ name: string; displayName?: string }>;
  termOptions: EntityRef[];
  hasEditAccess: boolean;
  onSave: (relations: TermRelationInput[]) => Promise<unknown>;
  onTermClick: (term: EntityRef) => void;
}>();

const { t } = useI18n();

interface EditRow {
  id: string;
  relationType: string;
  termKeys: string[];
}

const editing = ref(false);
const adding = ref(false);
const rows = ref<EditRow[]>([]);
const saving = ref(false);
const expandedGroups = ref<Record<string, boolean>>({});

const relationTypeOptions = computed(() =>
  props.relationTypes.length ? props.relationTypes : [DEFAULT_RELATED_TO],
);
const groups = computed(() => groupRelatedTerms(props.relations));

function displayNameFor(relationType: string): string {
  return (
    props.relationTypes.find((item) => item.name === relationType)?.displayName || relationType
  );
}

function termKey(term: EntityRef): string {
  return term.fullyQualifiedName || term.name;
}

function visibleTerms(group: { relationType: string; terms: EntityRef[] }): EntityRef[] {
  return expandedGroups.value[group.relationType]
    ? group.terms
    : group.terms.slice(0, MAX_VISIBLE_RELATED_BADGES);
}

function hiddenCount(group: { terms: EntityRef[] }): number {
  return group.terms.length - MAX_VISIBLE_RELATED_BADGES;
}

function toggleGroup(relationType: string): void {
  expandedGroups.value = {
    ...expandedGroups.value,
    [relationType]: !expandedGroups.value[relationType],
  };
}

function defaultRelationType(): string {
  return relationTypeOptions.value[0]?.name ?? 'relatedTo';
}

function startEditing(): void {
  const existing = toRelationRows(props.relations);
  rows.value =
    existing.length > 0
      ? existing.map((row) => ({
          id: row.id,
          relationType: row.relationType,
          termKeys: row.terms.map(termKey),
        }))
      : [{ id: '0', relationType: defaultRelationType(), termKeys: [] }];
  editing.value = true;
}

function startAdding(): void {
  rows.value = [{ id: String(Date.now()), relationType: defaultRelationType(), termKeys: [] }];
  adding.value = true;
}

function addRow(): void {
  rows.value = [
    ...rows.value,
    { id: String(Date.now()), relationType: defaultRelationType(), termKeys: [] },
  ];
}

function removeRow(rowId: string): void {
  rows.value = rows.value.filter((row) => row.id !== rowId);
}

function closeEditor(): void {
  editing.value = false;
  adding.value = false;
  rows.value = [];
}

function rowTerms(row: EditRow): EntityRef[] {
  return row.termKeys.map((key) => {
    const found = props.termOptions.find((term) => termKey(term) === key);
    return found ?? { name: key, fullyQualifiedName: key, type: 'glossaryTerm' };
  });
}

async function save(): Promise<void> {
  const next = toTermRelations(
    rows.value.map((row) => ({ relationType: row.relationType, terms: rowTerms(row) })),
  );
  const relations = adding.value
    ? [...toTermRelations(toRelationRows(props.relations)), ...next]
    : next;
  saving.value = true;
  try {
    await props.onSave(relations);
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
    <div v-if="!editing && !adding" class="widget-related-terms__view">
      <div v-for="group in groups" :key="group.relationType" class="widget-related-terms__group">
        <Typography.Text>{{ displayNameFor(group.relationType) }}</Typography.Text>
        <Space wrap>
          <Tag
            v-for="term in visibleTerms(group)"
            :key="termKey(term)"
            :data-testid="`related-term-${termKey(term)}`"
            style="cursor: pointer"
            @click="onTermClick(term)"
          >
            {{ term.displayName || term.name }}
          </Tag>
          <Button
            v-if="hiddenCount(group) > 0"
            type="link"
            size="small"
            :data-testid="`related-terms-toggle-${group.relationType}`"
            @click="toggleGroup(group.relationType)"
          >
            {{
              expandedGroups[group.relationType]
                ? t('terms.showLess')
                : t('terms.plusCount', { count: hiddenCount(group) })
            }}
          </Button>
        </Space>
      </div>
      <Typography.Text v-if="!relations.length && !hasEditAccess" type="secondary">—</Typography.Text>
      <div v-if="hasEditAccess" class="widget-related-terms__actions">
        <Button type="text" size="small" data-testid="edit-button" @click="startEditing">
          <EditOutlined />
        </Button>
        <Button type="text" size="small" data-testid="related-term-add-button" @click="startAdding">
          <PlusOutlined />
        </Button>
      </div>
    </div>
    <div v-else>
      <div v-if="adding" class="widget-related-terms__view">
        <div v-for="group in groups" :key="group.relationType" class="widget-related-terms__group">
          <Typography.Text>{{ displayNameFor(group.relationType) }}</Typography.Text>
          <Space wrap>
            <Tag v-for="term in visibleTerms(group)" :key="termKey(term)">
              {{ term.displayName || term.name }}
            </Tag>
          </Space>
        </div>
      </div>
      <div
        v-for="row in rows"
        :key="row.id"
        :data-testid="`relation-row-${row.id}`"
        class="widget-related-terms__row"
      >
        <Select
          v-model:value="row.relationType"
          :data-testid="`relation-type-${row.id}`"
          style="width: 180px"
        >
          <Select.Option
            v-for="option in relationTypeOptions"
            :key="option.name"
            :value="option.name"
          >
            {{ option.displayName || option.name }}
          </Select.Option>
        </Select>
        <Select
          v-model:value="row.termKeys"
          mode="multiple"
          allow-clear
          :data-testid="`term-picker-${row.id}`"
          :placeholder="t('terms.relatedTermSelectTerms')"
          style="flex: 1"
        >
          <Select.Option
            v-for="term in termOptions"
            :key="termKey(term)"
            :value="termKey(term)"
          >
            {{ term.displayName || term.name }}
          </Select.Option>
        </Select>
        <Button
          type="text"
          danger
          :data-testid="`remove-row-${row.id}`"
          @click="removeRow(row.id)"
        >
          <DeleteOutlined />
        </Button>
      </div>
      <div class="widget-related-terms__editor-actions">
        <Button type="link" size="small" @click="addRow">{{ t('terms.relatedTermAddRow') }}</Button>
        <span class="widget-related-terms__save-actions">
          <Button data-testid="cancel-related-terms" @click="closeEditor">{{ t('crud.cancel') }}</Button>
          <Button type="primary" data-testid="save-related-terms" :loading="saving" @click="save">
            {{ t('crud.save') }}
          </Button>
        </span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.widget-related-terms__view {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.widget-related-terms__group {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.widget-related-terms__actions {
  display: flex;
  gap: 4px;
}
.widget-related-terms__row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}
.widget-related-terms__editor-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 8px;
}
.widget-related-terms__save-actions {
  display: flex;
  gap: 8px;
}
</style>
