<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { Button, Form, Input, Select, message } from 'ant-design-vue';
import FormModal from '@/components/shared/FormModal.vue';
import { createEventSubscription, deleteEventSubscription, listEventSubscriptions } from '@/api/eventSubscriptions';
import { confirmDelete } from '@/features/crud/confirmDelete';
import EntityListShell from '@/features/crud/EntityListShell.vue';
import { requiredField } from '@/features/crud/formRules';
import {
  DEFAULT_PAGE_SIZE,
  canGoNext,
  canGoPrev,
  createCursorPager,
  entityLabel,
  goNext,
  goPrev,
  type CursorPager,
} from '@/features/crud/paging';
import type { EntityListColumn } from '@/features/crud/types';
import { ALERT_TYPES, type EventSubscription } from '@/types/quality';

const { t } = useI18n();
const router = useRouter();
const loading = ref(false);
const errorMessage = ref('');
const alerts = ref<EventSubscription[]>([]);
const total = ref<number | undefined>();
const pageAfter = ref<string | undefined>();
const cursor = ref<CursorPager>(createCursorPager());
const createOpen = ref(false);
const creating = ref(false);
const form = reactive({
  name: '',
  displayName: '',
  description: '',
  alertType: 'Observability',
  webhookUrl: '',
});

const columns = computed<EntityListColumn[]>(() => [
  { title: t('crud.name'), dataIndex: 'name', key: 'name' },
  { title: t('observability.alerts.type'), dataIndex: 'alertType', key: 'alertType', width: 160 },
  { title: t('crud.enabled'), key: 'enabled', width: 100 },
  { title: t('observability.alerts.destinations'), key: 'destinations' },
]);

const hasNext = computed(() => canGoNext(pageAfter.value));
const hasPrev = computed(() => canGoPrev(cursor.value));

async function load(): Promise<void> {
  loading.value = true;
  errorMessage.value = '';
  try {
    const page = await listEventSubscriptions({ limit: DEFAULT_PAGE_SIZE, after: cursor.value.after });
    alerts.value = page.data;
    total.value = page.total;
    pageAfter.value = page.after;
  } catch (error) {
    alerts.value = [];
    errorMessage.value = error instanceof Error ? error.message : t('crud.loadFailed');
  } finally {
    loading.value = false;
  }
}

function onNext(): void {
  if (pageAfter.value) {
    cursor.value = goNext(cursor.value, pageAfter.value);
  }
  void load();
}

function onPrev(): void {
  cursor.value = goPrev(cursor.value);
  void load();
}

async function onCreate(): Promise<void> {
  creating.value = true;
  try {
    const created = await createEventSubscription({
      name: form.name.trim(),
      alertType: form.alertType,
      description: form.description.trim() || undefined,
      displayName: form.displayName.trim() || undefined,
      destinations: [
        {
          category: 'External',
          type: 'Webhook',
          config: { endpoint: form.webhookUrl.trim() },
        },
      ],
    });
    createOpen.value = false;
    message.success(t('observability.alerts.created', { name: created.name }));
    await load();
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('crud.createFailed'));
  } finally {
    creating.value = false;
  }
}

async function onDelete(record: EventSubscription): Promise<void> {
  const confirmed = await confirmDelete({
    title: t('crud.deleteTitle'),
    content: t('crud.deleteConfirm', { name: record.displayName || record.name }),
    okText: t('crud.delete'),
    cancelText: t('crud.cancel'),
  });
  if (!confirmed) {
    return;
  }
  try {
    await deleteEventSubscription(record.id);
    message.success(t('crud.deletedName', { name: record.displayName || record.name }));
    await load();
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('crud.deleteFailed'));
  }
}

onMounted(() => {
  void load();
});
</script>

<template>
  <EntityListShell
    :title="t('observability.alerts.title')"
    :lead="t('observability.alerts.lead')"
    :loading="loading"
    :error="errorMessage"
    :columns="columns"
    :data-source="alerts"
    table-test-id="alerts-table"
    show-row-actions
    :total="total"
    :has-next="hasNext"
    :has-prev="hasPrev"
    @refresh="load"
    @next="onNext"
    @prev="onPrev"
    @view="(record) => router.push({ name: 'observability-alert', params: { id: (record as EventSubscription).id } })"
    @delete="(record) => onDelete(record as EventSubscription)"
  >
    <template #actions>
      <Button type="primary" data-testid="create-alert" @click="createOpen = true">
        {{ t('observability.alerts.create') }}
      </Button>
    </template>
    <template #bodyCell="{ column, record }">
      <template v-if="column.key === 'name'">
        <a
          href="#"
          :data-testid="`alert-row-${(record as EventSubscription).id}`"
          @click.prevent="
            router.push({ name: 'observability-alert', params: { id: (record as EventSubscription).id } })
          "
        >
          {{ entityLabel(record as EventSubscription) }}
        </a>
      </template>
      <template v-else-if="column.key === 'enabled'">
        {{ (record as EventSubscription).enabled === false ? t('crud.no') : t('crud.yes') }}
      </template>
      <template v-else-if="column.key === 'destinations'">
        {{
          (record as EventSubscription).destinations
            .map((destination) => destination.type || destination.category)
            .filter(Boolean)
            .join(', ') || '—'
        }}
      </template>
    </template>
  </EntityListShell>
  <FormModal
    :open="createOpen"
    :title="t('observability.alerts.createTitle')"
    :ok-text="t('crud.create')"
    :cancel-text="t('crud.cancel')"
    :confirm-loading="creating"
    @ok="onCreate"
    @cancel="createOpen = false"
  >
    <Form layout="vertical">
      <Form.Item :label="t('crud.name')" :rules="requiredField(t, t('crud.name'))">
        <Input v-model:value="form.name" data-testid="create-alert-name" />
      </Form.Item>
      <Form.Item :label="t('observability.alerts.type')" required>
        <Select v-model:value="form.alertType">
          <Select.Option v-for="type in ALERT_TYPES" :key="type" :value="type">{{ type }}</Select.Option>
        </Select>
      </Form.Item>
      <Form.Item :label="t('observability.alerts.webhookUrl')" required>
        <Input v-model:value="form.webhookUrl" data-testid="create-alert-webhook" />
      </Form.Item>
      <Form.Item :label="t('crud.description')" :extra="t('crud.descriptionHelp')">
        <Input.TextArea v-model:value="form.description" :rows="3" />
      </Form.Item>
      <Form.Item :label="t('crud.displayName')" :extra="t('crud.displayNameHelp')">
        <Input v-model:value="form.displayName" />
      </Form.Item>
    </Form>
  </FormModal>
</template>
