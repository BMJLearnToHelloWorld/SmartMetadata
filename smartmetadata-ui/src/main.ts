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
import { router } from './router';
import { useAuthStore } from './stores/auth';
import 'ant-design-vue/dist/reset.css';

const app = createApp(App);
const pinia = createPinia();
app.use(pinia);
app.use(router);
app.use(Antd);

useAuthStore().hydrate();

app.mount('#app');
