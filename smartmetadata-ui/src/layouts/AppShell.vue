<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { Layout, Menu, Input, Button, Space, Typography, message } from 'ant-design-vue';
import { useAuthStore } from '@/stores/auth';

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();

const selectedKeys = computed(() => (route.name === 'asset' ? ['search'] : [String(route.name ?? 'search')]));

function onSearch(value: string): void {
  void router.push({ name: 'search', query: value.trim() ? { q: value.trim() } : {} });
}

async function onLogout(): Promise<void> {
  try {
    await auth.logout();
  } catch (error) {
    message.warning(error instanceof Error ? error.message : 'Server logout failed; local session cleared');
    auth.forgetLocalSession();
  }
  await router.push({ name: 'login' });
}
</script>

<template>
  <Layout class="shell">
    <Layout.Sider breakpoint="lg" collapsed-width="0" theme="dark" class="shell__sider">
      <div class="shell__brand">SmartMetadata</div>
      <Menu theme="dark" mode="inline" :selected-keys="selectedKeys" @click="({ key }) => router.push({ name: String(key) })">
        <Menu.Item key="search">Search</Menu.Item>
      </Menu>
    </Layout.Sider>
    <Layout>
      <Layout.Header class="shell__header">
        <Input.Search
          class="shell__search"
          placeholder="Search data assets"
          allow-clear
          :default-value="typeof route.query.q === 'string' ? route.query.q : ''"
          @search="onSearch"
        />
        <Space>
          <Typography.Text class="shell__user">{{ auth.displayName }}</Typography.Text>
          <Button data-testid="logout-button" @click="onLogout">Log out</Button>
        </Space>
      </Layout.Header>
      <Layout.Content class="shell__content">
        <router-view />
      </Layout.Content>
    </Layout>
  </Layout>
</template>

<style scoped>
.shell {
  min-height: 100%;
}
.shell__sider {
  min-height: 100vh;
}
.shell__brand {
  color: #fff;
  font-weight: 650;
  letter-spacing: 0.01em;
  padding: 20px 20px 12px;
}
.shell__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  background: #fff;
  padding-inline: 24px;
  border-bottom: 1px solid #e5e7eb;
}
.shell__search {
  max-width: 480px;
  flex: 1;
}
.shell__user {
  color: #334155;
}
.shell__content {
  margin: 24px;
}
</style>
