<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { Alert, Button, Card, Checkbox, Form, Input, Pagination, Select, Space, Spin, Tag, Tooltip, Typography, message } from 'ant-design-vue';
import { CheckOutlined, CloseOutlined, DeleteOutlined, EditOutlined, LockOutlined } from '@ant-design/icons-vue';
import SmDrawer from '@/components/shared/SmDrawer.vue';
import SmTable from '@/components/shared/SmTable.vue';
import { MODAL_SIZES } from '@/components/shared/presentation';
import PermissionPlaceholder from '@/components/shared/PermissionPlaceholder.vue';
import SmBreadcrumb from '@/components/shared/SmBreadcrumb.vue';
import { buildSettingsBreadcrumbCatalog, getSettingPageBreadcrumbs, toSmBreadcrumbItems } from '@/settings/breadcrumbs';
import { resolveSettingsLocation } from '@/settings/locationResolver';
import {
  SETTINGS_BREADCRUMB_NAMES,
  findSettingsRegistryItem,
  registryTitle,
  type SettingsTranslator,
} from '@/settings/registry';
import {
  createRelationshipType,
  deleteRelationshipType,
  getRelationTypeUsageCounts,
  listAllRelationshipTypes,
  RELATIONSHIP_TYPE_FIELDS,
  updateRelationshipType,
  type RelationshipCharacteristic,
  type RelationshipPaletteKey,
  type RelationshipType,
} from '@/api/relationshipTypes';
import { confirmDelete } from '@/features/crud/confirmDelete';
import { DEFAULT_PAGE_SIZE_OPTIONS, PAGE_SIZE_BASE } from '@/utils/pagination';
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
 * AdminProtectedRoute settings page listing relationship types in
 * server order in an 8-column table — badge cells for category,
 * characteristics, cardinality and color, a lock icon on
 * system-defined names, a centered check/cross for cross-glossary,
 * and edit/delete icon buttons gated on admin + system-defined +
 * usage — with a create/edit form in a 500-wide slideout drawer
 * carrying the official validation rules, and delete blocked for
 * system-defined or in-use types (hardDelete=true). The usage counts
 * feed only the delete gate and tooltip; no Usage column is
 * rendered. Owners/reviewers and the other unedited fields pass
 * through unedited, as official's form does not edit them either.
 */
const { t } = useI18n();
const settingsTranslator = ((key: string, params?: Record<string, string>) => t(key, params ?? {})) as SettingsTranslator;
const registryEntry = findSettingsRegistryItem('governance.glossary-term-relations');
if (!registryEntry) {
  throw new Error('Missing settings registry entry: governance.glossary-term-relations');
}
const breadcrumbItems = computed(() =>
  toSmBreadcrumbItems(
    getSettingPageBreadcrumbs(
      buildSettingsBreadcrumbCatalog('settings.title', SETTINGS_BREADCRUMB_NAMES, settingsTranslator),
      resolveSettingsLocation,
      'governance',
      registryTitle(settingsTranslator, registryEntry),
    ),
  ),
);
const authStore = useAuthStore();

const isAdmin = computed(() => authStore.user?.isAdmin === true);
const loading = ref(false);
const saving = ref(false);
const errorMessage = ref('');
const relationshipTypes = ref<RelationshipType[]>([]);
const usageCounts = ref<Record<string, number>>({});
const currentPage = ref(1);
const pageSize = ref(PAGE_SIZE_BASE);
const pageSizeOptions = DEFAULT_PAGE_SIZE_OPTIONS.map((size) => String(size));

const formOpen = ref(false);
const editing = ref<RelationshipType | undefined>();
const formValues = reactive<RelationshipTypeFormValues>({ ...DEFAULT_RELATIONSHIP_TYPE_FORM });
const formErrors = ref<RelationshipTypeFormErrors>({});

// Official form: any field change clears all errors
// (GlossaryTermRelationSettings.tsx:388-391).
watch(
  formValues,
  () => {
    formErrors.value = {};
  },
  { deep: true },
);

