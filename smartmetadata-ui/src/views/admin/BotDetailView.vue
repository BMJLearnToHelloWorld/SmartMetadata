<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import {
  Alert,
  Button,
  Card,
  Descriptions,
  Input,
  Select,
  Space,
  Spin,
  Typography,
  message,
} from 'ant-design-vue';
import { generateBotToken, getBot, revokeBotToken } from '@/api/bots';
import type { AdminBot, JwtTokenExpiry } from '@/types/admin';

const EXPIRY_OPTIONS: JwtTokenExpiry[] = ['OneHour', '1', '7', '30', '60', '90', 'Unlimited'];

const props = defineProps<{ id: string }>();
const router = useRouter();
const loading = ref(false);
const errorMessage = ref('');
const bot = ref<AdminBot | null>(null);
const expiry = ref<JwtTokenExpiry>('7');
const generatedToken = ref('');
const working = ref(false);

async function load(): Promise<void> {
  loading.value = true;
  errorMessage.value = '';
  try {
    bot.value = await getBot(props.id);
  } catch (error) {
    bot.value = null;
    errorMessage.value = error instanceof Error ? error.message : 'Failed to load bot';
  } finally {
    loading.value = false;
  }
}

async function onGenerate(): Promise<void> {
  const botUserId = bot.value?.botUser?.id;
  if (!botUserId) {
    message.error('This bot has no botUser id; cannot call generateToken');
    return;
  }
  working.value = true;
  try {
    const result = await generateBotToken(botUserId, expiry.value);
    generatedToken.value = result.JWTToken || '';
    if (!generatedToken.value) {
      message.warning('Token generated but the response did not include JWTToken');
    } else {
      message.success('Token generated — copy it now; later GETs may redact it');
    }
  } catch (error) {
    message.error(error instanceof Error ? error.message : 'Generate token failed');
  } finally {
    working.value = false;
  }
}

async function onRevoke(): Promise<void> {
  const botUserId = bot.value?.botUser?.id;
  if (!botUserId) {
    message.error('This bot has no botUser id; cannot call revokeToken');
    return;
  }
  working.value = true;
  try {
    await revokeBotToken(botUserId);
    generatedToken.value = '';
    message.success('Bot token revoked');
  } catch (error) {
    message.error(error instanceof Error ? error.message : 'Revoke token failed');
  } finally {
    working.value = false;
  }
}

onMounted(() => {
  void load();
});

watch(
  () => props.id,
  () => {
    generatedToken.value = '';
    void load();
  },
);
</script>

<template>
  <Card>
    <Button type="link" style="padding-left: 0" @click="router.push({ name: 'admin-bots' })">
      ← Bots
    </Button>
    <Spin :spinning="loading">
      <Alert v-if="errorMessage" type="error" show-icon :message="errorMessage" />
      <template v-if="bot">
        <Typography.Title :level="4">{{ bot.displayName || bot.name }}</Typography.Title>
        <Typography.Paragraph type="secondary">
          GET /api/v1/bots/{id}. Tokens use PUT /api/v1/users/generateToken/{botUserId} and PUT
          /api/v1/users/revokeToken.
        </Typography.Paragraph>
        <Descriptions bordered :column="1">
          <Descriptions.Item label="Name">{{ bot.name }}</Descriptions.Item>
          <Descriptions.Item label="Bot user">{{ bot.botUser?.name || '—' }}</Descriptions.Item>
          <Descriptions.Item label="Bot user id">{{ bot.botUser?.id || '—' }}</Descriptions.Item>
          <Descriptions.Item label="Description">{{ bot.description || '—' }}</Descriptions.Item>
        </Descriptions>
        <Typography.Title :level="5" style="margin-top: 24px">JWT token</Typography.Title>
        <Space wrap>
          <Select v-model:value="expiry" style="width: 160px">
            <Select.Option v-for="option in EXPIRY_OPTIONS" :key="option" :value="option">
              {{ option }}
            </Select.Option>
          </Select>
          <Button type="primary" :loading="working" data-testid="generate-bot-token" @click="onGenerate">
            Generate token
          </Button>
          <Button danger :loading="working" data-testid="revoke-bot-token" @click="onRevoke">
            Revoke token
          </Button>
        </Space>
        <Input.TextArea
          v-if="generatedToken"
          data-testid="generated-bot-token"
          :value="generatedToken"
          :rows="4"
          readonly
          style="margin-top: 12px"
        />
      </template>
    </Spin>
  </Card>
</template>
