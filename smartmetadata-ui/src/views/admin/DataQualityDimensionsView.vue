<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
  Official DataQualitySettingsPage + DimensionForm + DeleteDimensionModal:
  dimension list with test-case counts, search, 75% create/edit drawer
  with the 11-colour palette and live preview, and the impact-aware
  delete confirmation. No Refresh button (deletion 6.11).
-->
<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import {
  DeleteOutlined,
  EditOutlined,
  PlusCircleOutlined,
} from '@ant-design/icons-vue';
import {
  Button,
  Col,
  Drawer,
  Input,
  Modal,
  Row,
  Space,
  Tag,
  Tooltip,
  Typography,
  message,
} from 'ant-design-vue';
import { compare } from 'fast-json-patch';
import {
  createDataQualityDimension,
  deleteDataQualityDimension,
  getDataQualityDimensionTestCaseCounts,
  getDataQualityDimensionTestDefinitionCounts,
  listDataQualityDimensions,
  patchDataQualityDimension,
} from '@/api/dataQualityDimensions';
import CreatePlaceholder from '@/components/shared/CreatePlaceholder.vue';
import DescriptionCell from '@/components/shared/DescriptionCell.vue';
import NoSearchResultsPlaceholder from '@/components/shared/NoSearchResultsPlaceholder.vue';
import SmTable from '@/components/shared/SmTable.vue';
import PreferencePageShell from '@/features/settings/PreferencePageShell.vue';
import type { DataQualityDimension } from '@/types/admin';
import { descriptionColumnDef } from '@/utils/columns';

const { t } = useI18n();

const AGGREGATE_PAGE_SIZE_LARGE = 1000;
const DEFAULT_COLOR = '#175CD3';
const SEARCH_TYPING_INTERVAL = 350;
const NAME_PATTERN = /^[\w-]+$/;

// Official DIMENSION_COLOR_OPTIONS (DataQualityDimension.constants).
const COLOR_OPTIONS: { color: string; labelKey: string }[] = [
  { color: '#175CD3', labelKey: 'settings.dqDimensions.colorDarkBlue' },
  { color: '#2E90FA', labelKey: 'settings.dqDimensions.colorBlue' },
  { color: '#067647', labelKey: 'settings.dqDimensions.colorGreen' },
  { color: '#B54708', labelKey: 'settings.dqDimensions.colorYellow' },
  { color: '#C4320A', labelKey: 'settings.dqDimensions.colorOrange' },
  { color: '#D92D20', labelKey: 'settings.dqDimensions.colorRed' },
  { color: '#7A5AF8', labelKey: 'settings.dqDimensions.colorViolet' },
  { color: '#6938EF', labelKey: 'settings.dqDimensions.colorPurple' },
  { color: '#C11574', labelKey: 'settings.dqDimensions.colorPink' },
  { color: '#099250', labelKey: 'settings.dqDimensions.colorTeal' },
  { color: '#475467', labelKey: 'settings.dqDimensions.colorGray' },
];

type DrawerState =
  | { mode: 'closed' }
  | { mode: 'create' }
  | { mode: 'edit'; dimension: DataQualityDimension };

const loading = ref(false);
const saving = ref(false);
const deleting = ref(false);
const dimensions = ref<DataQualityDimension[]>([]);
const testCaseCounts = ref<Record<string, number> | undefined>(undefined);
const testDefinitionCounts = ref<Record<string, number> | undefined>(undefined);
const searchInput = ref('');
const searchTerm = ref('');
const drawer = ref<DrawerState>({ mode: 'closed' });
const deletingDimension = ref<DataQualityDimension | undefined>(undefined);
const saveAttempted = ref(false);
const nameTouched = ref(false);

const form = reactive({
  name: '',
  displayName: '',
  description: '',
  color: DEFAULT_COLOR,
});

const swatchRefs = ref<(HTMLButtonElement | null)[]>([]);

const editing = computed(() =>
  drawer.value.mode === 'edit' ? drawer.value.dimension : undefined,
);
const drawerOpen = computed(() => drawer.value.mode !== 'closed');

