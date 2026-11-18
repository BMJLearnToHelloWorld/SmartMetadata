<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, h, onMounted, onUnmounted, reactive, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import {
  Alert,
  Button,
  Drawer,
  Dropdown,
  Form,
  Input,
  Modal,
  Select,
  Switch,
  Table,
  Tag,
  Tooltip,
  Typography,
  message,
} from 'ant-design-vue';
import type { MenuProps, TableProps } from 'ant-design-vue';
import { DeleteOutlined, EditOutlined, MoreOutlined, PlusOutlined } from '@ant-design/icons-vue';
import {
  ADD_CUSTOM_PROPERTIES_DOCS,
  ENTITY_REFERENCE_LABELS,
  ENTITY_REFERENCE_TYPES,
  ENUM_CONFIG_MAX_VISIBLE_VALUES,
  addOrUpdateCustomProperty,
  customPropertySorter,
  deleteCustomPropertyByName,
  filterCustomProperties,
  getCustomPropertyChanges,
  getCustomPropertyPageHeader,
  getCustomPropertyRouteSegment,
  getCustomPropertyTypeFlags,
  getEditFormValues,
  getEntityName,
  getMetadataTypeByName,
  getPropertyConfigSummary,
  getPropertyTypeBadge,
  getPropertyTypeOptions,
  listPropertyTypes,
  propertyTypeLabel,
  startCase,
  toCustomPropertyPayload,
  updateCustomPropertyByName,
  validateCustomPropertyEditForm,
  validateCustomPropertyForm,
  type CustomPropertyConfigSummary,
  type CustomPropertyFieldLabels,
  type CustomPropertyFormField,
  type CustomPropertyFormValues,
  type CustomPropertyTypeBadge,
} from '@/api/customProperties';
import ServiceDocPanel from '@/components/ingestion/ServiceDocPanel.vue';
import CreatePlaceholder from '@/components/shared/CreatePlaceholder.vue';
import NoDataPlaceholder from '@/components/shared/NoDataPlaceholder.vue';
import NoFilteredResultsPlaceholder from '@/components/shared/NoFilteredResultsPlaceholder.vue';
import NoSearchResultsPlaceholder from '@/components/shared/NoSearchResultsPlaceholder.vue';
import SmCodeEditor from '@/components/shared/SmCodeEditor.vue';
import SmRichTextEditor from '@/components/shared/SmRichTextEditor.vue';
import { useEntityPermissions } from '@/composables/useEntityPermissions';
import EntityDetailShell from '@/features/crud/EntityDetailShell.vue';
import type { EntityBreadcrumb, EntityDetailTab } from '@/features/crud/types';
import type { CustomPropertyDef, MetadataType } from '@/types/collaboration';
import { getTextFromHtmlString } from '@/utils/richTextUtils';

const props = defineProps<{ entityType: string }>();
const { t } = useI18n();
const loading = ref(false);
const isError = ref(false);
const typeMeta = ref<MetadataType | null>(null);
const definitions = ref<CustomPropertyDef[]>([]);
const propertyTypeOptions = ref<{ value: string; label: string; id: string; name: string }[]>([]);
const drawerOpen = ref(false);
const editOpen = ref(false);
const buttonLoading = ref(false);
const editSaving = ref(false);
const editingName = ref<string | null>(null);
const deleteTarget = ref<CustomPropertyDef | null>(null);
const activeTab = ref('custom-properties');
const searchInput = ref('');
const appliedSearch = ref('');
const selectedTypes = ref<string[]>([]);
const showSidePanel = ref(false);
const activeField = ref('');
const descriptionKey = ref(0);
const editEditorKey = ref(0);
const editAttempted = ref(false);
const savedEntityRefs = ref<string[]>([]);
let searchTimer: ReturnType<typeof setTimeout> | undefined;

interface CreateFormState {
  name: string;
  displayName: string;
  description: string;
  propertyTypeId: string;
  enumConfig: string[];
  multiSelect: boolean;
  formatConfig: string;
  entityReferenceConfig: string[];
  columns: string[];
}

const createForm = reactive<CreateFormState>({
  name: '',
  displayName: '',
  description: '',
  propertyTypeId: '',
  enumConfig: [],
  multiSelect: false,
  formatConfig: '',
  entityReferenceConfig: [],
  columns: [],
});

const editForm = reactive({
  displayName: '',
  description: '',
  enumConfig: [] as string[],
  multiSelect: false,
  entityReferenceConfig: [] as string[],
});

/**
 * Create-form "touched" set, driven by value changes against the snapshot
 * taken when the drawer opened (official form mode is `onChange`: errors
 * render once a field has changed, never on a pristine form). The set only
 * grows; reverting a field does not hide its error again.
 */
const createTouched = reactive(new Set<CustomPropertyFormField>());
let createSnapshot: CreateFormState = {
  name: '',
  displayName: '',
  description: '',
  propertyTypeId: '',
  enumConfig: [],
  multiSelect: false,
  formatConfig: '',
  entityReferenceConfig: [],
  columns: [],
};

const CREATE_FIELD_KEYS: [keyof CreateFormState, CustomPropertyFormField][] = [
  ['name', 'name'],
  ['displayName', 'displayName'],
  ['description', 'description'],
  ['propertyTypeId', 'propertyType'],
  ['enumConfig', 'enumConfig'],
  ['multiSelect', 'multiSelect'],
  ['formatConfig', 'formatConfig'],
  ['entityReferenceConfig', 'entityReferenceConfig'],
  ['columns', 'columns'],
];

