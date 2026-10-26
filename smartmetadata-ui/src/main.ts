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
import { applyDocumentLang, createAppI18n } from './i18n';
import type { SupportedLocale } from './i18n/localePreference';
import { router } from './router';
import { useAuthStore } from './stores/auth';
import 'ant-design-vue/dist/reset.css';
import './styles/theme.css';

const app = createApp(App);
const pinia = createPinia();
const i18n = createAppI18n();
applyDocumentLang(i18n.global.locale.value as SupportedLocale);
app.use(pinia);
app.use(router);
app.use(i18n);
app.use(Antd);

useAuthStore().hydrate();

app.mount('#app');
