/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { createPinia } from 'pinia';
import { createApp } from 'vue';
import Antd from 'ant-design-vue';
import App from './App.vue';
import { isSsoTestLoginPopup } from './auth/ssoTestLoginPopup';
import { applyDocumentLang, createAppI18n } from './i18n';
import type { SupportedLocale } from './i18n/localePreference';
import { router } from './router';
import { installDocumentTitle } from './router/title';
import { useAuthStore } from './stores/auth';
import 'ant-design-vue/dist/reset.css';
import './styles/fonts.css';
import './styles/theme.css';

// The Test Login popup returns to the configured callback URL, the same one
// a real login lands on. Divert it before anything mounts: running the
// callback bootstrap instead of the app keeps the tested identity's tokens
// out of the admin's real session. A chunk that fails to load closes the
// popup rather than mounting the app into it.
if (isSsoTestLoginPopup()) {
  import('./auth/ssoTestCallback')
    .then((module) => module.runSsoTestCallback())
    .catch(() => globalThis.close());
} else {
  const app = createApp(App);
  const pinia = createPinia();
  const i18n = createAppI18n();
  applyDocumentLang(i18n.global.locale.value as SupportedLocale);
  app.use(pinia);
  app.use(router);
  app.use(i18n);
  app.use(Antd);
  installDocumentTitle(router, i18n);

  useAuthStore().hydrate();

  app.mount('#app');
}