const columns = computed(() => [
  { title: t('settings.dqDimensions.dimension'), dataIndex: 'name', key: 'name' },
  ...descriptionColumnDef(t('settings.dqDimensions.description')),
  {
    title: t('settings.dqDimensions.type'),
    dataIndex: 'provider',
    key: 'provider',
    width: 120,
  },
  { title: t('settings.dqDimensions.testCases'), key: 'testCases', width: 120 },
  { title: t('settings.dqDimensions.actions'), key: 'actions', width: 100, align: 'center' as const },
]);

let searchTimer: ReturnType<typeof setTimeout> | undefined;
function onSearchInput(value: string): void {
  searchInput.value = value;
  if (searchTimer !== undefined) {
    clearTimeout(searchTimer);
  }
  searchTimer = setTimeout(() => {
    searchTerm.value = value;
  }, SEARCH_TYPING_INTERVAL);
}

onUnmounted(() => {
  if (searchTimer !== undefined) {
    clearTimeout(searchTimer);
  }
});

const filteredDimensions = computed(() => {
  const term = searchTerm.value.trim().toLowerCase();
  if (!term) {
    return dimensions.value;
  }
  return dimensions.value.filter((dimension) =>
    [dimension.name, dimension.displayName, dimension.description].some((value) =>
      value?.toLowerCase().includes(term),
    ),
  );
});

function countFor(
  counts: Record<string, number> | undefined,
  dimension: DataQualityDimension | undefined,
  fallback: number | string | undefined,
): number | string | undefined {
  return counts?.[dimension?.id ?? ''] ?? fallback;
}

async function load(): Promise<void> {
  loading.value = true;
  try {
    const [page, counts, definitionCounts] = await Promise.all([
      listDataQualityDimensions({ limit: AGGREGATE_PAGE_SIZE_LARGE }),
      // A missing count must not hide the list: it stays undefined so the
      // table and the delete confirmation report it as unknown, not zero.
      getDataQualityDimensionTestCaseCounts().catch(() => undefined),
      getDataQualityDimensionTestDefinitionCounts().catch(() => undefined),
    ]);
    dimensions.value = page.data;
    testCaseCounts.value = counts;
    testDefinitionCounts.value = definitionCounts;
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('settings.dqDimensions.loadFailed'));
  } finally {
    loading.value = false;
  }
}

function openCreate(): void {
  form.name = '';
  form.displayName = '';
  form.description = '';
  form.color = DEFAULT_COLOR;
  saveAttempted.value = false;
  nameTouched.value = false;
  drawer.value = { mode: 'create' };
}

function openEdit(dimension: DataQualityDimension): void {
  form.name = dimension.name;
  form.displayName = dimension.displayName ?? '';
  form.description = dimension.description ?? '';
  form.color = dimension.style?.color ?? DEFAULT_COLOR;
  saveAttempted.value = false;
  nameTouched.value = false;
  drawer.value = { mode: 'edit', dimension };
}

function closeDrawer(): void {
  drawer.value = { mode: 'closed' };
}

function nameError(): string | null {
  if (!form.name) {
    return t('settings.dqDimensions.fieldRequired', {
      field: t('settings.dqDimensions.name'),
    });
  }
  if (!NAME_PATTERN.test(form.name)) {
    return t('settings.dqDimensions.nameInvalid');
  }
  return null;
}

function showNameError(): boolean {
  return saveAttempted.value || nameTouched.value;
}

const previewLabel = computed(
  () => form.displayName || form.name || t('settings.dqDimensions.dimension'),
);

function isRovingTabStop(swatch: string, index: number): boolean {
  return (
    form.color === swatch ||
    (index === 0 && !COLOR_OPTIONS.some((option) => option.color === form.color))
  );
}

const KEY_OFFSETS: Record<string, number> = {
  ArrowRight: 1,
  ArrowDown: 1,
  ArrowLeft: -1,
  ArrowUp: -1,
};

function onSwatchKeyDown(event: KeyboardEvent, index: number): void {
  const offset = KEY_OFFSETS[event.key];
  let nextIndex: number | undefined;
  if (offset !== undefined) {
    nextIndex = (index + offset + COLOR_OPTIONS.length) % COLOR_OPTIONS.length;
  } else if (event.key === 'Home') {
    nextIndex = 0;
  } else if (event.key === 'End') {
    nextIndex = COLOR_OPTIONS.length - 1;
  }
  if (nextIndex === undefined) {
    return;
  }
  event.preventDefault();
  form.color = COLOR_OPTIONS[nextIndex].color;
  swatchRefs.value[nextIndex]?.focus();
}

