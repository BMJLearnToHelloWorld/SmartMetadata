<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, onMounted, onUnmounted, watchEffect } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute, useRouter } from 'vue-router';
import { ConfigProvider, theme } from 'ant-design-vue';
import enUS from 'ant-design-vue/es/locale/en_US';
import zhCN from 'ant-design-vue/es/locale/zh_CN';
import { SESSION_EXPIRED_EVENT } from '@/auth/sessionEvents';
import CsvJobsTray from '@/components/shared/CsvJobsTray.vue';
import LimitBanner from '@/components/shared/LimitBanner.vue';
import SilentErrorBoundary from '@/components/shared/SilentErrorBoundary.vue';
import SmErrorBoundary from '@/components/shared/SmErrorBoundary.vue';
import { useShellConfigStore } from '@/stores/shellConfig';
import { useShellPreferencesStore } from '@/stores/shellPreferences';
import {
  applyCustomThemeCssVars,
  applyCustomThemeToAntdTheme,
  resolveCustomThemeCssVars,
  resolveFaviconHref,
} from '@/theme/customTheme';
import { smAntdTheme } from '@/theme/tokens';

const { locale, t } = useI18n();
const router = useRouter();
const route = useRoute();
const shellPreferences = useShellPreferencesStore();
const shellConfig = useShellConfigStore();

const antdLocale = computed(() => (locale.value === 'zh-CN' ? zhCN : enUS));
const formValidateMessages = computed(() => ({
  required: t('crud.fieldRequired', { field: '${label}' }),
}));

/**
 * Stage 9 dark chain, last link: the Ant algorithm follows the resolved
 * shell preference (CSS variables follow via data-theme, applied by the
 * shell preferences store). The light token object stays the single
 * source; darkAlgorithm only re-derives component colors from it.
 *
 * P-THEME: the custom theme preference overlays the effective custom
 * colors on top (applyCustomThemeToAntdTheme never mutates the base
 * and returns it unchanged when no custom value is effective, so the
 * iSmart defaults stay intact and official brand defaults never enter
 * the chain).
 */
const antdTheme = computed(() =>
  applyCustomThemeToAntdTheme(
    {
      ...smAntdTheme,
      algorithm: shellPreferences.isDark ? theme.darkAlgorithm : theme.defaultAlgorithm,
    },
    shellConfig.uiThemePreference,
  ),
);

/**
 * P-THEME effects: the managed CSS variables follow the preference +
 * dark mode (absent values remove the inline property so the
 * stylesheet defaults apply again), and the favicon follows the custom
 * favicon URL (empty → `data:,`, matching the empty favicon declared
 * in index.html). Both re-run on every slice or dark-mode change, so
 * an Appearance save/reset takes effect immediately without reload.
 */
watchEffect(() => {
  if (typeof document === 'undefined') {
    return;
  }
  applyCustomThemeCssVars(
    document.documentElement,
    resolveCustomThemeCssVars(shellConfig.uiThemePreference, shellPreferences.isDark),
  );
  const href = resolveFaviconHref(
    shellConfig.uiThemePreference?.customLogoConfig.customFaviconUrlPath,
  );
  let link = document.querySelector<HTMLLinkElement>("link[rel='icon']");
  if (!link) {
    link = document.createElement('link');
    link.rel = 'icon';
    document.head.appendChild(link);
  }
  if (link.getAttribute('href') !== href) {
    link.setAttribute('href', href);
  }
});

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
  // Shell startup fetch, mirroring the official AppContainer parallel
  // fetch (version + lineage settings + limit config). A failed limit
  // fetch is fail-open inside the store and must not break startup.
  void shellConfig.loadShellConfig();
  window.addEventListener(SESSION_EXPIRED_EVENT, onSessionExpired);
});

onUnmounted(() => {
  window.removeEventListener(SESSION_EXPIRED_EVENT, onSessionExpired);
});
</script>

<template>
  <ConfigProvider :theme="antdTheme" :locale="antdLocale" :form="{ validateMessages: formValidateMessages }">
    <!-- SYS-7/PEND-1 shared boundary: wraps the whole app inside
         ConfigProvider — LimitBanner, the routed subtree, and
         CsvJobsTray — matching official AppRoot, whose ErrorBoundary
         wraps the entire <App/> subtree (B-14 §5). The local
         SilentErrorBoundary around CsvJobsTray stays inside as the
         first line of defence. -->
    <SmErrorBoundary>
      <!-- Stage D (G-11): the global limit banner, driven by LimitWrapper
           mounts (the home page's hidden data-assets driver). -->
      <LimitBanner />
      <router-view />
      <SilentErrorBoundary>
        <CsvJobsTray />
      </SilentErrorBoundary>
    </SmErrorBoundary>
  </ConfigProvider>
</template>