watch(
  createForm,
  () => {
    for (const [key, field] of CREATE_FIELD_KEYS) {
      if (JSON.stringify(createForm[key]) !== JSON.stringify(createSnapshot[key])) {
        createTouched.add(field);
      }
    }
  },
  { deep: true },
);

function resetCreateForm(): void {
  createForm.name = '';
  createForm.displayName = '';
  createForm.description = '';
  // Official defaults: propertyType null, multiSelect false; no
  // first-option preselection.
  createForm.propertyTypeId = '';
  createForm.enumConfig = [];
  createForm.multiSelect = false;
  createForm.formatConfig = '';
  createForm.entityReferenceConfig = [];
  createForm.columns = [];
  createTouched.clear();
  createSnapshot = {
    name: '',
    displayName: '',
    description: '',
    propertyTypeId: '',
    enumConfig: [],
    multiSelect: false,
    formatConfig: '',
    entityReferenceConfig: [],
    columns: [],
  };
}

// The drawer stays mounted (destroyOnClose false); opening it resets the
// form to the official defaults and remounts the description editor.
watch(drawerOpen, (open) => {
  if (open) {
    resetCreateForm();
    descriptionKey.value += 1;
  }
});

/** The selected field type's name drives the conditional fields. */
const selectedPropertyType = computed(() =>
  propertyTypeOptions.value.find((opt) => opt.id === createForm.propertyTypeId),
);
const selectedPropertyTypeName = computed(() => selectedPropertyType.value?.name ?? '');
const createTypeFlags = computed(() => getCustomPropertyTypeFlags(selectedPropertyTypeName.value));
const editingDef = computed(
  () => definitions.value.find((def) => def.name === editingName.value) ?? null,
);
const editTypeFlags = computed(() =>
  getCustomPropertyTypeFlags(editingDef.value?.propertyType ?? ''),
);

/**
 * Per-type gate (official useEntityPermissions(TYPE), pin
 * CustomPropertiesPageV1.tsx): the Add/Edit/Delete entry points are
 * visible only with per-type EditAll. No `deleted` option — pin passes
 * none for TYPE. The identifier and `enabled` are reactive because the
 * type id resolves only after load() (see useEntityPermissions).
 */
const typeId = computed(() => typeMeta.value?.id ?? '');
const { canEditAll: editPermission, error: permissionsError } = useEntityPermissions(
  'type',
  computed(() => ({ id: typeId.value })),
  { enabled: computed(() => Boolean(typeId.value)) },
);

// Pin shows the raw permission error as a toast; the page stays
// readable and the gated buttons stay hidden (fail-closed).
watch(permissionsError, (err) => {
  if (err) {
    message.error(err instanceof Error ? err.message : t('crud.loadFailed'));
  }
});

/** Official ENTITY_REFERENCE_OPTIONS labels (hardcoded English, pin order). */
const entityReferenceOptions = computed(() =>
  ENTITY_REFERENCE_TYPES.map((value) => ({
    value,
    label: ENTITY_REFERENCE_LABELS[value] ?? value,
  })),
);

const formatOptions = computed(() =>
  createTypeFlags.value.supportedFormats.map((format) => ({ value: format, label: format })),
);

const existingEnumOptions = computed(() =>
  editingDef.value
    ? getEditFormValues(editingDef.value).enumConfig.map((value) => ({ value, label: value }))
    : [],
);

const fieldLabels = computed<CustomPropertyFieldLabels>(() => ({
  name: t('label.name'),
  displayName: t('label.display-name'),
  description: t('label.description'),
  propertyType: t('label.type'),
  enumConfig: t('label.enum-value-plural'),
  formatConfig: t('label.format'),
  entityReferenceConfig: t('label.entity-reference-types'),
  columns: t('label.column-plural'),
}));

const createValues = computed<CustomPropertyFormValues>(() => ({
  name: createForm.name,
  displayName: createForm.displayName,
  description: createForm.description,
  propertyTypeName: selectedPropertyTypeName.value,
  enumConfig: [...createForm.enumConfig],
  multiSelect: createForm.multiSelect,
  formatConfig: createForm.formatConfig,
  entityReferenceConfig: [...createForm.entityReferenceConfig],
  columns: [...createForm.columns],
}));

const createIssues = computed(() =>
  validateCustomPropertyForm(createValues.value, fieldLabels.value),
);
const createValid = computed(() => createIssues.value.length === 0);

function createFieldError(field: CustomPropertyFormField): string | undefined {
  if (!createTouched.has(field)) {
    return undefined;
  }
  const issue = createIssues.value.find((candidate) => candidate.field === field);
  return issue ? t(issue.key, issue.params ?? {}) : undefined;
}

const editIssues = computed(() =>
  editingDef.value
    ? validateCustomPropertyEditForm(editForm, editingDef.value, fieldLabels.value)
    : [],
);

function editFieldError(field: CustomPropertyFormField): string | undefined {
  if (!editAttempted.value) {
    return undefined;
  }
  const issue = editIssues.value.find((candidate) => candidate.field === field);
  return issue ? t(issue.key, issue.params ?? {}) : undefined;
}