async function save(): Promise<void> {
  saveAttempted.value = true;
  if (nameError() !== null) {
    return;
  }
  saving.value = true;
  try {
    const current = editing.value;
    if (current) {
      const updated: DataQualityDimension = {
        ...current,
        displayName: form.displayName || undefined,
        description: form.description || undefined,
        style: { ...current.style, color: form.color },
      };
      await patchDataQualityDimension(current.id, compare(current, updated));
      message.success(
        t('settings.dqDimensions.updated', { entity: t('settings.dqDimensions.dimension') }),
      );
    } else {
      await createDataQualityDimension({
        name: form.name,
        displayName: form.displayName || undefined,
        description: form.description || undefined,
        style: { color: form.color },
      });
      message.success(
        t('settings.dqDimensions.created', { entity: t('settings.dqDimensions.dimension') }),
      );
    }
    closeDrawer();
    await load();
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('settings.dqDimensions.saveFailed'));
  } finally {
    saving.value = false;
  }
}

async function confirmDelete(): Promise<void> {
  const target = deletingDimension.value;
  if (!target?.id) {
    return;
  }
  deleting.value = true;
  try {
    await deleteDataQualityDimension(target.id);
    message.success(
      t('settings.dqDimensions.deleted', { entity: t('settings.dqDimensions.dimension') }),
    );
    deletingDimension.value = undefined;
    await load();
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('settings.dqDimensions.deleteFailed'));
  } finally {
    deleting.value = false;
  }
}

const deletingCount = computed(() => countFor(testCaseCounts.value, deletingDimension.value, undefined));
const deletingDefinitionCount = computed(() =>
  countFor(testDefinitionCounts.value, deletingDimension.value, undefined),
);
const deletingImpactUnknown = computed(
  () => deletingCount.value === undefined || deletingDefinitionCount.value === undefined,
);
const deletingHasReferences = computed(
  () => Boolean(deletingCount.value) || Boolean(deletingDefinitionCount.value),
);

onMounted(() => {
  void load();
});
</script>

