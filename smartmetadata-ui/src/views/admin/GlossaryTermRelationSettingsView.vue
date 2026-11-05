<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { Alert, Button, Card, Checkbox, Form, Input, Pagination, Select, Space, Spin, Tag, Typography, message } from 'ant-design-vue';
import PageHeader from '@/components/shared/PageHeader.vue';
import SmTable from '@/components/shared/SmTable.vue';
import FormModal from '@/components/shared/FormModal.vue';
import ForbiddenView from '@/views/shell/ForbiddenView.vue';
import {
  createRelationshipType,
  deleteRelationshipType,
  getRelationTypeUsageCounts,
  listAllRelationshipTypes,
  updateRelationshipType,
  type RelationshipCharacteristic,
  type RelationshipType,
} from '@/api/relationshipTypes';
import { confirmDelete } from '@/features/crud/confirmDelete';
import {
  DEFAULT_RELATIONSHIP_TYPE_FORM,
  deriveCardinalityPreset,
  toRelationshipTypeForm,
  toRelationshipTypeRequest,
  validateRelationshipTypeForm,
  type CardinalityPreset,
  type RelationshipTypeFormErrors,
  type RelationshipTypeFormValues,
} from '@/features/settings/relationshipTypeForm';
import { useAuthStore } from '@/stores/auth';

/**
 * Glossary-term relation settings (A14). Official shape
 * (openmetadata-ui/.../pages/GlossaryTermRelationSettings/): an
 * AdminProtectedRoute settings page listing relationship types with
 * their usage counts, a create/edit form with the official validation
 * rules, edit blocked for system-defined types, and delete blocked for
 * system-defined or in-use types (hardDelete=true). The product form
 * lives in a modal rather than official's slideout drawer — the
 * product's established form surface — with identical fields and
 * validation; owners/reviewers pass through unedited, as official's
 * form does not edit them either.
 */
const { t } = useI18n();
const authStore = useAuthStore();

const isAdmin = computed(() => authStore.user?.isAdmin === true);
const loading = ref(false);
const saving = ref(false);
const errorMessage = ref('');
const relationshipTypes = ref<RelationshipType[]>([]);
const usageCounts = ref<Record<string, number>>({});
const currentPage = ref(1);
const pageSize = ref(10);

const formOpen = ref(false);
const editing = ref<RelationshipType | undefined>();
const formValues = reactive<RelationshipTypeFormValues>({ ...DEFAULT_RELATIONSHIP_TYPE_FORM });
const formErrors = ref<RelationshipTypeFormErrors>({});

const sortedTypes = computed(() =>
  [...relationshipTypes.value].sort((a, b) => a.name.localeCompare(b.name)),
);
const visibleTypes = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value;
  return sortedTypes.value.slice(start, start + pageSize.value);
});

function usageOf(type: RelationshipType): number {
  return usageCounts.value[type.name] ?? 0;
}

function canEdit(type: RelationshipType): boolean {
  return Boolean(isAdmin.value) && !type.systemDefined;
}

function canDelete(type: RelationshipType): boolean {
  return Boolean(isAdmin.value) && !type.systemDefined && usageOf(type) === 0;
}

function categoryLabel(category: string | undefined): string {
  switch (category) {
    case 'CORE':
      return t('settings.glossaryTermRelations.categoryCore');
    case 'OWL_SKOS':
      return t('settings.glossaryTermRelations.categoryOwlSkos');
    case 'CUSTOM':
      return t('settings.glossaryTermRelations.categoryCustom');
    default:
      return category ?? '';
  }
}

function characteristicLabel(characteristic: RelationshipCharacteristic): string {
  const key: Record<RelationshipCharacteristic, string> = {
    SYMMETRIC: 'characteristicSymmetric',
    ASYMMETRIC: 'characteristicAsymmetric',
    TRANSITIVE: 'characteristicTransitive',
    FUNCTIONAL: 'characteristicFunctional',
    INVERSE_FUNCTIONAL: 'characteristicInverseFunctional',
    REFLEXIVE: 'characteristicReflexive',
    IRREFLEXIVE: 'characteristicIrreflexive',
  };
  return t(`settings.glossaryTermRelations.${key[characteristic]}`);
}