const pageHeader = computed(() => getCustomPropertyPageHeader(props.entityType));
const pageTitle = computed(() => t(pageHeader.value.headerKey));
const pageLead = computed(() =>
  pageHeader.value.subHeaderEntityKey
    ? t(pageHeader.value.subHeaderKey, { entity: t(pageHeader.value.subHeaderEntityKey) })
    : t(pageHeader.value.subHeaderKey),
);

/**
 * Official breadcrumb (getSettingPageEntityBreadCrumb): Settings (linked
 * to the hub) → category name → entity name (startCase of the route
 * segment). The category link is pending the shell batch's §9 breadcrumb
 * constructor; until then the category crumb renders unlinked.
 */
const breadcrumbs = computed<EntityBreadcrumb[]>(() => [
  { label: t('label.setting-plural'), to: { name: 'admin-settings' } },
  { label: t('label.custom-property-plural') },
  { label: startCase(getCustomPropertyRouteSegment(props.entityType)) },
]);

const tabs = computed<EntityDetailTab[]>(() => [
  {
    key: 'custom-properties',
    label: t('label.custom-property-plural'),
    count: definitions.value.length,
    testId: 'custom-property-tab-properties',
  },
  {
    key: 'schema',
    label: t('label.schema'),
    testId: 'custom-property-tab-schema',
  },
]);

const columns = computed<TableProps['columns']>(() => [
  {
    title: t('label.property'),
    dataIndex: 'name',
    key: 'name',
    width: '41%',
    sorter: (a: CustomPropertyDef, b: CustomPropertyDef) => customPropertySorter(a, b),
  },
  { title: t('label.type'), dataIndex: 'propertyType', key: 'propertyType', width: '20%' },
  { title: t('label.configuration'), key: 'customPropertyConfig' },
  { title: t('label.action-plural'), key: 'actions', width: 80 },
]);

/** Official getPropertyTypeOptions: options from the types actually present, with counts. */
const typeFilterOptions = computed(() =>
  getPropertyTypeOptions(definitions.value, (badge) =>
    badge.labelKey ? t(badge.labelKey) : badge.fallbackLabel,
  ).map((option) => ({
    value: option.value,
    label: `${option.label} (${option.count})`,
  })),
);

/**
 * Official activeTypeFilters: a selected type whose last property was
 * removed drops out of the effective filter (and out of the Select, which
 * is bound to this list, not to the raw selection).
 */
const activeTypeFilters = computed(() =>
  selectedTypes.value.filter((type) =>
    typeFilterOptions.value.some((option) => option.value === type),
  ),
);

const filteredDefinitions = computed(() =>
  filterCustomProperties(definitions.value, appliedSearch.value, activeTypeFilters.value),
);

const noResultsTitle = computed(() =>
  t('label.no-entity-found', { entity: t('label.property-plural') }),
);
const createPlaceholderTestId = computed(
  () => `create-error-placeholder-${t('label.property')}`,
);

/**
 * Schema tab: the pin parses eagerly in the tabs memo with a bare
 * JSON.parse and no readOnly/options/onChange props; an invalid schema
 * throws during render and is caught by the shared error boundary. No
 * local Alert, no silent default.
 */
const schemaValue = computed(() => JSON.parse(typeMeta.value?.schema ?? '{}'));

/** Pin color role → antd Tag color; gray roles render the default Tag. */
const BADGE_COLOR_TO_TAG_COLOR: Readonly<Record<string, string | undefined>> = {
  gray: undefined,
  'gray-blue': undefined,
  'blue-light': 'cyan',
  pink: 'pink',
  orange: 'orange',
  warning: 'gold',
  purple: 'purple',
  blue: 'geekblue',
  indigo: 'magenta',
  brand: 'blue',
  error: 'red',
  success: 'green',
};

function badgeFor(def: CustomPropertyDef): CustomPropertyTypeBadge {
  return getPropertyTypeBadge(def.propertyType);
}

function badgeLabel(badge: CustomPropertyTypeBadge): string {
  return badge.labelKey ? t(badge.labelKey) : badge.fallbackLabel;
}

function badgeTagColor(badge: CustomPropertyTypeBadge): string | undefined {
  return BADGE_COLOR_TO_TAG_COLOR[badge.color];
}

function descriptionText(def: CustomPropertyDef): string {
  return getTextFromHtmlString(def.description ?? '');
}

function configLabel(summary: CustomPropertyConfigSummary): string {
  if (summary.kind === 'format') {
    return t('label.format');
  }
  if (summary.kind === 'entityTypes') {
    return t('label.entity-types');
  }
  if (summary.kind === 'columns') {
    return t('label.column-plural');
  }
  return `${t('label.value-plural')} · ${
    summary.multiSelect ? t('label.multi-select') : t('label.single-select')
  }`;
}

/** Official MAX_VISIBLE_CONFIG_VALUES = 3; the rest collapse into a "+N" badge. */
const MAX_VISIBLE_CONFIG_VALUES = 3;

function configCell(def: CustomPropertyDef): {
  summary: CustomPropertyConfigSummary | undefined;
  visible: string[];
  hidden: string[];
} {
  const summary = getPropertyConfigSummary(def);
  return {
    summary,
    visible: summary ? summary.values.slice(0, MAX_VISIBLE_CONFIG_VALUES) : [],
    hidden: summary ? summary.values.slice(MAX_VISIBLE_CONFIG_VALUES) : [],
  };
}

/** One summary per property name, computed once per definitions change. */
const configCells = computed(
  () => new Map(definitions.value.map((def) => [def.name, configCell(def)] as const)),
);

