/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { mount } from '@vue/test-utils';
import Antd from 'ant-design-vue';
import { describe, expect, it, vi } from 'vitest';
import { findSettingsRegistryItem, type SettingsRegistryItem } from '@/settings/registry';
import { createTestI18n } from '@/test/i18n';
import SettingItemCard from './SettingItemCard.vue';

function registryItem(key: string): SettingsRegistryItem {
  const item = findSettingsRegistryItem(key);
  if (!item) {
    throw new Error(`missing registry item ${key}`);
  }
  return item;
}

function mountCard(item: SettingsRegistryItem, extra: { className?: string } = {}) {
  const onClick = vi.fn();
  const wrapper = mount(SettingItemCard, {
    props: { data: item, onClick, ...(extra.className ? { className: extra.className } : {}) },
    global: { plugins: [Antd, createTestI18n('en-US')] },
  });
  return { wrapper, onClick };
}

describe('SettingItemCard (DESIGN §7)', () => {
  it('renders the registry title and description with the dotted key as test id', () => {
    const { wrapper } = mountCard(registryItem('services.databases'));
    expect(wrapper.find('[data-testid="services.databases"]').exists()).toBe(true);
    expect(wrapper.find('.setting-item-card__title').text()).toBe('Databases');
    expect(wrapper.find('.setting-item-card__description').text()).toBe(
      'Ingest metadata from the most popular database services.',
    );
  });

  it('renders the category title for a category card', () => {
    const { wrapper } = mountCard(registryItem('members'));
    expect(wrapper.find('[data-testid="members"]').exists()).toBe(true);
    expect(wrapper.find('.setting-item-card__title').text()).toBe('Team & User Management');
  });

  it('interpolates the brand name into template titles', () => {
    const { wrapper } = mountCard(registryItem('preferences.om-url-config'));
    expect(wrapper.find('.setting-item-card__title').text()).toBe('iSmart URL');
  });

  it('interpolates the entity into template descriptions', () => {
    const { wrapper } = mountCard(registryItem('customProperties.tables'));
    expect(wrapper.find('.setting-item-card__description').text()).toBe(
      'Define the custom properties for your Tables to serve your organizational needs.',
    );
  });

  it('emits the dotted key when the whole card is clicked', async () => {
    const { wrapper, onClick } = mountCard(registryItem('services.databases'));
    await wrapper.find('[data-testid="services.databases"]').trigger('click');
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(onClick).toHaveBeenCalledWith('services.databases');
  });

  it('renders the Beta badge only for the Data Asset Rules card', () => {
    const beta = mountCard(registryItem('preferences.dataAssetRules'));
    expect(beta.wrapper.find('.setting-item-card__beta').exists()).toBe(true);
    expect(beta.wrapper.find('.setting-item-card__beta').text()).toBe('Beta');
    const plain = mountCard(registryItem('preferences.learning-resources'));
    expect(plain.wrapper.find('.setting-item-card__beta').exists()).toBe(false);
  });

  it('renders a tinted tile for iconColor items and a plain glyph otherwise', () => {
    const blue = mountCard(registryItem('preferences.appMode'));
    expect(blue.wrapper.find('.setting-item-card__tile--blue').exists()).toBe(true);
    expect(blue.wrapper.find('.setting-item-card__glyph').exists()).toBe(false);
    const green = mountCard(registryItem('customProperties.articles'));
    expect(green.wrapper.find('.setting-item-card__tile--green').exists()).toBe(true);
    const plain = mountCard(registryItem('services.databases'));
    expect(plain.wrapper.find('.setting-item-card__tile').exists()).toBe(false);
    expect(plain.wrapper.find('.setting-item-card__glyph').exists()).toBe(true);
  });

  it('merges the optional extra class name onto the card', () => {
    const { wrapper } = mountCard(registryItem('services'), { className: 'global-setting-card' });
    expect(wrapper.find('[data-testid="services"]').classes()).toContain('global-setting-card');
    expect(wrapper.find('[data-testid="services"]').classes()).toContain('setting-item-card');
  });

  it('carries the two-line ellipsis class on the description', () => {
    const { wrapper } = mountCard(registryItem('services.databases'));
    expect(wrapper.find('.setting-item-card__description').exists()).toBe(true);
  });

  it('renders the missing-icon marker instead of guessing an icon', () => {
    const item: SettingsRegistryItem = {
      ...registryItem('services.databases'),
      iconKey: 'no-such-icon-key',
    };
    const { wrapper } = mountCard(item);
    expect(wrapper.find('[data-testid="sm-icon-missing"]').exists()).toBe(true);
  });
});