function presetLabel(preset: CardinalityPreset): string {
  const key: Record<CardinalityPreset, string> = {
    ONE_TO_ONE: 'presetOneToOne',
    ONE_TO_MANY: 'presetOneToMany',
    MANY_TO_ONE: 'presetManyToOne',
    MANY_TO_MANY: 'presetManyToMany',
    CUSTOM: 'presetCustom',
  };
  return t(`settings.glossaryTermRelations.${key[preset]}`);
}

async function load(): Promise<void> {
  loading.value = true;
  errorMessage.value = '';
  try {
    const [types, counts] = await Promise.all([
      listAllRelationshipTypes(),
      getRelationTypeUsageCounts().catch(() => ({} as Record<string, number>)),
    ]);
    relationshipTypes.value = types;
    usageCounts.value = counts;
  } catch (error) {
    relationshipTypes.value = [];
    errorMessage.value = error instanceof Error ? error.message : t('crud.loadFailed');
  } finally {
    loading.value = false;
  }
}

function openCreate(): void {
  editing.value = undefined;
  Object.assign(formValues, { ...DEFAULT_RELATIONSHIP_TYPE_FORM, characteristics: [] });
  formErrors.value = {};
  formOpen.value = true;
}

function openEdit(type: RelationshipType): void {
  if (!canEdit(type)) {
    return;
  }
  editing.value = type;
  Object.assign(formValues, toRelationshipTypeForm(type));
  formErrors.value = {};
  formOpen.value = true;
}

function closeForm(): void {
  editing.value = undefined;
  Object.assign(formValues, { ...DEFAULT_RELATIONSHIP_TYPE_FORM, characteristics: [] });
  formErrors.value = {};
  formOpen.value = false;
}

function pageOf(saved: RelationshipType, types: RelationshipType[]): number {
  const index = types.findIndex((type) => type.id === saved.id);
  return Math.floor(Math.max(index, 0) / pageSize.value) + 1;
}

async function onSave(): Promise<void> {
  const errors = validateRelationshipTypeForm(
    formValues,
    editing.value,
    relationshipTypes.value,
    (key, params) => t(key, params as Record<string, string | number> | undefined),
  );
  formErrors.value = errors;
  if (Object.keys(errors).length > 0) {
    return;
  }
  saving.value = true;
  try {
    const request = toRelationshipTypeRequest(formValues);
    const wasEditing = Boolean(editing.value);
    const saved = editing.value
      ? await updateRelationshipType(request)
      : await createRelationshipType(request);
    const next = relationshipTypes.value.some((type) => type.id === saved.id)
      ? relationshipTypes.value.map((type) => (type.id === saved.id ? saved : type))
      : [...relationshipTypes.value, saved];
    relationshipTypes.value = next.sort((a, b) => a.name.localeCompare(b.name));
    currentPage.value = pageOf(saved, relationshipTypes.value);
    closeForm();
    message.success(
      t(wasEditing ? 'settings.glossaryTermRelations.updated' : 'settings.glossaryTermRelations.created'),
    );
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('settings.glossaryTermRelations.saveFailed'));
  } finally {
    saving.value = false;
  }
}

