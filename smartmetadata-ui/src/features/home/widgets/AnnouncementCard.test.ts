/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may
 * not use this file except in compliance with the License. You may obtain
 * a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { flushPromises, mount } from '@vue/test-utils';
import Antd from 'ant-design-vue';
import { describe, expect, it } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import { createTestI18n } from '@/test/i18n';
import AnnouncementCard from './AnnouncementCard.vue';
import type { Announcement } from '@/types/collaboration';

const NOW = Date.now();

function liveAnnouncement(overrides: Partial<Announcement> = {}): Announcement {
  return {
    id: 'a1',
    name: 'outage',
    displayName: 'Outage notice',
    description: '**Planned** maintenance on [Sunday](https://example.com).',
    type: 'Notice',
    startTime: NOW - 1000,
    endTime: NOW + 100000,
    createdBy: 'admin',
    updatedAt: NOW - 500,
    createdAt: NOW - 900,
    ...overrides,
  };
}

async function mountCard(announcement: Announcement) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/assets/:entityType/:fqn', name: 'asset', component: { template: '<div>asset</div>' } },
    ],
  });
  await router.push('/');
  await router.isReady();
  const wrapper = mount(AnnouncementCard, {
    props: { announcement },
    global: { plugins: [router, Antd, createTestI18n()] },
  });
  return { wrapper, router };
}

describe('AnnouncementCard', () => {
  it('renders the type label, flattened description, author and relative time', async () => {
    const { wrapper } = await mountCard(liveAnnouncement());
    expect(wrapper.get('[data-testid="announcement-type-badge"]').text()).toBe('Notice');
    expect(wrapper.text()).toContain('Planned maintenance on Sunday.');
    expect(wrapper.text()).not.toContain('**');
    expect(wrapper.text()).toContain('A');
    expect(wrapper.find('[data-testid="announcement-dismiss"]').exists()).toBe(true);
  });

  it('links the whole card to the entity when the type has a detail route', async () => {
    const { wrapper, router } = await mountCard(
      liveAnnouncement({ entityLink: '<#E::table::svc.db.schema.orders>' }),
    );
    const link = wrapper.get('.announcement-card__title--link');
    expect(link.text()).toBe('Outage notice');
    await link.trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.name).toBe('asset');
    expect(router.currentRoute.value.params).toMatchObject({
      entityType: 'table',
      fqn: 'svc.db.schema.orders',
    });
  });

  it('renders plain text when the entity has no detail route', async () => {
    const { wrapper } = await mountCard(
      liveAnnouncement({ entityLink: '<#E::domain::finance>' }),
    );
    expect(wrapper.find('.announcement-card__title--link').exists()).toBe(false);
    expect(wrapper.find('.announcement-card__title').text()).toBe('Outage notice');
    expect(wrapper.text()).toContain('finance');
  });

  it('shows a Custom announcement under its own name and colour', async () => {
    const { wrapper } = await mountCard(
      liveAnnouncement({ type: 'Custom', customTypeName: 'Maintenance', color: 'Success' }),
    );
    expect(wrapper.get('[data-testid="announcement-type-badge"]').text()).toBe('Maintenance');
  });

  it('dims an expired card, names its status and hides the dismiss button', async () => {
    const { wrapper } = await mountCard(
      liveAnnouncement({ startTime: NOW - 2000, endTime: NOW - 1000 }),
    );
    expect(wrapper.find('.announcement-card--dimmed').exists()).toBe(true);
    expect(wrapper.get('[data-testid="announcement-status"]').text()).toBe('In-Active');
    expect(wrapper.find('[data-testid="announcement-dismiss"]').exists()).toBe(false);
  });

  it('emits dismiss with the announcement id', async () => {
    const { wrapper } = await mountCard(liveAnnouncement());
    await wrapper.get('[data-testid="announcement-dismiss"]').trigger('click');
    expect(wrapper.emitted('dismiss')?.[0]).toEqual(['a1']);
  });
});
