<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
/**
 * Pin AddSqlQueryFormModal.component.tsx: POST /v1/queries linking SQL to the
 * tested table (queryUsedIn), pre-filled from testCase.inspectionQuery.
 */
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { Button, Form, Input, message } from 'ant-design-vue';
import FormModal from '@/components/shared/FormModal.vue';
import SmCodeEditor from '@/components/shared/SmCodeEditor.vue';
import SmRichTextEditor from '@/components/shared/SmRichTextEditor.vue';
import { fetchLoggedInUser } from '@/api/auth';
import { asRecord, asString } from '@/api/json';
import { postQuery } from '@/api/queries';
import { ApiError, apiRequest } from '@/api/client';
import { encodeFqnForApi } from '@/catalog/entityRoutes';
import { getPartialNameFromTableFQN } from '@/catalog/tableJoins';
import type { TestCase } from '@/types/quality';
import { CSMode } from '@/utils/codeMirrorUtils';

const props = defineProps<{
  open: boolean;
  testCase: TestCase | null;
  canCreate: boolean;
}>();

const emit = defineEmits<{
  cancel: [];
  saved: [];
}>();

const { t } = useI18n();

const loading = ref(false);
const saving = ref(false);
const query = ref('');
const description = ref('');
const tableFqn = ref('');
const tableId = ref<string | undefined>();
const userId = ref<string | undefined>();

const queryRequiredMessage = computed(() =>
  t('message.field-required', { field: t('label.sql-uppercase-query') }),
);

async function resolveTable(entityFQN: string): Promise<void> {
  loading.value = true;
  tableId.value = undefined;
  tableFqn.value = '';
  const tableFQN = getPartialNameFromTableFQN(
    entityFQN,
    ['service', 'database', 'schema', 'table'],
    '.',
  );
  try {
    const raw = await apiRequest<Record<string, unknown>>(
      `/v1/tables/name/${encodeFqnForApi(tableFQN)}`,
    );
    tableFqn.value = asString(raw.fullyQualifiedName) || tableFQN;
    tableId.value = asString(raw.id) || undefined;
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('common.loadFailed'));
  } finally {
    loading.value = false;
  }
}

watch(
  () => [props.open, props.testCase?.entityFQN, props.testCase?.inspectionQuery] as const,
  ([open, entityFQN, inspectionQuery]) => {
    if (!open || !props.testCase) {
      return;
    }
    query.value = inspectionQuery ?? '';
    description.value = '';
    void fetchLoggedInUser()
      .then((user) => {
        userId.value = user?.id;
      })
      .catch(() => {
        userId.value = undefined;
      });
    if (entityFQN) {
      void resolveTable(entityFQN);
    } else {
      loading.value = false;
    }
  },
  { immediate: true },
);

async function onSave(): Promise<void> {
  if (!query.value.trim()) {
    message.error(queryRequiredMessage.value);
    return;
  }
  if (!props.canCreate || !tableId.value || !userId.value) {
    return;
  }
  const fqn = props.testCase?.fullyQualifiedName ?? props.testCase?.entityFQN ?? '';
  const service = getPartialNameFromTableFQN(tableFqn.value || fqn, ['service'], '.');
  saving.value = true;
  try {
    await postQuery({
      query: query.value,
      description: description.value.trim() || undefined,
      owners: [{ id: userId.value, type: 'user' }],
      queryUsedIn: [{ id: tableId.value, type: 'table' }],
      queryDate: Date.now(),
      service: service || fqn.split('.')[0],
    });
    message.success(t('server.create-entity-success', { entity: t('label.query') }));
    emit('saved');
    emit('cancel');
  } catch (error) {
    const status = error instanceof ApiError ? error.status : undefined;
    if (status === 409) {
      message.error(t('message.entity-already-exists', { entity: t('label.query') }));
    } else {
      message.error(t('server.create-entity-error', { entity: t('label.query-plural') }));
    }
  } finally {
    saving.value = false;
  }
}

const saveDisabled = computed(
  () => !props.canCreate || !tableId.value || !userId.value || !query.value.trim(),
);
</script>

<template>
  <FormModal
    :open="open"
    :title="t('label.add-new-entity', { entity: t('label.query') })"
    :ok-text="t('label.save')"
    :cancel-text="t('label.cancel')"
    size="large"
    :confirm-loading="saving"
    :ok-disabled="saveDisabled"
    @ok="onSave"
    @cancel="emit('cancel')"
  >
    <div v-if="loading" class="add-test-case-sql-query-modal__loading">{{ t('label.loading') }}</div>
    <Form v-else data-testid="query-form" layout="vertical" id="query-form">
      <Form.Item
        :label="t('label.sql-uppercase-query')"
        required
        :validate-status="!query.trim() ? undefined : 'success'"
      >
        <div data-testid="sql-editor-container">
          <SmCodeEditor
            variant="code"
            :mode="{ name: CSMode.SQL }"
            :value="query"
            :show-copy-button="false"
            editor-class="add-test-case-sql-query-modal__editor"
            @update:model-value="query = $event"
          />
        </div>
      </Form.Item>
      <Form.Item :label="t('label.table')">
        <Input data-testid="table" :value="tableFqn" disabled />
      </Form.Item>
      <Form.Item :label="t('label.description')">
        <SmRichTextEditor
          :initial-value="description"
          :place-holder="t('message.write-your-description')"
          @text-change="description = $event"
        />
      </Form.Item>
    </Form>
  </FormModal>
</template>

<style scoped>
.add-test-case-sql-query-modal__loading {
  padding: 24px;
  text-align: center;
}

:deep(.add-test-case-sql-query-modal__editor .cm-editor) {
  min-height: 200px;
}
</style>