async function onDelete(type: RelationshipType): Promise<void> {
  if (!canDelete(type)) {
    return;
  }
  const confirmed = await confirmDelete({
    title: t('settings.glossaryTermRelations.deleteConfirmTitle'),
    content: t('settings.glossaryTermRelations.deleteConfirmContent', { name: type.displayName ?? type.name }),
    okText: t('crud.delete'),
    cancelText: t('crud.cancel'),
  });
  if (!confirmed) {
    return;
  }
  try {
    await deleteRelationshipType(type.id, true);
    relationshipTypes.value = relationshipTypes.value.filter((item) => item.id !== type.id);
    const maxPage = Math.max(Math.ceil(relationshipTypes.value.length / pageSize.value), 1);
    currentPage.value = Math.min(currentPage.value, maxPage);
    message.success(t('settings.glossaryTermRelations.deleted'));
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('settings.glossaryTermRelations.deleteFailed'));
  }
}

function toggleCharacteristic(value: RelationshipCharacteristic, checked: boolean): void {
  const current = formValues.characteristics ?? [];
  formValues.characteristics = checked
    ? [...current, value]
    : current.filter((item) => item !== value);
}

function onCharacteristicChecked(value: RelationshipCharacteristic, event: unknown): void {
  const checked = (event as { target?: { checked?: boolean } } | null)?.target?.checked === true;
  toggleCharacteristic(value, checked);
}

function onCardinalityInput(field: 'sourceMax' | 'targetMax', event: unknown): void {
  const raw = (event as { target?: { value?: string } } | null)?.target?.value ?? '';
  formValues.cardinality = {
    ...(formValues.cardinality ?? {}),
    [field]: raw === '' ? undefined : Number(raw),
  };
}

const CHARACTERISTICS: RelationshipCharacteristic[] = [
  'SYMMETRIC',
  'ASYMMETRIC',
  'TRANSITIVE',
  'FUNCTIONAL',
  'INVERSE_FUNCTIONAL',
  'REFLEXIVE',
  'IRREFLEXIVE',
];

onMounted(() => {
  void load();
});
</script>

