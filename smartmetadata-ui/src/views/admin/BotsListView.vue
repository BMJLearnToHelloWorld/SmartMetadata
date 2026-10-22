<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { Alert, Button, Card, Form, Input, Modal, Space, Table, Typography, message } from 'ant-design-vue';
import { createBotWithUser, listBots } from '@/api/bots';
import type { AdminBot } from '@/types/admin';

const router = useRouter();
const loading = ref(false);
const errorMessage = ref('');
const bots = ref<AdminBot[]>([]);
const total = ref<number | undefined>();
const createOpen = ref(false);
const creating = ref(false);
const form = reactive({
  name: '',
  botUser: '',
  botUserEmail: '',
  displayName: '',
  description: '',
});

const columns = [
  { title: 'Name', dataIndex: 'name', key: 'name' },
  { title: 'Bot user', key: 'botUser' },
  { title: 'Description', dataIndex: 'description', key: 'description', ellipsis: true },
];

async function load(): Promise<void> {
  loading.value = true;
  errorMessage.value = '';
  try {
    const page = await listBots(50);
    bots.value = page.data;
    total.value = page.total;
  } catch (error) {
    bots.value = [];
    errorMessage.value = error instanceof Error ? error.message : 'Failed to load bots';
  } finally {
    loading.value = false;
  }
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
    message.success(`Created bot ${created.name}`);
    await load();
  } catch (error) {
    message.error(error instanceof Error ? error.message : 'Create bot failed');
  } finally {
    creating.value = false;
  }
}

onMounted(() => {
  void load();
});
</script>

<template>
  <Card>
    <Space direction="vertical" size="middle" style="width: 100%">
      <div class="admin-head">
        <div>
          <Typography.Title :level="4">Bots</Typography.Title>
          <Typography.Paragraph type="secondary">
            GET /api/v1/bots. Create POSTs a bot user (<code>isBot: true</code>) then POST /api/v1/bots.
          </Typography.Paragraph>
        </div>
        <Button type="primary" data-testid="create-bot" @click="createOpen = true">Create bot</Button>
      </div>
      <Alert v-if="errorMessage" type="error" show-icon :message="errorMessage" />
      <Table
        row-key="id"
        data-testid="admin-bots-table"
        :columns="columns"
        :data-source="bots"
        :loading="loading"
        :pagination="false"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'name'">
            <a href="#" @click.prevent="router.push({ name: 'admin-bot', params: { id: (record as AdminBot).id } })">
              {{ (record as AdminBot).displayName || (record as AdminBot).name }}
            </a>
          </template>
          <template v-else-if="column.key === 'botUser'">
            {{ (record as AdminBot).botUser?.name || '—' }}
          </template>
        </template>
      </Table>
      <Typography.Text type="secondary">{{ bots.length }} shown<template v-if="total !== undefined"> of {{ total }}</template></Typography.Text>
    </Space>
    <Modal v-model:open="createOpen" title="Create bot" :confirm-loading="creating" @ok="onCreate">
      <Form layout="vertical">
        <Form.Item label="Bot name" required>
          <Input v-model:value="form.name" data-testid="create-bot-name" />
        </Form.Item>
        <Form.Item label="Bot user name" extra="Defaults to the bot name. CreateBot.botUser is this user name.">
          <Input v-model:value="form.botUser" placeholder="same as bot name" />
        </Form.Item>
        <Form.Item label="Bot user email" required>
          <Input v-model:value="form.botUserEmail" data-testid="create-bot-email" />
        </Form.Item>
        <Form.Item label="Display name">
          <Input v-model:value="form.displayName" />
        </Form.Item>
        <Form.Item label="Description">
          <Input.TextArea v-model:value="form.description" :rows="2" />
        </Form.Item>
      </Form>
    </Modal>
  </Card>
</template>

<style scoped>
.admin-head {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: flex-start;
}
</style>
