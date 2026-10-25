<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { Button, Descriptions, Input, Select, Space, message } from 'ant-design-vue';
import { generateBotToken, getBot, revokeBotToken } from '@/api/bots';
import EntityDetailShell from '@/features/crud/EntityDetailShell.vue';
import { entityLabel } from '@/features/crud/paging';
import type { EntityBreadcrumb, EntityDetailTab } from '@/features/crud/types';
import type { AdminBot, JwtTokenExpiry } from '@/types/admin';

const EXPIRY_OPTIONS: JwtTokenExpiry[] = ['OneHour', '1', '7', '30', '60', '90', 'Unlimited'];

const props = defineProps<{ id: string }>();
const { t } = useI18n();
const loading = ref(false);
const errorMessage = ref('');
const bot = ref<AdminBot | null>(null);
const activeTab = ref('overview');
const expiry = ref<JwtTokenExpiry>('7');
const generatedToken = ref('');
const working = ref(false);

const breadcrumbs = computed<EntityBreadcrumb[]>(() => [
  { label: t('admin.bots.title'), to: { name: 'admin-bots' } },
  { label: entityLabel(bot.value) || t('admin.bots.title') },
]);

const tabs = computed<EntityDetailTab[]>(() => [
  { key: 'overview', label: t('crud.overview'), testId: 'bot-tab-overview' },
  { key: 'token', label: t('admin.bots.tokenTab'), testId: 'bot-tab-token' },
]);

async function load(): Promise<void> {
  loading.value = true;
  errorMessage.value = '';
  try {
    bot.value = await getBot(props.id);
  } catch (error) {
    bot.value = null;
    errorMessage.value = error instanceof Error ? error.message : t('crud.loadFailed');
  } finally {
    loading.value = false;
  }
}

async function onGenerate(): Promise<void> {
  const botUserId = bot.value?.botUser?.id;
  if (!botUserId) {
    message.error(t('admin.bots.missingBotUser'));
    return;
  }
  working.value = true;
  try {
    const result = await generateBotToken(botUserId, expiry.value);
    generatedToken.value = result.JWTToken || '';
    if (!generatedToken.value) {
      message.warning(t('admin.bots.generatedMissing'));
    } else {
      message.success(t('admin.bots.generated'));
    }
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('admin.bots.generateFailed'));
  } finally {
    working.value = false;
  }
}

async function onRevoke(): Promise<void> {
  const botUserId = bot.value?.botUser?.id;
  if (!botUserId) {
    message.error(t('admin.bots.missingBotUserRevoke'));
    return;
  }
  working.value = true;
  try {
    await revokeBotToken(botUserId);
    generatedToken.value = '';
    message.success(t('admin.bots.revoked'));
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('admin.bots.revokeFailed'));
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
  <EntityDetailShell
    :title="entityLabel(bot) || t('admin.bots.title')"
    :name="bot?.name"
    :deleted="bot?.deleted"
    :lead="t('admin.bots.detailLead')"
    :loading="loading"
    :error="errorMessage"
    :empty="!bot && !loading && !errorMessage"
    :breadcrumbs="breadcrumbs"
    :tabs="bot ? tabs : []"
    v-model:active-tab="activeTab"
  >
    <template #overview>
      <Descriptions v-if="bot" bordered :column="1" size="small">
        <Descriptions.Item :label="t('crud.name')">{{ bot.name }}</Descriptions.Item>
        <Descriptions.Item :label="t('admin.bots.botUser')">{{ bot.botUser?.name || '—' }}</Descriptions.Item>
        <Descriptions.Item :label="t('admin.bots.botUserId')">{{ bot.botUser?.id || '—' }}</Descriptions.Item>
        <Descriptions.Item :label="t('crud.description')">{{ bot.description || '—' }}</Descriptions.Item>
      </Descriptions>
    </template>
    <template #token>
      <Space wrap>
        <Select v-model:value="expiry" style="width: 160px">
          <Select.Option v-for="option in EXPIRY_OPTIONS" :key="option" :value="option">
            {{ option }}
          </Select.Option>
        </Select>
        <Button type="primary" :loading="working" data-testid="generate-bot-token" @click="onGenerate">
          {{ t('admin.bots.generate') }}
        </Button>
        <Button danger :loading="working" data-testid="revoke-bot-token" @click="onRevoke">
          {{ t('admin.bots.revoke') }}
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
  </EntityDetailShell>
</template>