function configFor(def: CustomPropertyDef): ReturnType<typeof configCell> {
  return configCells.value.get(def.name) ?? { summary: undefined, visible: [], hidden: [] };
}

/**
 * Official actions menu: Edit + (separator only when both actions apply)
 * + Delete. Both ride the same hasAccess flag (no edit/delete split); the
 * menu renders nothing when the flag is false.
 */
function actionMenuItems(): MenuProps['items'] {
  const canEdit = editPermission.value;
  const canDelete = editPermission.value;
  const items: NonNullable<MenuProps['items']> = [];
  if (canEdit) {
    items.push({
      key: 'update',
      icon: () => h(EditOutlined),
      label: h('span', { 'data-testid': 'edit-button' }, t('label.edit')),
    });
  }
  if (canEdit && canDelete) {
    items.push({ type: 'divider' });
  }
  if (canDelete) {
    items.push({
      key: 'delete',
      danger: true,
      icon: () => h(DeleteOutlined),
      label: h('span', { 'data-testid': 'delete-button' }, t('label.delete')),
    });
  }
  return items;
}

function dropdownMenu(def: CustomPropertyDef): MenuProps {
  return {
    items: actionMenuItems(),
    onClick: ({ key }) => onActionMenu(String(key), def),
  };
}

function onActionMenu(key: string, def: CustomPropertyDef): void {
  if (key === 'update') {
    openEdit(def);
  } else if (key === 'delete') {
    deleteTarget.value = def;
  }
}

/** Keep the dropdown menu inside the test wrapper (same precedent as FormModal). */
function getPopupContainer(triggerNode: HTMLElement): HTMLElement {
  return triggerNode.parentElement ?? document.body;
}

async function loadPropertyTypes(): Promise<void> {
  try {
    const page = await listPropertyTypes('20');
    propertyTypeOptions.value = page.data
      .filter((row) => row.id)
      .map((row) => ({
        value: row.id as string,
        label: propertyTypeLabel(row.name, row.displayName),
        id: row.id as string,
        name: row.name,
      }));
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('crud.loadFailed'));
  }
}

async function load(): Promise<void> {
  loading.value = true;
  try {
    const meta = await getMetadataTypeByName(props.entityType);
    typeMeta.value = meta;
    definitions.value = meta.customProperties;
  } catch (error) {
    // Official fetchTypeDetail: error toast + isError; the page is
    // replaced by the whole-page placeholder. isError clears only when
    // the entity type changes.
    message.error(error instanceof Error ? error.message : t('crud.loadFailed'));
    isError.value = true;
  } finally {
    loading.value = false;
  }
}

/**
 * Official runCustomPropertyChange: on data, replace ONLY
 * `customProperties` in state; on undefined, run the missing handler
 * (delete passes none: silent refetch) and refetch; on error, an error
 * toast. Never a success toast.
 */
async function runPropertyChange(
  change: () => Promise<MetadataType | undefined>,
  onPropertyMissing?: () => void,
): Promise<void> {
  buttonLoading.value = true;
  try {
    const data = await change();
    if (data) {
      if (typeMeta.value) {
        typeMeta.value = { ...typeMeta.value, customProperties: data.customProperties };
      }
      definitions.value = data.customProperties;
    } else {
      onPropertyMissing?.();
      await load();
    }
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('crud.updateFailed'));
  } finally {
    buttonLoading.value = false;
  }
}

function openCreate(): void {
  drawerOpen.value = true;
}

function openEdit(def: CustomPropertyDef): void {
  editingName.value = def.name;
  // Only enum and entity-reference configs are editable (official
  // CustomPropertyEditForm): format and table configs have no edit
  // controls and stay on the server copy untouched.
  const editValues = getEditFormValues(def);
  editForm.displayName = editValues.displayName;
  editForm.description = editValues.description;
  editForm.enumConfig = [...editValues.enumConfig];
  editForm.multiSelect = editValues.multiSelect;
  editForm.entityReferenceConfig = [...editValues.entityReferenceConfig];
  savedEntityRefs.value = [...editValues.entityReferenceConfig];
  editAttempted.value = false;
  editEditorKey.value += 1;
  editOpen.value = true;
}

function closeEdit(): void {
  editOpen.value = false;
  editingName.value = null;
  editForm.displayName = '';
  editForm.description = '';
  editForm.enumConfig = [];
  editForm.multiSelect = false;
  editForm.entityReferenceConfig = [];
  savedEntityRefs.value = [];
  editAttempted.value = false;
}

/**
 * Switching property type drops the previous type's condition values
 * (official: the fields appear/disappear with the type; a stale enum
 * value must never ride into a format submission).
 */
function onPropertyTypeChange(): void {
  createForm.enumConfig = [];
  createForm.multiSelect = false;
  createForm.formatConfig = '';
  createForm.entityReferenceConfig = [];
  createForm.columns = [];
}

/** Drawer focus tracking for the doc panel: field ids are `root/<field>`. */
function onDrawerFocusIn(event: FocusEvent): void {
  const target = event.target as HTMLElement | null;
  const docField = target?.closest?.('[data-doc-field]')?.getAttribute('data-doc-field');
  if (docField) {
    activeField.value = docField;
  }
}

/**
 * Official create submit: a missing type id returns silently (no toast);
 * the PUT response is ignored; on success the drawer closes and the
 * detail refetches. No trimming anywhere.
 */