<template>
  <PreferencePageShell
    test-id="dq-dimensions"
    :title="t('settings.dqDimensions.title')"
    :lead="t('settings.dqDimensions.lead')"
    :loading="loading"
  >
    <div class="dq-actions">
      <Button type="primary" data-testid="add-dimension" @click="openCreate">
        <PlusCircleOutlined />
        {{ t('settings.dqDimensions.addDimension') }}
      </Button>
    </div>
    <Input.Search
      :value="searchInput"
      :placeholder="t('settings.dqDimensions.searchPlaceholder')"
      data-testid="search-dimensions"
      style="margin-bottom: 16px"
      @update:value="onSearchInput"
    />
    <div
      v-if="filteredDimensions.length === 0 && searchTerm"
      class="dq-placeholder"
    >
      <NoSearchResultsPlaceholder test-id="search-error-placeholder" />
    </div>
    <div
      v-else-if="filteredDimensions.length === 0"
      class="dq-placeholder"
    >
      <CreatePlaceholder
        :permission="true"
        :heading="t('settings.dqDimensions.dimension')"
        :title="t('settings.dqDimensions.dimension')"
        :permission-value="t('settings.dqDimensions.createDimension')"
        :test-id="`create-error-placeholder-${t('settings.dqDimensions.dimension')}`"
        :on-create="openCreate"
      />
    </div>
    <SmTable
      v-else
      row-key="id"
      :columns="columns"
      :data-source="filteredDimensions"
      :pagination="false"
      size="small"
      test-id="dimensions-table"
    >
      <template #bodyCell="{ column, record }">
        <template v-if="column.key === 'name'">
          <div
            :data-testid="`dimension-${(record as DataQualityDimension).name}`"
            class="dq-dimension-cell"
          >
            <span
              class="dq-color-dot"
              :style="{ backgroundColor: (record as DataQualityDimension).style?.color ?? DEFAULT_COLOR }"
            />
            <span class="dq-dimension-names">
              <Typography.Text strong>
                {{ (record as DataQualityDimension).displayName ?? (record as DataQualityDimension).name }}
              </Typography.Text>
              <Typography.Text type="secondary" class="dq-technical-name">
                {{ (record as DataQualityDimension).name }}
              </Typography.Text>
            </span>
          </div>
        </template>
        <template v-else-if="column.key === 'description'">
          <DescriptionCell :markdown="(record as DataQualityDimension).description" />
        </template>
        <template v-else-if="column.key === 'provider'">
          <Tag :color="(record as DataQualityDimension).provider === 'system' ? 'default' : 'blue'">
            {{ (record as DataQualityDimension).provider === 'system' ? t('settings.dqDimensions.system') : t('settings.dqDimensions.custom') }}
          </Tag>
        </template>
        <template v-else-if="column.key === 'testCases'">
          {{ countFor(testCaseCounts, record as DataQualityDimension, '--') }}
        </template>
        <template v-else-if="column.key === 'actions'">
          <Space>
            <Tooltip
              :title="(record as DataQualityDimension).provider === 'system' ? t('settings.dqDimensions.systemReadOnly') : t('settings.dqDimensions.editDimension')"
            >
              <span>
                <Button
                  size="small"
                  :disabled="(record as DataQualityDimension).provider === 'system'"
                  :data-testid="`edit-${(record as DataQualityDimension).name}`"
                  @click="openEdit(record as DataQualityDimension)"
                >
                  <EditOutlined />
                </Button>
              </span>
            </Tooltip>
            <Tooltip
              :title="(record as DataQualityDimension).provider === 'system' ? t('settings.dqDimensions.systemReadOnly') : t('settings.dqDimensions.deleteDimension')"
            >
              <span>
                <Button
                  size="small"
                  danger
                  :disabled="(record as DataQualityDimension).provider === 'system'"
                  :data-testid="`delete-${(record as DataQualityDimension).name}`"
                  @click="deletingDimension = record as DataQualityDimension"
                >
                  <DeleteOutlined />
                </Button>
              </span>
            </Tooltip>
          </Space>
        </template>
      </template>
    </SmTable>

    <Drawer
      :open="drawerOpen"
      width="75%"
      :title="editing ? t('settings.dqDimensions.editDimension') : t('settings.dqDimensions.createDimension')"
      data-testid="dimension-drawer"
      @close="closeDrawer"
    >
      <Row :gutter="24">
        <Col :span="15">
          <div class="dq-form-field">
            <label class="dq-label" for="dimension-name">
              {{ t('settings.dqDimensions.name') }} *
            </label>
            <Input
              id="dimension-name"
              :value="form.name"
              data-testid="dimension-name"
              :disabled="Boolean(editing)"
              :status="showNameError() && nameError() ? 'error' : ''"
              @update:value="form.name = $event"
              @blur="nameTouched = true"
            />
            <Typography.Text
              :type="showNameError() && nameError() ? 'danger' : 'secondary'"
              class="dq-hint"
            >
              {{
                showNameError() && nameError()
                  ? nameError()
                  : editing
                    ? t('settings.dqDimensions.nameFixedHint')
                    : t('settings.dqDimensions.nameHelp')
              }}
            </Typography.Text>
          </div>
          <div class="dq-form-field">
            <label class="dq-label" for="dimension-display-name">
              {{ t('settings.dqDimensions.displayName') }}
            </label>
            <Input
              id="dimension-display-name"
              :value="form.displayName"
              data-testid="dimension-display-name"
              @update:value="form.displayName = $event"
            />
            <Typography.Text type="secondary" class="dq-hint">
              {{ t('settings.dqDimensions.displayNameHelp') }}
            </Typography.Text>
          </div>
          <div class="dq-form-field">
            <label class="dq-label" for="dimension-description">
              {{ t('settings.dqDimensions.description') }}
            </label>
            <Input.TextArea
              id="dimension-description"
              :value="form.description"
              data-testid="dimension-description"
              :rows="4"
              :placeholder="t('settings.dqDimensions.descriptionPlaceholder')"
              @update:value="form.description = $event"
            />
          </div>
          <div class="dq-form-field">
            <span id="dimension-color-group-label" class="dq-label">
              {{ t('settings.dqDimensions.color') }}
            </span>
            <div role="radiogroup" aria-labelledby="dimension-color-group-label" class="dq-swatches">
              <button
                v-for="(option, index) in COLOR_OPTIONS"
                :key="option.color"
                type="button"
                role="radio"
                :aria-checked="form.color === option.color"
                :aria-label="t(option.labelKey)"
                :data-testid="`color-${option.color}`"
                :tabindex="isRovingTabStop(option.color, index) ? 0 : -1"
                :style="{ backgroundColor: option.color }"
                :class="['dq-swatch', { selected: form.color === option.color }]"
                :ref="(el) => { swatchRefs[index] = el as HTMLButtonElement | null; }"
                @click="form.color = option.color"
                @keydown="onSwatchKeyDown($event, index)"
              />
            </div>
          </div>
        </Col>
        <Col :span="9">
          <div class="dq-side-panel">
            <Typography.Text type="secondary">{{ t('settings.dqDimensions.preview') }}</Typography.Text>
            <div class="dq-preview">
              <span class="dq-color-dot" :style="{ backgroundColor: form.color }" />
              <Typography.Text strong>{{ previewLabel }}</Typography.Text>
            </div>
            <Typography.Text type="secondary">
              {{ t('settings.dqDimensions.aboutDimensions') }}
            </Typography.Text>
          </div>
        </Col>
      </Row>
      <template #footer>
        <div style="display: flex; justify-content: flex-end; gap: 8px">
          <Button @click="closeDrawer">{{ t('settings.dqDimensions.cancel') }}</Button>
          <Button
            type="primary"
            :loading="saving"
            data-testid="save-dimension"
            @click="save"
          >
            {{ editing ? t('settings.dqDimensions.save') : t('settings.dqDimensions.create') }}
          </Button>
        </div>
      </template>
    </Drawer>

    <Modal
      :open="deletingDimension !== undefined"
      :title="`${t('settings.dqDimensions.delete')} ${deletingDimension?.displayName ?? deletingDimension?.name ?? ''}`"
      :confirm-loading="deleting"
      :ok-text="t('settings.dqDimensions.delete')"
      ok-type="danger"
      @cancel="deletingDimension = undefined"
      @ok="confirmDelete"
    >
      <p>
        <span>{{ t('settings.dqDimensions.deleteConfirmation') }}</span>
        <span v-if="deletingImpactUnknown || deletingHasReferences" class="dq-delete-warning">
          <Typography.Text v-if="deletingImpactUnknown" type="secondary">
            {{ t('settings.dqDimensions.impactUnknown') }}
          </Typography.Text>
          <span v-if="deletingCount">
            <Typography.Text strong>
              {{ t('settings.dqDimensions.inUseCount', { count: deletingCount }) }}
            </Typography.Text>
            <Typography.Text>{{ t('settings.dqDimensions.deleteFallback') }}</Typography.Text>
          </span>
          <span v-if="deletingDefinitionCount">
            <Typography.Text strong>
              {{ t('settings.dqDimensions.inUseTestDefinitionCount', { count: deletingDefinitionCount }) }}
            </Typography.Text>
            <Typography.Text>{{ t('settings.dqDimensions.deleteTestDefinitionFallback') }}</Typography.Text>
          </span>
        </span>
      </p>
    </Modal>
  </PreferencePageShell>
