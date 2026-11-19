<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
  Official LearningResourceForm: 600-wide drawer, 9 fields (first 6
  required), source URL restricted to http(s), payload carrying the
  original difficulty and context componentIds. Every close refetches
  the list (the parent owns that); this drawer only reports the close.
-->
<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { CloseOutlined } from '@ant-design/icons-vue';
import { Button, Drawer, Form, Input, Select, message } from 'ant-design-vue';
import {
  createLearningResource,
  updateLearningResource,
  type CreateLearningResourcePayload,
  type LearningResourceDetail,
} from '@/api/learningResources';
import {
  CATEGORIES,
  DURATION_ITEMS,
  LEARNING_RESOURCE_STATUSES,
  PAGE_IDS,
  RESOURCE_TYPE_LABEL_KEYS,
  RESOURCE_TYPE_VALUES,
  SOURCE_URL_PLACEHOLDERS,
  getSafeHttpUrl,
  type ResourceTypeValue,
} from './learningConstants';
import LearningResourceTypeIcon from './LearningResourceTypeIcon.vue';

const props = defineProps<{
  open: boolean;
  resource: LearningResourceDetail | null;
}>();
const emit = defineEmits<{ close: [] }>();
const { t } = useI18n();

const saving = ref(false);
const saveAttempted = ref(false);

const form = reactive({
  name: '',
  description: '',
  resourceType: null as string | null,
  categories: [] as string[],
  contexts: [] as string[],
  sourceUrl: '',
  sourceProvider: '',
  estimatedDuration: null as string | null,
  status: 'Active' as string,
});

// The Select payload type is a wide union; narrow each selection to the
// form field's type instead of assigning the union through.
function onResourceTypeSelect(value: unknown): void {
  form.resourceType = typeof value === 'string' ? value : null;
}