async function onCreateSubmit(): Promise<void> {
  const typeIdValue = typeMeta.value?.id;
  if (!typeIdValue) {
    return;
  }
  if (!createValid.value) {
    // Belt-and-braces: the Create button is disabled while invalid.
    // Mark every field touched so the errors render.
    (
      [
        'name',
        'description',
        'propertyType',
        'enumConfig',
        'formatConfig',
        'entityReferenceConfig',
        'columns',
      ] as const
    ).forEach((field) => createTouched.add(field));
    return;
  }
  const selected = selectedPropertyType.value;
  if (!selected) {
    return;
  }
  buttonLoading.value = true;
  try {
    await addOrUpdateCustomProperty(
      typeIdValue,
      toCustomPropertyPayload(createValues.value, { id: selected.id, name: selected.name }),
    );
    message.success(t('server.create-entity-success', { entity: t('label.custom-property') }));
    drawerOpen.value = false;
    await load();
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('crud.updateFailed'));
  } finally {
    buttonLoading.value = false;
  }
}

/**
 * Official edit submit: the modal closes after the update await in every
 * outcome (success, target-gone, error) — never left open on a missing
 * target. Zero success toasts on the update chain (INV-19 (a)).
 */
async function onEditSave(): Promise<void> {
  const target = editingDef.value;
  if (!target) {
    return;
  }
  editAttempted.value = true;
  if (editIssues.value.length > 0) {
    return;
  }
  const changes = getCustomPropertyChanges(target, editForm);
  editSaving.value = true;
  try {
    await runPropertyChange(
      () => updateCustomPropertyByName(props.entityType, target.name, changes),
      () => message.error(t('server.update-entity-error', { entity: t('label.custom-property') })),
    );
  } finally {
    editSaving.value = false;
    closeEdit();
  }
}

async function onDeleteConfirm(): Promise<void> {
  const target = deleteTarget.value;
  if (!target) {
    return;
  }
  await runPropertyChange(() => deleteCustomPropertyByName(props.entityType, target.name));
  deleteTarget.value = null;
}

function onTypeFilterChange(value: unknown): void {
  selectedTypes.value = Array.isArray(value) ? value.map((item) => String(item)) : [];
}

watch(searchInput, () => {
  if (searchTimer !== undefined) {
    clearTimeout(searchTimer);
  }
  // Official typingInterval 300ms; product setTimeout pattern (PermissionDebuggerView).
  searchTimer = setTimeout(() => {
    appliedSearch.value = searchInput.value;
  }, 300);
});

onUnmounted(() => {
  if (searchTimer !== undefined) {
    clearTimeout(searchTimer);
  }
});

onMounted(() => {
  // Divergence note (M-7, comment only — do not change behavior here):
  // this mount chain is serial with per-call catches, and load() runs
  // even when loadPropertyTypes() fails (its catch swallows the error,
  // so the .then always fires). The shell branch's B-1 fix takes the
  // opposite shape — a chained catch that SKIPS load() on failure.
  // Reconcile the two shapes at merge; ownership TBD.
  void loadPropertyTypes().then(() => load());
});

watch(
  () => props.entityType,
  () => {
    searchInput.value = '';
    appliedSearch.value = '';
    selectedTypes.value = [];
    activeTab.value = 'custom-properties';
    isError.value = false;
    void load();
  },
);
</script>