<template>
  <div data-testid="glossary-term-relation-settings">
    <ForbiddenView v-if="!isAdmin" />
    <template v-else>
      <PageHeader
        :header="t('settings.glossaryTermRelations.title')"
        :sub-header="t('settings.glossaryTermRelations.lead')"
        test-id="glossary-term-relation-settings-header"
      />
      <Card style="margin-top: 16px">
        <Space direction="vertical" style="width: 100%">
          <div style="display: flex; justify-content: space-between; align-items: center">
            <Typography.Title :level="4" style="margin: 0">
              {{ t('settings.glossaryTermRelations.title') }}
            </Typography.Title>
            <Button type="primary" data-testid="add-relation-type-btn" @click="openCreate">
              {{ t('settings.glossaryTermRelations.add') }}
            </Button>
          </div>
          <Alert v-if="errorMessage" type="error" show-icon :message="errorMessage" />
          <Spin :spinning="loading">
            <SmTable
              row-key="id"
              test-id="relation-type-table"
              :columns="[
                { title: t('crud.name'), key: 'name' },
                { title: t('crud.displayName'), key: 'displayName' },
                { title: t('settings.glossaryTermRelations.category'), key: 'category' },
                { title: t('settings.glossaryTermRelations.characteristics'), key: 'characteristics' },
                { title: t('settings.glossaryTermRelations.crossGlossary'), key: 'crossGlossary' },
                { title: t('settings.glossaryTermRelations.cardinality'), key: 'cardinality' },
                { title: t('settings.glossaryTermRelations.color'), key: 'color' },
                { title: t('settings.glossaryTermRelations.usage'), key: 'usage' },
                { title: t('crud.actions'), key: 'actions' },
              ]"
              :data-source="visibleTypes"
              :pagination="false"
            >
              <template #bodyCell="{ column, record }">
                <template v-if="column.key === 'name'">
                  <Space>
                    <Tag v-if="(record as RelationshipType).systemDefined" data-testid="relation-type-system">
                      {{ t('settings.glossaryTermRelations.systemDefined') }}
                    </Tag>
                    <span :data-testid="`relation-name-${(record as RelationshipType).name}`">
                      {{ (record as RelationshipType).name }}
                    </span>
                  </Space>
                </template>
                <template v-else-if="column.key === 'displayName'">
                  {{ (record as RelationshipType).displayName || '—' }}
                </template>
                <template v-else-if="column.key === 'category'">
                  {{ categoryLabel((record as RelationshipType).category) }}
                </template>
                <template v-else-if="column.key === 'characteristics'">
                  <Space wrap>
                    <Tag
                      v-for="item in (record as RelationshipType).characteristics"
                      :key="item"
                    >
                      {{ characteristicLabel(item) }}
                    </Tag>
                  </Space>
                </template>
                <template v-else-if="column.key === 'crossGlossary'">
                  {{ (record as RelationshipType).crossGlossaryAllowed ? t('crud.yes') : t('crud.no') }}
                </template>
                <template v-else-if="column.key === 'cardinality'">
                  {{ presetLabel(deriveCardinalityPreset((record as RelationshipType).cardinality)) }}
                </template>
                <template v-else-if="column.key === 'color'">
                  {{ (record as RelationshipType).paletteKey || '—' }}
                </template>
                <template v-else-if="column.key === 'usage'">
                  {{ usageOf(record as RelationshipType) }}
                </template>
                <template v-else-if="column.key === 'actions'">
                  <Space>
                    <Button
                      size="small"
                      :disabled="!canEdit(record as RelationshipType)"
                      :data-testid="`edit-${(record as RelationshipType).name}-btn`"
                      @click="openEdit(record as RelationshipType)"
                    >
                      {{ t('crud.edit') }}
                    </Button>
                    <Button
                      size="small"
                      danger
                      :disabled="!canDelete(record as RelationshipType)"
                      :title="
                        !canDelete(record as RelationshipType)
                          ? t('settings.glossaryTermRelations.cannotDeleteInUse', {
                              count: usageOf(record as RelationshipType),
                            })
                          : undefined
                      "
                      :data-testid="`delete-${(record as RelationshipType).name}-btn`"
                      @click="onDelete(record as RelationshipType)"
                    >
                      {{ t('crud.delete') }}
                    </Button>
                  </Space>
                </template>
              </template>
            </SmTable>
            <Pagination
              v-if="sortedTypes.length > pageSize"
              size="small"
              :current="currentPage"
              :page-size="pageSize"
              :total="sortedTypes.length"
              show-size-changer
              :page-size-options="['10', '25', '50']"
              @change="(page: number, size: number) => { currentPage = page; pageSize = size; }"
            />
          </Spin>
        </Space>
      </Card>
      <FormModal
        :open="formOpen"
        :title="
          editing
            ? t('settings.glossaryTermRelations.editTitle')
            : t('settings.glossaryTermRelations.addTitle')
        "
        :ok-text="t('crud.save')"
        :cancel-text="t('crud.cancel')"
        :confirm-loading="saving"
        @ok="onSave"
        @cancel="closeForm"
      >
        <Form layout="vertical">
          <Form.Item
            :label="t('crud.name')"
            :validate-status="formErrors.name ? 'error' : undefined"
            :help="formErrors.name"
          >
            <Input
              v-model:value="formValues.name"
              data-testid="relation-type-name"
              :disabled="Boolean(editing)"
            />
          </Form.Item>
          <Form.Item
            :label="t('crud.displayName')"
            :validate-status="formErrors.displayName ? 'error' : undefined"
            :help="formErrors.displayName"
          >
            <Input v-model:value="formValues.displayName" data-testid="relation-type-display-name" />
          </Form.Item>
          <Form.Item :label="t('crud.description')">
            <Input.TextArea v-model:value="formValues.description" data-testid="relation-type-description" :rows="3" />
          </Form.Item>
          <Form.Item :label="t('settings.glossaryTermRelations.category')">
            <Select v-model:value="formValues.category" data-testid="relation-type-category">
              <Select.Option value="CORE">{{ t('settings.glossaryTermRelations.categoryCore') }}</Select.Option>
              <Select.Option value="OWL_SKOS">{{ t('settings.glossaryTermRelations.categoryOwlSkos') }}</Select.Option>
              <Select.Option value="CUSTOM">{{ t('settings.glossaryTermRelations.categoryCustom') }}</Select.Option>
            </Select>
          </Form.Item>
          <Form.Item :label="t('settings.glossaryTermRelations.inverse')">
            <Input v-model:value="formValues.inverse" data-testid="relation-type-inverse" />
          </Form.Item>
          <Form.Item
            :label="t('settings.glossaryTermRelations.rdfPredicate')"
            :validate-status="formErrors.rdfPredicate ? 'error' : undefined"
            :help="formErrors.rdfPredicate"
          >
            <Input v-model:value="formValues.rdfPredicate" data-testid="relation-type-rdf-predicate" />
          </Form.Item>
          <Form.Item :label="t('settings.glossaryTermRelations.cardinality')">
            <Select v-model:value="formValues.cardinalityPreset" data-testid="relation-type-cardinality">
              <Select.Option value="ONE_TO_ONE">{{ presetLabel('ONE_TO_ONE') }}</Select.Option>
              <Select.Option value="ONE_TO_MANY">{{ presetLabel('ONE_TO_MANY') }}</Select.Option>
              <Select.Option value="MANY_TO_ONE">{{ presetLabel('MANY_TO_ONE') }}</Select.Option>
              <Select.Option value="MANY_TO_MANY">{{ presetLabel('MANY_TO_MANY') }}</Select.Option>
              <Select.Option value="CUSTOM">{{ presetLabel('CUSTOM') }}</Select.Option>
            </Select>
          </Form.Item>
          <template v-if="formValues.cardinalityPreset === 'CUSTOM'">
            <Form.Item :label="t('settings.glossaryTermRelations.sourceMax')">
              <Input
                type="number"
                data-testid="relation-type-source-max"
                :value="formValues.cardinality?.sourceMax ?? ''"
                @change="(event: unknown) => onCardinalityInput('sourceMax', event)"
              />
            </Form.Item>
            <Form.Item :label="t('settings.glossaryTermRelations.targetMax')">
              <Input
                type="number"
                data-testid="relation-type-target-max"
                :value="formValues.cardinality?.targetMax ?? ''"
                @change="(event: unknown) => onCardinalityInput('targetMax', event)"
              />
            </Form.Item>
          </template>
          <Form.Item :label="t('settings.glossaryTermRelations.color')">
            <Select v-model:value="formValues.paletteKey" data-testid="relation-type-palette">
              <Select.Option
                v-for="palette in ['BLUE', 'INDIGO', 'VIOLET', 'GREEN', 'AMBER', 'GRAY', 'PINK', 'PURPLE', 'TEAL', 'ROSE']"
                :key="palette"
                :value="palette"
              >
                {{ palette }}
              </Select.Option>
            </Select>
          </Form.Item>
          <Form.Item
            :label="t('settings.glossaryTermRelations.characteristics')"
            :validate-status="formErrors.characteristics ? 'error' : undefined"
            :help="formErrors.characteristics"
          >
            <Space wrap>
              <Checkbox
                v-for="item in CHARACTERISTICS"
                :key="item"
                :checked="(formValues.characteristics ?? []).includes(item)"
                :data-testid="`relation-type-characteristic-${item}`"
                @change="(event: unknown) => onCharacteristicChecked(item, event)"
              >
                {{ characteristicLabel(item) }}
              </Checkbox>
            </Space>
          </Form.Item>
          <Form.Item>
            <Checkbox
              v-model:checked="formValues.crossGlossaryAllowed"
              data-testid="relation-type-cross-glossary"
            >
              {{ t('settings.glossaryTermRelations.crossGlossary') }}
            </Checkbox>
          </Form.Item>
        </Form>
      </FormModal>
    </template>
  </div>
</template>