// Server order, as official renders it: the list is sorted by name
// only when a save lands (onSave), never for display.
const visibleTypes = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value;
  return relationshipTypes.value.slice(start, start + pageSize.value);
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

// Official getCategoryLabel (RelationshipTypeTable.tsx:93-101) and
// CATEGORY_BADGE_COLORS (:43-47): Core blue, Custom gray, OwlSkos
// purple. Antd has no gray preset; the uncolored default is gray.
const CATEGORY_LABEL_KEYS: Record<string, string | undefined> = {
  CORE: 'categoryCore',
  OWL_SKOS: 'categoryOwlSkos',
  CUSTOM: 'categoryCustom',
};
const CATEGORY_BADGE_COLORS: Record<string, string | undefined> = {
  CORE: 'blue',
  CUSTOM: 'default',
  OWL_SKOS: 'purple',
};

function categoryLabel(category: string | undefined): string {
  const key = category === undefined ? undefined : CATEGORY_LABEL_KEYS[category];
  return key === undefined ? '' : t(`settings.glossaryTermRelations.${key}`);
}

function categoryBadgeColor(category: string | undefined): string | undefined {
  return category === undefined ? undefined : CATEGORY_BADGE_COLORS[category];
}

// Official palette order (RelationshipTypeForm.tsx:106-115), palette
// labels (RelationshipTypeTable.tsx:132-147) and PALETTE_BADGE_COLORS
// (:49-63). Antd has no indigo preset; Indigo maps to geekblue, the
// closest antd preset. One table feeds both the table Color column
// and the form color select.
const PALETTE_ORDER: RelationshipPaletteKey[] = [
  'AMBER',
  'BLUE',
  'GRAY',
  'GREEN',
  'INDIGO',
  'PINK',
  'PURPLE',
  'ROSE',
  'TEAL',
  'VIOLET',
];
const PALETTE_LABEL_KEYS: Record<string, string | undefined> = {
  AMBER: 'paletteLabels.amber',
  BLUE: 'paletteLabels.blue',
  GRAY: 'paletteLabels.gray',
  GREEN: 'paletteLabels.green',
  INDIGO: 'paletteLabels.indigo',
  PINK: 'paletteLabels.pink',
  PURPLE: 'paletteLabels.purple',
  ROSE: 'paletteLabels.rose',
  TEAL: 'paletteLabels.teal',
  VIOLET: 'paletteLabels.violet',
};
const PALETTE_BADGE_COLORS: Record<string, string | undefined> = {
  AMBER: 'orange',
  BLUE: 'blue',
  GRAY: 'default',
  GREEN: 'success',
  INDIGO: 'geekblue',
  PINK: 'pink',
  PURPLE: 'purple',
  ROSE: 'pink',
  TEAL: 'success',
  VIOLET: 'purple',
};

function paletteLabel(paletteKey: string | undefined): string {
  const key = paletteKey === undefined ? undefined : PALETTE_LABEL_KEYS[paletteKey];
  return key === undefined ? '' : t(`settings.glossaryTermRelations.${key}`);
}

function paletteBadgeColor(paletteKey: string | undefined): string | undefined {
  return paletteKey === undefined ? undefined : PALETTE_BADGE_COLORS[paletteKey];
}

function editTooltip(type: RelationshipType): string {
  // Official Edit tooltip (RelationshipTypeTable.tsx:262-266):
  // system-defined shows the system-defined label, anything else the
  // plain Edit label — no separate non-admin branch.
  return type.systemDefined
    ? t('settings.glossaryTermRelations.systemDefined')
    : t('crud.edit');
}

function deleteTooltip(type: RelationshipType): string {
  // Official getDeleteTooltip (RelationshipTypeTable.tsx:149-158):
  // the in-use message only when usage > 0, otherwise the plain
  // Delete label — including when the button is disabled for another
  // reason (system-defined, non-admin).
  const usage = usageOf(type);
  return usage > 0
    ? t('settings.glossaryTermRelations.cannotDeleteInUse', { count: usage })
    : t('crud.delete');
}