</template>

<style scoped>
.dq-actions {
  display: flex;
  justify-content: flex-end;
  margin-bottom: 16px;
}

.dq-placeholder {
  position: relative;
  min-height: 240px;
}

.dq-dimension-cell {
  display: flex;
  align-items: flex-start;
  gap: 8px;
}

.dq-dimension-names {
  display: flex;
  flex-direction: column;
}

.dq-technical-name {
  font-size: 12px;
}

.dq-color-dot {
  display: inline-block;
  flex-shrink: 0;
  width: 12px;
  height: 12px;
  margin-top: 4px;
  border-radius: 50%;
}

.dq-form-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-bottom: 20px;
}

.dq-label {
  font-size: 14px;
  font-weight: 500;
}

.dq-hint {
  font-size: 12px;
}

.dq-swatches {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.dq-swatch {
  width: 28px;
  height: 28px;
  padding: 0;
  cursor: pointer;
  border: 2px solid transparent;
  border-radius: 50%;
}

.dq-swatch.selected {
  border-color: var(--sm-color-primary);
  outline: 2px solid var(--sm-color-primary);
  outline-offset: 2px;
}

.dq-side-panel {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.dq-preview {
  display: flex;
  gap: 8px;
  align-items: center;
}

.dq-delete-warning {
  display: block;
  margin-top: 8px;
}
</style>
