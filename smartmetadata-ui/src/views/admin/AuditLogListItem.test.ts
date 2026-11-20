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
import { createPinia, setActivePinia } from 'pinia';
import { defineComponent, h } from 'vue';
import { describe, expect, it } from 'vitest';
import { createMemoryHistory, createRouter, RouterLink } from 'vue-router';
import SmProfilePicture from '@/components/shared/SmProfilePicture.vue';
import { createTestI18n } from '@/test/i18n';
import type { AuditLogEntry } from '@/api/auditLogs';
import AuditLogListItem from './AuditLogListItem.vue';

const MarkdownStub = defineComponent({
  props: { markdown: { type: String, default: '' } },
  setup(props) {
    return () => h('span', { 'data-testid': 'markdown-stub' }, props.markdown);
  },
});

async function mountItem(log: AuditLogEntry) {
  const pinia = createPinia();
  setActivePinia(pinia);
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      {
        path: '/admin/settings/audit-logs',
        name: 'admin-settings-audit-logs',
        component: { template: '<div>audit</div>' },
      },
      { path: '/admin/users/:fqn', name: 'admin-user', component: { template: '<div>user</div>' } },
      { path: '/admin/teams/:id', name: 'admin-team', component: { template: '<div>team</div>' } },
      { path: '/admin/roles/:fqn', name: 'admin-role', component: { template: '<div>role</div>' } },
      {
        path: '/assets/:entityType/:fqn',
        name: 'asset',
        component: { template: '<div>asset</div>' },
      },
    ],
  });
  await router.push('/admin/settings/audit-logs');
  await router.isReady();
  const wrapper = mount(AuditLogListItem, {
    props: { log },
    global: {
      plugins: [pinia, router, Antd, createTestI18n()],
      stubs: { SmMarkdown: MarkdownStub },
    },
  });
  return wrapper;
}

