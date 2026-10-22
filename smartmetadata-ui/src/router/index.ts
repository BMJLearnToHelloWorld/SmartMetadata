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
import LineageHomeView from '@/views/LineageHomeView.vue';
import LineageView from '@/views/LineageView.vue';
import BotDetailView from '@/views/admin/BotDetailView.vue';
import BotsListView from '@/views/admin/BotsListView.vue';
import LoginView from '@/views/LoginView.vue';
import RoleDetailView from '@/views/admin/RoleDetailView.vue';
import RolesListView from '@/views/admin/RolesListView.vue';
import SearchView from '@/views/SearchView.vue';
import SettingsView from '@/views/admin/SettingsView.vue';
import TeamDetailView from '@/views/admin/TeamDetailView.vue';
import TeamsListView from '@/views/admin/TeamsListView.vue';
import UserDetailView from '@/views/admin/UserDetailView.vue';
import UsersListView from '@/views/admin/UsersListView.vue';
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
        { path: 'lineage', name: 'lineage-home', component: LineageHomeView },
        {
          path: 'lineage/:entityType/:fqn',
          name: 'lineage',
          component: LineageView,
          props: true,
        },
        { path: 'admin/users', name: 'admin-users', component: UsersListView },
        { path: 'admin/users/:id', name: 'admin-user', component: UserDetailView, props: true },
        { path: 'admin/teams', name: 'admin-teams', component: TeamsListView },
        { path: 'admin/teams/:id', name: 'admin-team', component: TeamDetailView, props: true },
        { path: 'admin/roles', name: 'admin-roles', component: RolesListView },
        { path: 'admin/roles/:id', name: 'admin-role', component: RoleDetailView, props: true },
        { path: 'admin/bots', name: 'admin-bots', component: BotsListView },
        { path: 'admin/bots/:id', name: 'admin-bot', component: BotDetailView, props: true },
        { path: 'admin/settings', name: 'admin-settings', component: SettingsView },
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