function onMultiSelect(field: 'categories' | 'contexts', value: unknown): void {
  form[field] = Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

function onDurationSelect(value: unknown): void {
  form.estimatedDuration = typeof value === 'string' ? value : null;
}

function onStatusSelect(value: unknown): void {
  if (typeof value === 'string') {
    form.status = value;
  }
}

const CATEGORY_OPTIONS = CATEGORIES.map(({ value, label }) => ({ value, label }));
const CONTEXT_OPTIONS = PAGE_IDS.map(({ value, label }) => ({ value, label }));
const STATUS_OPTIONS = LEARNING_RESOURCE_STATUSES.map((status) => ({
  value: status,
  label: status,
}));

// Unknown selected ids keep rendering: the official findItems falls back
// to {id, label: id} for values outside the known option lists.
const categoryOptions = computed(() => [
  ...CATEGORY_OPTIONS,
  ...form.categories
    .filter((id) => !CATEGORY_OPTIONS.some((option) => option.value === id))
    .map((id) => ({ value: id, label: id })),
]);
const contextOptions = computed(() => [
  ...CONTEXT_OPTIONS,
  ...form.contexts
    .filter((id) => !CONTEXT_OPTIONS.some((option) => option.value === id))
    .map((id) => ({ value: id, label: id })),
]);
const durationOptions = computed(() => {
  const options = DURATION_ITEMS.map((item) => ({ value: item.id, label: item.label }));
  if (
    form.estimatedDuration !== null &&
    !options.some((option) => option.value === form.estimatedDuration)
  ) {
    options.push({ value: form.estimatedDuration, label: form.estimatedDuration });
  }
  return options;
});
const statusOptions = computed(() => {
  if (STATUS_OPTIONS.some((option) => option.value === form.status)) {
    return STATUS_OPTIONS;
  }
  return [...STATUS_OPTIONS, { value: form.status, label: form.status }];
});

const sourceUrlPlaceholder = computed(
  () =>
    SOURCE_URL_PLACEHOLDERS[(form.resourceType as ResourceTypeValue) ?? 'Video'] ??
    SOURCE_URL_PLACEHOLDERS.Video,
);

function seed(): void {
  const resource = props.resource;
  form.name = resource?.name ?? '';
  form.description = resource?.description ?? '';
  form.resourceType = resource?.resourceType ?? null;
  form.categories = [...(resource?.categories ?? [])];
  form.contexts = (resource?.contexts ?? []).map((context) => context.pageId);
  form.sourceUrl = resource?.source.url ?? '';
  form.sourceProvider = resource?.source.provider ?? '';
  form.estimatedDuration =
    resource?.estimatedDuration != null ? String(resource.estimatedDuration) : null;
  form.status = resource?.status ?? 'Active';
  saveAttempted.value = false;
}

watch(
  () => props.open,
  (open) => {
    if (open) {
      seed();
    }
  },
  { immediate: true },
);

function requiredError(fieldKey: string, value: unknown): string | null {
  const empty =
    value == null || value === '' || (Array.isArray(value) && value.length === 0);
  return empty
    ? t('settings.learning.fieldRequired', { field: t(fieldKey) })
    : null;
}

function fieldError(field: string): string | null {
  switch (field) {
    case 'name':
      return requiredError('settings.learning.name', form.name);
    case 'description':
      return requiredError('settings.learning.description', form.description);
    case 'resourceType':
      return requiredError('settings.learning.type', form.resourceType);
    case 'categories':
      return requiredError('settings.learning.categories', form.categories);
    case 'contexts':
      return requiredError('settings.learning.context', form.contexts);
    case 'sourceUrl': {
      const required = requiredError('settings.learning.sourceUrl', form.sourceUrl);
      if (required) {
        return required;
      }
      return getSafeHttpUrl(form.sourceUrl)
        ? null
        : t('settings.learning.invalidUrl');
    }
    default:
      return null;
  }
}

function showError(): boolean {
  return saveAttempted.value;
}

async function save(): Promise<void> {
  saveAttempted.value = true;
  if (
    ['name', 'description', 'resourceType', 'categories', 'contexts', 'sourceUrl'].some(
      (field) => fieldError(field) !== null,
    )
  ) {
    return;
  }
  saving.value = true;
  try {
    const original = props.resource ?? undefined;
    const payload: CreateLearningResourcePayload = {
      name: form.name,
      description: form.description,
      resourceType: form.resourceType as string,
      categories: [...form.categories],
      contexts: form.contexts.map((pageId) => ({
        pageId,
        componentId: original?.contexts?.find((context) => context.pageId === pageId)
          ?.componentId,
      })),
      difficulty: original?.difficulty,
      estimatedDuration: form.estimatedDuration ? Number(form.estimatedDuration) : undefined,
      source: { url: form.sourceUrl, provider: form.sourceProvider || undefined },
      status: form.status,
    };
    if (original) {
      await updateLearningResource(payload);
      message.success(t('settings.learning.updated'));
    } else {
      await createLearningResource(payload);
      message.success(t('settings.learning.created'));
    }
    emit('close');
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('settings.learning.saveFailed'));
  } finally {
    saving.value = false;
  }
}

function close(): void {
  emit('close');
}
</script>