<template>
  <!-- Official isError: the whole page is replaced by the placeholder;
       no breadcrumb, no header, no tabs. -->
  <div v-if="isError" class="custom-property-error-host">
    <NoDataPlaceholder test-id="no-data-placeholder" />
  </div>
  <EntityDetailShell
    v-else
    :title="pageTitle"
    :lead="pageLead"
    :loading="loading"
    :tabs="tabs"
    :active-tab="activeTab"
    :breadcrumbs="breadcrumbs"
    @update:active-tab="activeTab = $event"
  >
    <template #actions>
      <Button
        v-if="editPermission && activeTab === 'custom-properties'"
        type="primary"
        data-testid="add-field-button"
        @click="openCreate"
      >
        <template #icon><PlusOutlined /></template>
        {{ t('label.add-entity', { entity: t('label.property') }) }}
      </Button>
    </template>
    <template #custom-properties>
      <!-- SmTable cannot express the title slot, the locale VNode empty
           states, or the string widths/sorter the pin table needs, so the
           pin table is rendered with antd Table directly (precedent:
           IntakeFormsTable, BulkEntityImportView). Integration decision:
           kept — folding back would require extending the shared SmTable
           for this one consumer. -->
      <Table
        :columns="columns"
        :data-source="filteredDefinitions"
        row-key="name"
        :pagination="false"
        :loading="loading"
        size="small"
        data-testid="admin-custom-property-defs-table"
      >
        <template #title>
          <div class="custom-property-table-tools">
            <Input
              v-model:value="searchInput"
              data-testid="custom-property-search"
              :placeholder="t('label.search-entity', { entity: t('label.property-plural') })"
              allow-clear
              style="width: 320px"
            />
            <Select
              :value="activeTypeFilters"
              mode="multiple"
              data-testid="custom-property-type-filter"
              :placeholder="t('label.type')"
              :options="typeFilterOptions"
              allow-clear
              style="width: 280px"
              @change="onTypeFilterChange"
            />
          </div>
        </template>
        <template #emptyText>
          <div class="custom-property-empty-host">
            <NoSearchResultsPlaceholder
              v-if="appliedSearch"
              :title="noResultsTitle"
              :description="t('message.try-adjusting-filter')"
            />
            <NoFilteredResultsPlaceholder
              v-else-if="activeTypeFilters.length > 0"
              :title="noResultsTitle"
              :description="t('message.try-adjusting-filter')"
            />
            <CreatePlaceholder
              v-else
              :test-id="createPlaceholderTestId"
              :doc="ADD_CUSTOM_PROPERTIES_DOCS"
              :heading="t('label.property')"
              :permission="editPermission"
              :permission-value="
                t('label.create-entity', { entity: t('label.custom-property') })
              "
            />
          </div>
        </template>
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'name'">
            <div data-testid="property-name" class="custom-property-name">
              {{ getEntityName(record as CustomPropertyDef) }}
            </div>
            <Tooltip
              v-if="descriptionText(record as CustomPropertyDef)"
              :title="descriptionText(record as CustomPropertyDef)"
            >
              <div data-testid="property-description" class="custom-property-description">
                {{ descriptionText(record as CustomPropertyDef) }}
              </div>
            </Tooltip>
          </template>
          <template v-else-if="column.key === 'propertyType'">
            <Tag
              :color="badgeTagColor(badgeFor(record as CustomPropertyDef))"
              :class="{
                'custom-property-type-badge--wide': badgeFor(record as CustomPropertyDef).isWide,
              }"
              data-testid="property-type"
            >
              {{ badgeLabel(badgeFor(record as CustomPropertyDef)) }}
            </Tag>
          </template>
          <template v-else-if="column.key === 'customPropertyConfig'">
            <div
              v-if="configFor(record as CustomPropertyDef).summary"
              :data-testid="configFor(record as CustomPropertyDef).summary?.testId"
            >
              <Typography.Text type="secondary" class="custom-property-config__label">
                {{ configLabel(configFor(record as CustomPropertyDef).summary!) }}
              </Typography.Text>
              <div class="custom-property-config__chips">
                <Tag
                  v-for="(value, index) in configFor(record as CustomPropertyDef).visible"
                  :key="`${index}-${value}`"
                  data-testid="config-value"
                >
                  {{ value }}
                </Tag>
                <Tag
                  v-if="configFor(record as CustomPropertyDef).hidden.length > 0"
                  data-testid="config-hidden-count"
                >
                  {{
                    t('label.plus-count', {
                      count: configFor(record as CustomPropertyDef).hidden.length,
                    })
                  }}
                </Tag>
              </div>
            </div>
            <span v-else data-testid="no-config">—</span>
          </template>
          <template v-else-if="column.key === 'actions'">
            <!-- Pin renders the Actions cell null when neither Edit nor
                 Delete is allowed — hidden, not disabled. Both ride the
                 same hasAccess flag (no edit/delete split). -->
            <Dropdown
              v-if="editPermission"
              :menu="dropdownMenu(record as CustomPropertyDef)"
              trigger="click"
              :get-popup-container="getPopupContainer"
            >
              <Button type="text" data-testid="property-actions">
                <template #icon><MoreOutlined /></template>
              </Button>
            </Dropdown>
          </template>
        </template>
      </Table>
    </template>
    <template #schema>
      <SmCodeEditor
        :value="schemaValue"
        class-name="custom-properties-schemaEditor"
        editor-class="custom-entity-schema"
      />
    </template>
  </EntityDetailShell>
  <!-- Create drawer: stays mounted, resets on open; width 1200 with the
       help panel, 700 without. The drawer/overlay structure is view-local
       antd consumption; the SYS-1 shared drawer extension is an
       integration-line item. The contract testids live on wrapper divs:
       antd Drawer/Modal swallow fallthrough attrs (inheritAttrs: false).
       -->
  <div data-testid="add-custom-property-drawer">
  <Drawer
    :open="drawerOpen"
    :width="showSidePanel ? 1200 : 700"
    :destroy-on-close="false"
    :get-container="false"
    @close="drawerOpen = false"
  >
    <template #title>
      {{ t('label.add-entity', { entity: t('label.custom-property') }) }}
    </template>
    <template #extra>
      <span class="custom-property-drawer-extra">
        <Switch v-model:checked="showSidePanel" data-testid="show-side-panel-switch" />
        {{ t('label.show-help-text') }}
      </span>
    </template>
    <div
      class="custom-property-drawer-body"
      :class="{ 'custom-property-drawer-body--split': showSidePanel }"
    >
      <div class="custom-property-drawer-form">
        <Form layout="vertical" data-testid="custom-property-form" @focusin="onDrawerFocusIn">
          <div class="custom-property-form-row">
            <Form.Item
              :label="t('label.name')"
              :extra="t('message.custom-property-name-help')"
              required
              :validate-status="createFieldError('name') ? 'error' : undefined"
              :help="createFieldError('name')"
              data-doc-field="root/name"
            >
              <Input
                v-model:value="createForm.name"
                data-testid="custom-property-name"
                :placeholder="t('label.name')"
              />
            </Form.Item>
            <Form.Item
              :label="t('label.display-name')"
              :extra="t('message.custom-property-display-name-help')"
              data-doc-field="root/displayName"
            >
              <Input
                v-model:value="createForm.displayName"
                data-testid="custom-property-display-name"
                :placeholder="t('label.display-name')"
              />
            </Form.Item>
          </div>
          <Form.Item
            :label="t('label.type')"
            :extra="t('message.custom-property-type-help')"
            required
            :validate-status="createFieldError('propertyType') ? 'error' : undefined"
            :help="createFieldError('propertyType')"
            data-doc-field="root/propertyType"
          >
            <Select
              v-model:value="createForm.propertyTypeId"
              data-testid="custom-property-type"
              style="width: 100%"
              :options="propertyTypeOptions"
              :placeholder="t('label.select-field', { field: t('label.type') })"
              @change="onPropertyTypeChange"
            />
          </Form.Item>
          <!-- Official "Applies to: Table Column" badge, tableColumn only. -->
          <div v-if="props.entityType === 'tableColumn'" class="custom-property-applies-to">
            <span>{{ t('label.applies-to') }}</span>
            <Tag data-testid="applies-to">{{ t('label.table-column') }}</Tag>
          </div>
          <template v-if="createTypeFlags.hasEnumConfig">
            <Form.Item
              :label="t('label.enum-value-plural')"
              :extra="t('message.custom-property-enum-config-help')"
              required
              :validate-status="createFieldError('enumConfig') ? 'error' : undefined"
              :help="createFieldError('enumConfig')"
              data-doc-field="root/enumConfig"
            >
              <Select
                v-model:value="createForm.enumConfig"
                mode="tags"
                data-testid="custom-property-enum-config"
                :token-separators="[',']"
                style="width: 100%"
                :placeholder="t('label.enum-value-plural')"
              />
            </Form.Item>
            <Form.Item
              :label="t('label.multi-select')"
              :extra="t('message.custom-property-multi-select-help')"
              data-doc-field="root/multiSelect"
            >
              <Switch
                v-model:checked="createForm.multiSelect"
                data-testid="custom-property-multi-select"
              />
            </Form.Item>
          </template>
          <Form.Item
            v-if="createTypeFlags.hasFormatConfig"
            :label="t('label.format')"
            :extra="t('message.custom-property-format-config-help')"
            :validate-status="createFieldError('formatConfig') ? 'error' : undefined"
            :help="createFieldError('formatConfig')"
            data-doc-field="root/formatConfig"
          >
            <Select
              v-model:value="createForm.formatConfig"
              data-testid="custom-property-format-config"
              :options="formatOptions"
              style="width: 100%"
              :placeholder="t('label.format')"
            />
          </Form.Item>
          <Form.Item
            v-if="createTypeFlags.hasEntityReferenceConfig"
            :label="t('label.entity-reference-types')"
            :extra="t('message.custom-property-entity-reference-config-help')"
            required
            :validate-status="createFieldError('entityReferenceConfig') ? 'error' : undefined"
            :help="createFieldError('entityReferenceConfig')"
            data-doc-field="root/entityReferenceConfig"
          >
            <Select
              v-model:value="createForm.entityReferenceConfig"
              mode="multiple"
              data-testid="custom-property-entity-ref-config"
              :options="entityReferenceOptions"
              style="width: 100%"
              :placeholder="t('label.select-field', { field: t('label.type') })"
            />
          </Form.Item>
          <Form.Item
            v-if="createTypeFlags.hasTableTypeConfig"
            :label="t('label.column-plural')"
            required
            :validate-status="createFieldError('columns') ? 'error' : undefined"
            :help="createFieldError('columns')"
            data-doc-field="root/columns"
          >
            <Select
              v-model:value="createForm.columns"
              mode="tags"
              data-testid="custom-property-columns"
              :token-separators="[',']"
              style="width: 100%"
              :placeholder="t('label.column-plural')"
            />
          </Form.Item>
          <div data-doc-field="root/description">
            <Form.Item
              :label="t('label.description')"
              :extra="t('message.custom-property-description-help')"
              required
              :validate-status="createFieldError('description') ? 'error' : undefined"
              :help="createFieldError('description')"
            >
              <SmRichTextEditor
                :key="descriptionKey"
                :initial-value="createForm.description"
                @text-change="createForm.description = $event"
                @focus="activeField = 'root/description'"
              />
            </Form.Item>
          </div>
        </Form>
      </div>
      <div v-if="showSidePanel" class="custom-property-drawer-doc">
        <ServiceDocPanel
          :active-field="activeField"
          service-name="CustomProperty"
          service-type="OpenMetadata"
        />
      </div>
    </div>
    <template #footer>
      <div class="custom-property-drawer-footer">
        <Button data-testid="cancel-button" :disabled="buttonLoading" @click="drawerOpen = false">
          {{ t('crud.cancel') }}
        </Button>
        <Button
          type="primary"
          data-testid="create-button"
          :disabled="buttonLoading || !createValid"
          :loading="buttonLoading"
          @click="onCreateSubmit"
        >
          {{ t('crud.create') }}
        </Button>
      </div>
    </template>
  </Drawer>
  </div>
  <!-- Independent edit modal (720px): no name/type fields, no field docs;
       the saving-in-progress enum Alert shows only while saving. -->
  <div data-testid="edit-custom-property-modal">
  <Modal
    :open="editOpen"
    :width="720"
    :get-container="false"
    :mask-closable="!editSaving"
    :keyboard="!editSaving"
    @cancel="closeEdit"
  >
    <template #title>
      {{
        t('label.edit-entity-name', {
          entityType: t('label.property'),
          entityName: editingName ?? '',
        })
      }}
    </template>
    <Form layout="vertical" data-testid="edit-custom-property-form">
      <Form.Item :label="t('label.display-name')">
        <Input
          v-model:value="editForm.displayName"
          data-testid="edit-custom-property-display-name"
          :placeholder="t('label.display-name')"
        />
      </Form.Item>
      <template v-if="editTypeFlags.hasEnumConfig">
        <Form.Item
          :label="t('label.enum-value-plural')"
          required
          :validate-status="editFieldError('enumConfig') ? 'error' : undefined"
          :help="editFieldError('enumConfig')"
        >
          <Select
            v-model:value="editForm.enumConfig"
            mode="tags"
            data-testid="edit-custom-property-enum-config"
            :options="existingEnumOptions"
            :max-tag-count="ENUM_CONFIG_MAX_VISIBLE_VALUES"
            :token-separators="[',']"
            style="width: 100%"
            :placeholder="t('label.enum-value-plural')"
          />
        </Form.Item>
        <Form.Item :label="t('label.multi-select')">
          <Switch
            v-model:checked="editForm.multiSelect"
            data-testid="edit-custom-property-multi-select"
          />
        </Form.Item>
      </template>
      <Form.Item
        v-if="editTypeFlags.hasEntityReferenceConfig"
        :label="t('label.entity-reference-types')"
        :extra="t('message.updating-existing-not-possible-can-add-new-values')"
        required
        :validate-status="editFieldError('entityReferenceConfig') ? 'error' : undefined"
        :help="editFieldError('entityReferenceConfig')"
      >
        <Select
          v-model:value="editForm.entityReferenceConfig"
          mode="multiple"
          data-testid="edit-custom-property-entity-ref-config"
          :options="entityReferenceOptions"
          style="width: 100%"
          :placeholder="t('label.select-field', { field: t('label.type') })"
        >
          <template #tagRender="{ value, label, onClose }">
            <Tag
              v-if="savedEntityRefs.includes(String(value))"
              data-testid="autocomplete-selected-item"
            >
              {{ label }}
            </Tag>
            <Tag v-else closable data-testid="autocomplete-selected-item" @close="onClose">
              {{ label }}
            </Tag>
          </template>
        </Select>
      </Form.Item>
      <Form.Item
        :label="t('label.description')"
        required
        :validate-status="editFieldError('description') ? 'error' : undefined"
        :help="editFieldError('description')"
      >
        <SmRichTextEditor
          :key="editEditorKey"
          :initial-value="editForm.description"
          @text-change="editForm.description = $event"
        />
      </Form.Item>
    </Form>
    <Alert
      v-if="editSaving && editTypeFlags.hasEnumConfig"
      type="success"
      :message="t('message.enum-property-update-message')"
    />
    <template #footer>
      <Button
        data-testid="edit-custom-property-cancel"
        :disabled="editSaving"
        @click="closeEdit"
      >
        {{ t('crud.cancel') }}
      </Button>
      <Button
        type="primary"
        data-testid="edit-custom-property-save"
        :loading="editSaving"
        @click="onEditSave"
      >
        {{ t('crud.save') }}
      </Button>
    </template>
  </Modal>
  </div>
  <!-- Delete confirmation: primary (non-destructive) confirm, mask and
       Escape cannot dismiss, the X button stays wired. -->
  <div data-testid="confirmation-modal">
  <Modal
    :open="deleteTarget !== null"
    :width="520"
    :get-container="false"
    :mask-closable="false"
    :keyboard="false"
    @cancel="deleteTarget = null"
  >
    <template #title>
      <span data-testid="modal-header">
        {{ t('label.delete-property-name', { propertyName: deleteTarget?.name ?? '' }) }}
      </span>
    </template>
    <p data-testid="body-text">
      {{ t('message.are-you-sure-delete-property', { propertyName: deleteTarget?.name ?? '' }) }}
    </p>
    <template #footer>
      <Button data-testid="cancel" @click="deleteTarget = null">{{ t('crud.cancel') }}</Button>
      <Button
        type="primary"
        :data-testid="buttonLoading ? 'loading-button' : 'save-button'"
        :loading="buttonLoading"
        @click="onDeleteConfirm"
      >
        {{ t('label.confirm') }}
      </Button>
    </template>
  </Modal>
  </div>
