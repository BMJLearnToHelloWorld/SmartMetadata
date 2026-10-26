<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { ConfigProvider } from 'ant-design-vue';
import enUS from 'ant-design-vue/es/locale/en_US';
import zhCN from 'ant-design-vue/es/locale/zh_CN';
import { smAntdTheme } from '@/theme/tokens';

const { locale, t } = useI18n();

const antdLocale = computed(() => (locale.value === 'zh-CN' ? zhCN : enUS));
const formValidateMessages = computed(() => ({
  required: t('crud.fieldRequired', { field: '${label}' }),
}));
</script>

<template>
  <ConfigProvider :theme="smAntdTheme" :locale="antdLocale" :form="{ validateMessages: formValidateMessages }">
    <router-view />
  </ConfigProvider>
</template>