<template>
  <Drawer
    :open="open"
    :width="600"
    data-testid="learning-resource-form-drawer"
    :closable="false"
    @close="close"
  >
    <template #title>
      <div class="learning-form-title">
        <span>{{ resource ? t('settings.learning.editResource') : t('settings.learning.addResource') }}</span>
        <CloseOutlined @click="close" />
      </div>
    </template>
    <Form layout="vertical">
      <Form.Item
        :label="t('settings.learning.name')"
        required
        :validate-status="showError() && fieldError('name') ? 'error' : ''"
        :help="showError() ? (fieldError('name') ?? '') : ''"
      >
        <Input
          :value="form.name"
          data-testid="name-input"
          :disabled="Boolean(resource)"
          :placeholder="t('settings.learning.enterName')"
          @update:value="form.name = $event"
        />
      </Form.Item>
      <Form.Item
        :label="t('settings.learning.description')"
        required
        :validate-status="showError() && fieldError('description') ? 'error' : ''"
        :help="showError() ? (fieldError('description') ?? '') : ''"
      >
        <Input.TextArea
          :value="form.description"
          data-testid="description-input"
          :rows="4"
          @update:value="form.description = $event"
        />
      </Form.Item>
      <Form.Item
        :label="t('settings.learning.type')"
        required
        :validate-status="showError() && fieldError('resourceType') ? 'error' : ''"
        :help="showError() ? (fieldError('resourceType') ?? '') : ''"
      >
        <Select
          :value="form.resourceType ?? undefined"
          data-testid="resource-type-select"
          :placeholder="t('settings.learning.selectType')"
          @update:value="onResourceTypeSelect"
        >
          <Select.Option
            v-for="type in RESOURCE_TYPE_VALUES"
            :key="type"
            :value="type"
          >
            <LearningResourceTypeIcon :resource-type="type" />
            {{ t(RESOURCE_TYPE_LABEL_KEYS[type]) }}
          </Select.Option>
        </Select>
      </Form.Item>
      <Form.Item
        :label="t('settings.learning.categories')"
        required
        :validate-status="showError() && fieldError('categories') ? 'error' : ''"
        :help="showError() ? (fieldError('categories') ?? '') : ''"
      >
        <Select
          :value="form.categories"
          mode="multiple"
          data-testid="categories-select"
          :placeholder="t('settings.learning.selectType')"
          :options="categoryOptions"
          @update:value="onMultiSelect('categories', $event)"
        />
      </Form.Item>
      <Form.Item
        :label="t('settings.learning.context')"
        required
        :validate-status="showError() && fieldError('contexts') ? 'error' : ''"
        :help="showError() ? (fieldError('contexts') ?? '') : ''"
      >
        <Select
          :value="form.contexts"
          mode="multiple"
          data-testid="contexts-select"
          :placeholder="t('settings.learning.selectContext')"
          :options="contextOptions"
          @update:value="onMultiSelect('contexts', $event)"
        />
      </Form.Item>
      <Form.Item
        :label="t('settings.learning.sourceUrl')"
        required
        :validate-status="showError() && fieldError('sourceUrl') ? 'error' : ''"
        :help="showError() ? (fieldError('sourceUrl') ?? '') : ''"
      >
        <Input
          :value="form.sourceUrl"
          data-testid="source-url-input"
          :placeholder="sourceUrlPlaceholder"
          @update:value="form.sourceUrl = $event"
        />
      </Form.Item>
      <Form.Item :label="t('settings.learning.sourceProvider')">
        <Input
          :value="form.sourceProvider"
          data-testid="source-provider-input"
          placeholder="YouTube, Storylane, etc."
          @update:value="form.sourceProvider = $event"
        />
      </Form.Item>
      <Form.Item :label="t('settings.learning.duration')">
        <Select
          :value="form.estimatedDuration ?? undefined"
          data-testid="duration-select"
          :placeholder="t('settings.learning.selectDuration')"
          :options="durationOptions"
          allow-clear
          @update:value="onDurationSelect"
        />
      </Form.Item>
      <Form.Item :label="t('settings.learning.status')">
        <Select
          :value="form.status"
          data-testid="status-select"
          :placeholder="t('settings.learning.selectStatus')"
          :options="statusOptions"
          @update:value="onStatusSelect"
        />
      </Form.Item>
    </Form>
    <template #footer>
      <div class="learning-form-footer">
        <Button data-testid="cancel-resource" @click="close">
          {{ t('settings.learning.cancel') }}
        </Button>
        <Button
          type="primary"
          :loading="saving"
          data-testid="save-resource"
          @click="save"
        >
          {{ t('settings.learning.save') }}
        </Button>
      </div>
    </template>
  </Drawer>
</template>

<style scoped>
.learning-form-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.learning-form-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
</style>