function onPageChange(page: number, size: number): void {
  // Official size change resets to page 1
  // (GlossaryTermRelationSettings.tsx:351-354).
  if (size !== pageSize.value) {
    pageSize.value = size;
    currentPage.value = 1;
    return;
  }
  currentPage.value = page;
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
      listAllRelationshipTypes(RELATIONSHIP_TYPE_FIELDS),
      getRelationTypeUsageCounts(),
    ]);
    relationshipTypes.value = types;
    usageCounts.value = counts;
  } catch (error) {
    relationshipTypes.value = [];
    usageCounts.value = {};
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
    // Official save failure always uses the update-entity error,
    // including create (GlossaryTermRelationSettings.tsx:241-247).
    message.error(error instanceof Error ? error.message : t('settings.glossaryTermRelations.updateEntityError'));
  } finally {
    saving.value = false;
  }
}

async function onDelete(type: RelationshipType): Promise<void> {
  if (!canDelete(type)) {
    return;
  }
  // Official delete flow (GlossaryTermRelationSettings.tsx:266-297):
  // the dialog stays open with a loading delete button while the
  // delete runs and closes only on success; on failure the error
  // toasts and the dialog stays open for retry or cancel.
  await confirmDelete({
    title: t('settings.glossaryTermRelations.deleteConfirmTitle'),
    content: t('settings.glossaryTermRelations.deleteConfirmContent', { name: type.displayName ?? type.name }),
    okText: t('crud.delete'),
    cancelText: t('crud.cancel'),
    width: MODAL_SIZES.deleteDialog,
    onOk: async () => {
      try {
        await deleteRelationshipType(type.id, true);
        relationshipTypes.value = relationshipTypes.value.filter((item) => item.id !== type.id);
        const maxPage = Math.max(Math.ceil(relationshipTypes.value.length / pageSize.value), 1);
        currentPage.value = Math.min(currentPage.value, maxPage);
        message.success(t('settings.glossaryTermRelations.deleted'));
      } catch (error) {
        message.error(error instanceof Error ? error.message : t('settings.glossaryTermRelations.deleteFailed'));
        throw error;
      }
    },
  });
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
    <PermissionPlaceholder v-if="!isAdmin" :permission-value="t('crud.view')" />
    <template v-else>
      <SmBreadcrumb :items="breadcrumbItems" />
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
          <Typography.Text type="secondary">
            {{ t('settings.glossaryTermRelations.lead') }}
          </Typography.Text>
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
                { title: t('settings.glossaryTermRelations.crossGlossary'), key: 'crossGlossary', align: 'center' },
                { title: t('settings.glossaryTermRelations.cardinality'), key: 'cardinality' },
                { title: t('settings.glossaryTermRelations.color'), key: 'color' },
                { title: t('crud.actions'), key: 'actions' },
              ]"
              :data-source="visibleTypes"
              :pagination="false"
            >
              <template #bodyCell="{ column, record }">
                <template v-if="column.key === 'name'">
                  <Space>
                    <LockOutlined
                      v-if="(record as RelationshipType).systemDefined"
                      data-testid="relation-type-system"
                    />
                    <span
                      style="font-weight: 500"
                      :data-testid="`relation-name-${(record as RelationshipType).name}`"
                    >
                      {{ (record as RelationshipType).name }}
                    </span>
                  </Space>
                </template>
                <template v-else-if="column.key === 'displayName'">
                  {{ (record as RelationshipType).displayName }}
                </template>
                <template v-else-if="column.key === 'category'">
                  <Tag :color="categoryBadgeColor((record as RelationshipType).category)">
                    {{ categoryLabel((record as RelationshipType).category) }}
                  </Tag>
                </template>
                <template v-else-if="column.key === 'characteristics'">
                  <Space wrap>
                    <Tag
                      v-for="item in (record as RelationshipType).characteristics"
                      :key="item"
                      color="default"
                    >
                      {{ characteristicLabel(item) }}
                    </Tag>
                  </Space>
                </template>
                <template v-else-if="column.key === 'crossGlossary'">
                  <CheckOutlined
                    v-if="(record as RelationshipType).crossGlossaryAllowed"
                    style="color: var(--sm-color-success)"
                  />
                  <CloseOutlined v-else style="color: var(--sm-color-error)" />
                </template>
                <template v-else-if="column.key === 'cardinality'">
                  <Tag color="default">
                    {{ presetLabel(deriveCardinalityPreset((record as RelationshipType).cardinality)) }}
                  </Tag>
                </template>
                <template v-else-if="column.key === 'color'">
                  <Tag :color="paletteBadgeColor((record as RelationshipType).paletteKey)">
                    {{ paletteLabel((record as RelationshipType).paletteKey) }}
                  </Tag>
                </template>
                <template v-else-if="column.key === 'actions'">
                  <Space>
                    <Tooltip :title="editTooltip(record as RelationshipType)">
                      <Button
                        type="text"
                        size="small"
                        :disabled="!canEdit(record as RelationshipType)"
                        :data-testid="`edit-${(record as RelationshipType).name}-btn`"
                        @click="openEdit(record as RelationshipType)"
                      >
                        <template #icon><EditOutlined /></template>
                      </Button>
                    </Tooltip>
                    <Tooltip :title="deleteTooltip(record as RelationshipType)">
                      <Button
                        type="text"
                        size="small"
                        :disabled="!canDelete(record as RelationshipType)"
                        :data-testid="`delete-${(record as RelationshipType).name}-btn`"
                        @click="onDelete(record as RelationshipType)"
                      >
                        <template #icon><DeleteOutlined /></template>
                      </Button>
                    </Tooltip>
                  </Space>
                </template>
              </template>
            </SmTable>
            <Pagination
              v-if="relationshipTypes.length > PAGE_SIZE_BASE"
              size="small"
              :current="currentPage"
              :page-size="pageSize"
              :total="relationshipTypes.length"
              show-size-changer
              :page-size-options="pageSizeOptions"
              @change="onPageChange"
            />
          </Spin>
        </Space>
      </Card>
      <SmDrawer
        :open="formOpen"
        width-key="relationTypeForm"
        test-id="relation-type-drawer"
        :title="
          editing
            ? t('settings.glossaryTermRelations.editTitle')
            : t('settings.glossaryTermRelations.addTitle')
        "
        :ok-text="editing ? t('crud.update') : t('crud.add')"
        :cancel-text="t('crud.cancel')"
        :confirm-loading="saving"
        @ok="onSave"
        @cancel="closeForm"
      >
        <Form layout="vertical">
          <Form.Item
            :label="t('crud.name')"
            required
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
            required
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
          <Form.Item
            :label="t('settings.glossaryTermRelations.inverse')"
            :tooltip="t('settings.glossaryTermRelations.inverseTooltip')"
          >
            <Input v-model:value="formValues.inverse" data-testid="relation-type-inverse" />
          </Form.Item>
          <Form.Item
            :label="t('settings.glossaryTermRelations.rdfPredicate')"
            required
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
          <div
            v-if="formValues.cardinalityPreset === 'CUSTOM'"
            style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px"
          >
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
          </div>
          <Form.Item :label="t('settings.glossaryTermRelations.color')">
            <Select v-model:value="formValues.paletteKey" data-testid="relation-type-palette">
              <Select.Option
                v-for="palette in PALETTE_ORDER"
                :key="palette"
                :value="palette"
              >
                {{ paletteLabel(palette) }}
              </Select.Option>
            </Select>
          </Form.Item>
          <Form.Item
            :label="t('settings.glossaryTermRelations.characteristics')"
            :validate-status="formErrors.characteristics ? 'error' : undefined"
            :help="formErrors.characteristics"
          >
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px 16px">
              <Checkbox
                v-for="item in CHARACTERISTICS"
                :key="item"
                :checked="(formValues.characteristics ?? []).includes(item)"
                :data-testid="`relation-type-characteristic-${item}`"
                @change="(event: unknown) => onCharacteristicChecked(item, event)"
              >
                {{ characteristicLabel(item) }}
              </Checkbox>
            </div>
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
      </SmDrawer>
    </template>
  </div>
</template>