</template>

<style scoped>
.custom-property-table-tools {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}
.custom-property-empty-host {
  position: relative;
  min-height: 240px;
}
.custom-property-error-host {
  position: relative;
  min-height: 240px;
  border-radius: 12px;
  background: var(--sm-bg-container, transparent);
}
.custom-property-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.custom-property-description {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.custom-property-type-badge--wide {
  min-width: 96px;
  text-align: center;
}
.custom-property-config__label {
  display: block;
  font-size: 12px;
  margin-bottom: 4px;
}
.custom-property-config__chips {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
}
.custom-property-drawer-extra {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}
.custom-property-drawer-body--split {
  display: flex;
  gap: 24px;
}
.custom-property-drawer-body--split .custom-property-drawer-form {
  flex: 3 1 0;
  min-width: 0;
}
.custom-property-drawer-doc {
  flex: 2 1 0;
  min-width: 0;
  border-left: 1px solid var(--sm-border-secondary);
  padding-left: 24px;
}
.custom-property-drawer-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
.custom-property-form-row {
  display: flex;
  gap: 16px;
}
.custom-property-form-row .ant-form-item {
  flex: 1;
  min-width: 0;
}
.custom-property-applies-to {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
  margin-bottom: 24px;
  font-size: 13px;
}
</style>
