<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { Button, Input, Layout, Menu, Space, Typography, message } from 'ant-design-vue';
import { useAuthStore } from '@/stores/auth';

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();

const selectedKeys = computed(() => {
  const name = String(route.name ?? 'search');
  if (name === 'asset') {
    return ['search'];
  }
  if (name === 'lineage') {
    return ['lineage-home'];
  }
  if (name === 'admin-user') {
    return ['admin-users'];
  }
  if (name === 'admin-team') {
    return ['admin-teams'];
  }
  if (name === 'admin-role') {
    return ['admin-roles'];
  }
  if (name === 'admin-bot') {
    return ['admin-bots'];
  }
  if (name === 'governance-glossary' || name === 'governance-term') {
    return ['governance-glossaries'];
  }
  if (name === 'governance-classification' || name === 'governance-tag') {
    return ['governance-classifications'];
  }
  if (name === 'governance-domain') {
    return ['governance-domains'];
  }
  if (name === 'governance-data-product') {
    return ['governance-data-products'];
  }
  if (name === 'quality-test-definition') {
    return ['quality-test-definitions'];
  }
  if (name === 'quality-test-case') {
    return ['quality-test-cases'];
  }
  if (name === 'quality-test-suite') {
    return ['quality-test-suites'];
  }
  if (name === 'observability-incident') {
    return ['observability-incidents'];
  }
  if (name === 'observability-alert') {
    return ['observability-alerts'];
  }
  if (name === 'ingestion-service') {
    return ['ingestion-services'];
  }
  if (name === 'ingestion-pipeline') {
    return ['ingestion-pipelines'];
  }
  return [name];
});

const openKeys = ref<string[]>([]);

watch(
  () => route.name,
  (name) => {
    const routeName = String(name ?? '');
    if (routeName.startsWith('admin-') && !openKeys.value.includes('admin')) {
      openKeys.value = [...openKeys.value, 'admin'];
    }
    if (routeName.startsWith('governance-') && !openKeys.value.includes('governance')) {
      openKeys.value = [...openKeys.value, 'governance'];
    }
    if (routeName.startsWith('quality-') && !openKeys.value.includes('quality')) {
      openKeys.value = [...openKeys.value, 'quality'];
    }
    if (routeName.startsWith('observability-') && !openKeys.value.includes('observability')) {
      openKeys.value = [...openKeys.value, 'observability'];
    }
    if (routeName.startsWith('ingestion-') && !openKeys.value.includes('ingestion')) {
      openKeys.value = [...openKeys.value, 'ingestion'];
    }
  },
  { immediate: true },
);

function onMenuClick({ key }: { key: string | number }): void {
  const name = String(key);
  if (
    name === 'admin' ||
    name === 'governance' ||
    name === 'quality' ||
    name === 'observability' ||
    name === 'ingestion'
  ) {
    return;
  }
  void router.push({ name });
}

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
      <Menu
        theme="dark"
        mode="inline"
        :selected-keys="selectedKeys"
        v-model:openKeys="openKeys"
        @click="onMenuClick"
      >
        <Menu.Item key="search">Search</Menu.Item>
        <Menu.Item key="lineage-home">Lineage</Menu.Item>
        <Menu.SubMenu key="governance" title="Governance" data-testid="governance-nav">
          <Menu.Item key="governance-glossaries">Glossaries</Menu.Item>
          <Menu.Item key="governance-classifications">Classifications</Menu.Item>
          <Menu.Item key="governance-domains">Domains</Menu.Item>
          <Menu.Item key="governance-data-products">Data products</Menu.Item>
        </Menu.SubMenu>
        <Menu.SubMenu key="quality" title="Quality" data-testid="quality-nav">
          <Menu.Item key="quality-test-definitions">Test definitions</Menu.Item>
          <Menu.Item key="quality-test-cases">Test cases</Menu.Item>
          <Menu.Item key="quality-test-suites">Test suites</Menu.Item>
        </Menu.SubMenu>
        <Menu.SubMenu key="observability" title="Observability" data-testid="observability-nav">
          <Menu.Item key="observability-incidents">Incidents</Menu.Item>
          <Menu.Item key="observability-alerts">Alerts</Menu.Item>
        </Menu.SubMenu>
        <Menu.SubMenu key="ingestion" title="Ingestion" data-testid="ingestion-nav">
          <Menu.Item key="ingestion-services">Services</Menu.Item>
          <Menu.Item key="ingestion-pipelines">Pipelines</Menu.Item>
        </Menu.SubMenu>
        <Menu.SubMenu key="admin" title="Admin" data-testid="admin-nav">
          <Menu.Item key="admin-users">Users</Menu.Item>
          <Menu.Item key="admin-teams">Teams</Menu.Item>
          <Menu.Item key="admin-roles">Roles</Menu.Item>
          <Menu.Item key="admin-bots">Bots</Menu.Item>
          <Menu.Item key="admin-settings">Settings</Menu.Item>
        </Menu.SubMenu>
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
