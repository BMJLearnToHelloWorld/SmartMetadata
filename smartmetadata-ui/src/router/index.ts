/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { loadSession } from '@/auth/token';
import AppShell from '@/layouts/AppShell.vue';
import AssetDetailView from '@/views/AssetDetailView.vue';
import LoginView from '@/views/LoginView.vue';
import SearchView from '@/views/SearchView.vue';
import { createRouter, createWebHistory } from 'vue-router';

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/login',
      name: 'login',
      component: LoginView,
      meta: { public: true },
    },
    {
      path: '/',
      component: AppShell,
      children: [
        { path: '', redirect: { name: 'search' } },
        { path: 'search', name: 'search', component: SearchView },
        {
          path: 'assets/:entityType/:fqn',
          name: 'asset',
          component: AssetDetailView,
          props: true,
        },
      ],
    },
  ],
});

router.beforeEach((to) => {
  if (to.meta.public) {
    return true;
  }
  if (!loadSession(window.localStorage)) {
    return { name: 'login', query: { redirect: to.fullPath } };
  }
  return true;
});
