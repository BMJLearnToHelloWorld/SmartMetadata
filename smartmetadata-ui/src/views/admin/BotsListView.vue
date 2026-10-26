<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { Button, Form, Input, Modal, message } from 'ant-design-vue';
import { createBotWithUser, listBots } from '@/api/bots';
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
import type { AdminBot } from '@/types/admin';

const { t } = useI18n();
const router = useRouter();
const loading = ref(false);
const errorMessage = ref('');
const bots = ref<AdminBot[]>([]);
const total = ref<number | undefined>();
const pageAfter = ref<string | undefined>();
const cursor = ref<CursorPager>(createCursorPager());
const createOpen = ref(false);
const creating = ref(false);
const form = reactive({
  name: '',
  botUser: '',
  botUserEmail: '',
  displayName: '',
  description: '',
});

const columns = computed<EntityListColumn[]>(() => [
  { title: t('crud.name'), dataIndex: 'name', key: 'name' },
  { title: t('admin.bots.botUser'), key: 'botUser' },
  { title: t('crud.description'), dataIndex: 'description', key: 'description', ellipsis: true },
]);

const hasNext = computed(() => canGoNext(pageAfter.value));
const hasPrev = computed(() => canGoPrev(cursor.value));

async function load(): Promise<void> {
  loading.value = true;
  errorMessage.value = '';
  try {
    const page = await listBots(DEFAULT_PAGE_SIZE, cursor.value.after);
    bots.value = page.data;
    total.value = page.total;
    pageAfter.value = page.after;
  } catch (error) {
    bots.value = [];
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
  const botUser = form.botUser.trim() || form.name.trim();
  creating.value = true;
  try {
    const created = await createBotWithUser({
      name: form.name.trim(),
      botUser,
      botUserEmail: form.botUserEmail.trim(),
      displayName: form.displayName.trim() || undefined,
      description: form.description.trim() || undefined,
    });
    createOpen.value = false;
    message.success(t('admin.bots.created', { name: created.name }));
    await load();
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('crud.createFailed'));
  } finally {
    creating.value = false;
  }
}

onMounted(() => {
  void load();
});
</script>

<template>
  <EntityListShell
    :title="t('admin.bots.title')"
    :lead="t('admin.bots.lead')"
    :loading="loading"
    :error="errorMessage"
    :columns="columns"
    :data-source="bots"
    table-test-id="admin-bots-table"
    show-row-actions
    :total="total"
    :has-next="hasNext"
    :has-prev="hasPrev"
    @refresh="load"
    @next="onNext"
    @prev="onPrev"
    @view="(record) => router.push({ name: 'admin-bot', params: { id: (record as AdminBot).id } })"
  >
    <template #actions>
      <Button type="primary" data-testid="create-bot" @click="createOpen = true">
        {{ t('admin.bots.create') }}
      </Button>
    </template>
    <template #bodyCell="{ column, record }">
      <template v-if="column.key === 'name'">
        <a
          href="#"
          :data-testid="`bot-row-${(record as AdminBot).id}`"
          @click.prevent="router.push({ name: 'admin-bot', params: { id: (record as AdminBot).id } })"
        >
          {{ entityLabel(record as AdminBot) }}
        </a>
      </template>
      <template v-else-if="column.key === 'botUser'">
        {{ (record as AdminBot).botUser?.name || '—' }}
      </template>
    </template>
  </EntityListShell>
  <Modal
    v-model:open="createOpen"
    :title="t('admin.bots.createTitle')"
    :ok-text="t('crud.create')"
    :cancel-text="t('crud.cancel')"
    :confirm-loading="creating"
    @ok="onCreate"
  >
    <Form layout="vertical">
      <Form.Item :label="t('admin.bots.botName')" :rules="requiredField(t, t('admin.bots.botName'))">
        <Input v-model:value="form.name" data-testid="create-bot-name" />
      </Form.Item>
      <Form.Item :label="t('admin.bots.botUserName')" :extra="t('admin.bots.botUserNameExtra')">
        <Input v-model:value="form.botUser" />
      </Form.Item>
      <Form.Item :label="t('admin.bots.botUserEmail')" :rules="requiredField(t, t('admin.bots.botUserEmail'))">
        <Input v-model:value="form.botUserEmail" data-testid="create-bot-email" />
      </Form.Item>
      <Form.Item :label="t('crud.displayName')" :extra="t('crud.displayNameHelp')">
        <Input v-model:value="form.displayName" />
      </Form.Item>
      <Form.Item :label="t('crud.description')" :extra="t('crud.descriptionHelp')">
        <Input.TextArea v-model:value="form.description" :rows="2" />
      </Form.Item>
    </Form>
  </Modal>
</template>
