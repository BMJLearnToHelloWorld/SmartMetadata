<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { ConfigProvider, theme } from 'ant-design-vue';

const themeConfig = {
  algorithm: theme.defaultAlgorithm,
  token: {
    colorPrimary: '#1d4ed8',
    colorInfo: '#1d4ed8',
    borderRadius: 6,
    fontFamily:
      'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif',
  },
};
</script>

<template>
  <ConfigProvider :theme="themeConfig">
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
}
</style>
