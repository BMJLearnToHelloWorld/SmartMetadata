<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { ConfigProvider, theme } from 'ant-design-vue';
import enUS from 'ant-design-vue/es/locale/en_US';
import zhCN from 'ant-design-vue/es/locale/zh_CN';

const { locale } = useI18n();

const themeConfig = {
  algorithm: theme.defaultAlgorithm,
  token: {
    colorPrimary: '#1d4ed8',
    colorInfo: '#1d4ed8',
    borderRadius: 4,
    fontSize: 13,
    fontFamily:
      'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif',
    controlHeight: 32,
  },
};

const antdLocale = computed(() => (locale.value === 'zh-CN' ? zhCN : enUS));
</script>

<template>
  <ConfigProvider :theme="themeConfig" :locale="antdLocale">
    <router-view />
  </ConfigProvider>
</template>

<style>
html,
body,
#app {
  height: 100%;
  margin: 0;
}
body {
  background: #f4f6f8;
  font-size: 13px;
}
</style>