describe('AuditLogListItem', () => {
  it('renders the header, impersonation segment and meta line', async () => {
    const wrapper = await mountItem({
      id: 1,
      userName: 'alice',
      impersonatedBy: 'bob',
      eventType: 'entityCreated',
      eventTs: Date.now() - 60000,
      entityType: 'table',
      entityFQN: 'svc.db.tbl',
      summary: 'Created',
    });
    expect(wrapper.find('[data-testid="audit-log-list-item"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="item-avatar"]').exists()).toBe(true);
    const header = wrapper.find('[data-testid="item-header"]');
    expect(header.find('[data-testid="event-type"]').text()).toBe('Entity Created');
    expect(header.find('[data-testid="impersonated-by"]').text()).toBe(
      'Impersonated By:',
    );
    const links = header.findAllComponents(RouterLink);
    expect(links[0]!.props('to')).toEqual({ name: 'admin-user', params: { fqn: 'alice' } });
    expect(links[0]!.text()).toBe('alice');
    expect(links[1]!.props('to')).toEqual({ name: 'admin-user', params: { fqn: 'bob' } });
    const meta = wrapper.find('[data-testid="item-meta"]');
    expect(meta.find('[data-testid="entity-type-badge"]').text()).toBe('Table');
    expect(meta.find('[data-testid="timestamp"]').text()).not.toBe('');
    expect(meta.text()).toContain('|');
  });

  it('renders the system user as plain text without a link', async () => {
    const wrapper = await mountItem({
      id: 2,
      eventType: 'entityUpdated',
      summary: 'Updated by the system',
    });
    const header = wrapper.find('[data-testid="item-header"]');
    expect(header.findAllComponents(RouterLink)).toHaveLength(0);
    expect(header.text()).toContain('System');
  });

  it('short-circuits on the summary even when a change description exists', async () => {
    const wrapper = await mountItem({
      id: 3,
      userName: 'alice',
      eventType: 'entityUpdated',
      summary: 'Summary wins',
      changeEvent: {
        changeDescription: { fieldsAdded: [{ name: 'tags', newValue: 'x' }] },
      },
    });
    const content = wrapper.find('[data-testid="description-content"]');
    expect(content.text()).toBe('Summary wins');
    expect(content.text()).not.toContain('Added');
  });

  it('renders change details with labels, values, arrows and separators', async () => {
    const wrapper = await mountItem({
      id: 4,
      userName: 'alice',
      eventType: 'entityUpdated',
      entityType: 'table',
      changeEvent: {
        changeDescription: {
          fieldsAdded: [{ name: 'tags', newValue: [{ tagFQN: 'PII.Sensitive', name: 'Sensitive' }] }],
          fieldsUpdated: [
            { name: 'description', oldValue: 'old text', newValue: 'new text' },
            { name: 'owner', newValue: { name: 'bob', fullyQualifiedName: 'bob' } },
          ],
          fieldsDeleted: [{ name: 'displayName', oldValue: 'Old Name' }],
        },
      },
    });
    const content = wrapper.find('[data-testid="description-content"]');
    const text = content.text();
    expect(text).toContain('Added');
    expect(text).toContain('Tags');
    expect(text).toContain('Sensitive');
    expect(text).toContain('Updated');
    expect(text).toContain('Description');
    expect(text).toContain('→');
    expect(text).toContain('Removed');
    expect(text).toContain('Display Name');
    expect(text).toContain('Old Name');
    const markdowns = wrapper.findAll('[data-testid="markdown-stub"]');
    expect(markdowns.map((node) => node.text())).toEqual(['old text', 'new text']);
    // One div per node, with `; ` after every non-last node.
    expect(content.findAll('.audit-log-list-item__separator')).toHaveLength(3);
    // The owner-only update carries no arrow.
    expect(text.match(/→/g)).toHaveLength(1);
  });

  it('links team values and renders avatars for user fields', async () => {
    const wrapper = await mountItem({
      id: 5,
      userName: 'alice',
      eventType: 'entityUpdated',
      changeEvent: {
        changeDescription: {
          fieldsAdded: [
            { name: 'teams', newValue: [{ fullyQualifiedName: 'Eng', name: 'Eng' }] },
            { name: 'owner', newValue: { fullyQualifiedName: 'bob', name: 'bob' } },
          ],
        },
      },
    });
    const content = wrapper.find('[data-testid="description-content"]');
    const links = content.findAllComponents(RouterLink);
    // DOMWrapper.findAllComponents is typed `any`, so the callback param
    // carries the structural shape it consumes (props lookup only).
    expect(
      links.map((link: { props: (selector: string) => unknown }) =>
        link.props('to'),
      ),
    ).toEqual([
      { name: 'admin-team', params: { id: 'Eng' } },
      { name: 'admin-user', params: { fqn: 'bob' } },
    ]);
    const avatars = wrapper.findAllComponents(SmProfilePicture);
    expect(avatars.some((avatar) => avatar.props('size') === 'xxs')).toBe(true);
    expect(avatars.some((avatar) => avatar.props('size') === 'sm')).toBe(true);
  });

  it('falls back to the event type plus the typed entity link', async () => {
    const wrapper = await mountItem({
      id: 6,
      userName: 'alice',
      eventType: 'entityDeleted',
      entityType: 'table',
      entityFQN: 'svc.db.tbl',
    });
    const content = wrapper.find('[data-testid="description-content"]');
    expect(content.text()).toContain('Entity Deleted');
    const links = content.findAllComponents(RouterLink);
    expect(links).toHaveLength(1);
    expect(links[0]!.props('to')).toEqual({
      name: 'asset',
      params: { entityType: 'table', fqn: 'svc.db.tbl' },
    });
    expect(links[0]!.text()).toBe('tbl');
  });

  it('falls back to plain text when the entity type has no route', async () => {
    const wrapper = await mountItem({
      id: 7,
      userName: 'alice',
      eventType: 'entityCreated',
      entityType: 'databaseService',
      entityFQN: 'myservice',
    });
    const content = wrapper.find('[data-testid="description-content"]');
    expect(content.findAllComponents(RouterLink)).toHaveLength(0);
    expect(content.text()).toContain('myservice');
  });

  it('omits the meta separator when either side is missing', async () => {
    const typeOnly = await mountItem({
      id: 8,
      userName: 'alice',
      eventType: 'entityCreated',
      entityType: 'table',
      summary: 'x',
    });
    expect(typeOnly.find('[data-testid="item-meta"]').text()).not.toContain('|');
    const timeOnly = await mountItem({
      id: 9,
      userName: 'alice',
      eventType: 'entityCreated',
      eventTs: Date.now(),
      summary: 'x',
    });
    expect(timeOnly.find('[data-testid="item-meta"]').text()).not.toContain('|');
    expect(timeOnly.find('[data-testid="entity-type-badge"]').exists()).toBe(false);
  });
});
