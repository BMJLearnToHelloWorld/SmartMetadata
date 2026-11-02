<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, onMounted, onUnmounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute, useRouter } from 'vue-router';
import { ConfigProvider, theme } from 'ant-design-vue';
import enUS from 'ant-design-vue/es/locale/en_US';
import zhCN from 'ant-design-vue/es/locale/zh_CN';
import { SESSION_EXPIRED_EVENT } from '@/auth/sessionEvents';
import { useShellPreferencesStore } from '@/stores/shellPreferences';
import { smAntdTheme } from '@/theme/tokens';

const { locale, t } = useI18n();
const router = useRouter();
const route = useRoute();
const shellPreferences = useShellPreferencesStore();

const antdLocale = computed(() => (locale.value === 'zh-CN' ? zhCN : enUS));
const formValidateMessages = computed(() => ({
  required: t('crud.fieldRequired', { field: '${label}' }),
}));

/**
 * Stage 9 dark chain, last link: the Ant algorithm follows the resolved
 * shell preference (CSS variables follow via data-theme, applied by the
 * shell preferences store). The light token object stays the single
 * source; darkAlgorithm only re-derives component colors from it.
 */
const antdTheme = computed(() => ({
  ...smAntdTheme,
  algorithm: shellPreferences.isDark ? theme.darkAlgorithm : theme.defaultAlgorithm,
}));

/**
 * Stage 9 expiry chain, last link: the API client clears the session
 * and dispatches SESSION_EXPIRED_EVENT on 401; the app root redirects
 * to /login carrying the current path, instead of leaving the user on
 * a dead page until the next navigation.
 */
function onSessionExpired(): void {
  if (route.name !== 'login') {
    void router.replace({ name: 'login', query: { redirect: route.fullPath } });
  }
}

onMounted(() => {
  shellPreferences.hydrate();
  window.addEventListener(SESSION_EXPIRED_EVENT, onSessionExpired);
});

onUnmounted(() => {
  window.removeEventListener(SESSION_EXPIRED_EVENT, onSessionExpired);
});
</script>

<template>
  <ConfigProvider :theme="antdTheme" :locale="antdLocale" :form="{ validateMessages: formValidateMessages }">
    <router-view />
  </ConfigProvider>
</template>
