/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import Antd from 'ant-design-vue';
import { createPinia, setActivePinia } from 'pinia';
import { createMemoryHistory, createRouter } from 'vue-router';
import type { Component } from 'vue';
import { createTestI18n } from '@/test/i18n';
import AppModeConfigView from './AppModeConfigView.vue';
import DataQualityDimensionsView from './DataQualityDimensionsView.vue';
import EmailConfigurationView from './EmailConfigurationView.vue';
import EntityRulesSettingsView from './EntityRulesSettingsView.vue';
import GlossarySettingsView from './GlossarySettingsView.vue';
import LearningResourcesView from './LearningResourcesView.vue';
import LoginConfigurationView from './LoginConfigurationView.vue';
import OmHealthView from './OmHealthView.vue';
import OmUrlConfigView from './OmUrlConfigView.vue';
import TimeFormatSettingsView from './TimeFormatSettingsView.vue';

/**
 * Preference-page headers render the settings-registry title and
 * description (DESIGN §12.3), with the two §9.5 exceptions: the
 * Learning page header is the singular pin label and the OM URL
 * header is the pin entity-configuration template over the registry
 * card title. The views' loads fail closed against the stubbed
 * fetch; the headers render regardless of load state.
 */
const CASES: Array<{
  name: string;
  component: Component;
  title: string;
  descriptionPart: string;
}> = [
  {
    name: 'Email',
    component: EmailConfigurationView,
    title: 'Email',
    descriptionPart: 'Configure the SMTP Settings for sending Emails.',
  },
  {
    name: 'Login Configuration',
    component: LoginConfigurationView,
    title: 'Login Configuration',
    descriptionPart: 'Define the handling of failed login attempts and JWT token expiry.',
  },
  {
    name: 'Health Check',
    component: OmHealthView,
    title: 'Health Check',
    descriptionPart: 'Check database access, ES health, Pipeline Service Client',
  },
  {
    name: 'Data Quality',
    component: DataQualityDimensionsView,
    title: 'Data Quality',
    descriptionPart: 'Configure how data quality is organised across your workspace.',
  },
  {
    name: 'OM URL Configuration',
    component: OmUrlConfigView,
    title: 'iSmart URL Configuration',
    descriptionPart: 'Configure the iSmart URL Settings.',
  },
  {
    name: 'Data Asset Rules',
    component: EntityRulesSettingsView,
    title: 'Data Asset Rules',
    descriptionPart: 'Data Asset Rules help you manage metadata validations at the platform level.',
  },
  {
    name: 'Learning Resource',
    component: LearningResourcesView,
    title: 'Learning Resource',
    descriptionPart: 'Explore product features and learn how they work through our resources',
  },
  {
    name: 'Default App Mode',
    component: AppModeConfigView,
    title: 'Default App Mode',
    descriptionPart: 'first impression',
  },
  {
    name: 'Glossary',
    component: GlossarySettingsView,
    title: 'Glossary',
    descriptionPart: 'Apply classification tags from glossary terms to associated assets',
  },
  {
    name: 'Default Time Format',
    component: TimeFormatSettingsView,
    title: 'Default Time Format',
    descriptionPart: 'Configure the default time format (12-hour or 24-hour)',
  },
];

describe('preference page headers (§12.3)', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{}', { status: 500 })),
    );
  });

  it.each(CASES)('$name renders the registry header and description', async ({ component, title, descriptionPart }) => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/', component: { template: '<div />' } },
        // Breadcrumb links resolve these names; the stubs never render.
        { path: '/settings', name: 'admin-settings', component: { template: '<div />' } },
        { path: '/settings/:category', name: 'settings-category', component: { template: '<div />' } },
        { path: '/settings/preferences/entity-rules', name: 'settings-preferences-entity-rules', component: { template: '<div />' } },
      ],
    });
    await router.push('/');
    await router.isReady();
    const wrapper = mount(component, {
      global: { plugins: [pinia, router, Antd, createTestI18n()] },
    });
    // The views load on mount; settle the stubbed fetch first so the
    // error Alert (if any) has rendered before asserting headers.
    await flushPromises();
    await wrapper.vm.$nextTick();
    const text = wrapper.text();
    expect(text).toContain(title);
    expect(text).toContain(descriptionPart);
    wrapper.unmount();
  });
});
