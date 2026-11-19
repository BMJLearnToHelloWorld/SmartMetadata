/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import Antd from 'ant-design-vue';
import { mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import { createI18n } from 'vue-i18n';
import { DatabaseOutlined, PlusOutlined } from '@ant-design/icons-vue';
import CreatePlaceholder from './CreatePlaceholder.vue';
import EmptyPlaceholder from './EmptyPlaceholder.vue';
import FeaturesPlaceholder from './FeaturesPlaceholder.vue';
import NoDataPlaceholder from './NoDataPlaceholder.vue';
import NoFilteredResultsPlaceholder from './NoFilteredResultsPlaceholder.vue';
import NoSearchResultsPlaceholder from './NoSearchResultsPlaceholder.vue';
import PanelEmptyPlaceholder from './PanelEmptyPlaceholder.vue';
import PermissionPlaceholder from './PermissionPlaceholder.vue';
import SomethingWentWrongPlaceholder from './SomethingWentWrongPlaceholder.vue';

// Local messages: the placeholders reference NEW keys the integration
// line has not written yet. Asserting rendered copy pins the exact key
// names. Interpolation uses vue-i18n `{name}` syntax (official i18next
// templates use `{{name}}`; the integration line writes the product
// form). The <0> element tags pass through literally, as the
// splitTransElement contract requires.
function createPlaceholderI18n() {
  return createI18n({
    legacy: false,
    locale: 'en',
    messages: {
      en: {
        message: {
          'no-data-available': 'No data available.',
          'adding-new-entity-is-easy-just-give-it-a-spin':
            'Adding a new {entity} is easy, just give it a spin!',
          'refer-to-our-doc': 'Still need help? Refer to our <0>{doc}</0> for more information.',
          'no-access-placeholder':
            "You don't have necessary permissions. Please check with the admin to get the <0>{entity}</0> permission.",
          'nothing-matches-current-filter':
            'Nothing matches the current filters. Adjust them, or clear all to see everything',
          'check-spelling-or-try-shorter-term': 'Check the spelling, or try a shorter or more general term.',
          'temporary-error-try-reloading':
            "We couldn't load this right now. It's usually temporary — reloading often fixes it.",
          'something-went-wrong': 'Something went wrong',
        },
        label: {
          add: 'Add',
          'clear-filter-plural': 'Clear Filters',
          'no-result-for-these-filter-plural': 'No results for these filters',
          'no-matching-result-plural': 'No matching results',
          'access-denied': 'Access Denied',
          reload: 'Reload',
          entity: 'Entity',
          resource: 'Resource',
          documentation: 'Documentation',
          'doc-plural-lowercase': 'docs',
        },
        settings: {
          shell: {
            accessDenied: 'Access Denied',
          },
        },
      },
    },
  });
}

function mountWithI18n(component: object, options: Record<string, unknown> = {}) {
  return mount(component as never, {
    global: { plugins: [Antd, createPlaceholderI18n()] },
    ...options,
  } as never);
}

describe('EmptyPlaceholder base', () => {
  it('renders the blank layout with icon box, title, and description', () => {
    const wrapper = mountWithI18n(EmptyPlaceholder, {
      props: { icon: DatabaseOutlined, title: 'Heading', description: 'Guidance' },
    });
    expect(wrapper.find('[data-testid="empty-placeholder"]').exists()).toBe(true);
    expect(wrapper.find('.empty-placeholder__icon-box .anticon-database').exists()).toBe(true);
    expect(wrapper.find('.empty-placeholder__title').text()).toBe('Heading');
    expect(wrapper.find('.empty-placeholder__description').text()).toBe('Guidance');
    expect(wrapper.find('.empty-placeholder__inner').attributes('style')).toContain('max-width: 512px');
    wrapper.unmount();
  });

  it('omits the text block when neither title nor description exists', () => {
    const wrapper = mountWithI18n(EmptyPlaceholder, { props: { icon: DatabaseOutlined } });
    expect(wrapper.find('.empty-placeholder__text-block').exists()).toBe(false);
    wrapper.unmount();
  });

  it('lets a caller testId override the default', () => {
    const wrapper = mountWithI18n(EmptyPlaceholder, {
      props: { title: 'T', testId: 'custom-testid' },
    });
    expect(wrapper.find('[data-testid="custom-testid"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="empty-placeholder"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('renders actions as small buttons and calls onPress', async () => {
    const onPress = vi.fn();
    const wrapper = mountWithI18n(EmptyPlaceholder, {
      props: {
        title: 'T',
        actions: [
          { key: 'a', label: 'Do it', color: 'primary', onPress, id: 'do-id', testId: 'do-test' },
          { key: 'b', label: 'Other' },
        ],
      },
    });
    const buttons = wrapper.findAll('.empty-placeholder__actions .ant-btn');
    expect(buttons).toHaveLength(2);
    expect(buttons[0]?.classes()).toContain('ant-btn-primary');
    expect(buttons[0]?.classes()).toContain('ant-btn-sm');
    expect(buttons[0]?.attributes('id')).toBe('do-id');
    expect(buttons[0]?.attributes('data-testid')).toBe('do-test');
    expect(buttons[1]?.classes()).not.toContain('ant-btn-primary');
    await buttons[0]?.trigger('click');
    expect(onPress).toHaveBeenCalledTimes(1);
    wrapper.unmount();
  });

  it('renders no footer when there are no actions and no footer slot', () => {
    const wrapper = mountWithI18n(EmptyPlaceholder, { props: { title: 'T' } });
    expect(wrapper.find('.empty-placeholder__footer').exists()).toBe(false);
    wrapper.unmount();
  });

  it('replaces the actions entirely with the footer slot', async () => {
    const onPress = vi.fn();
    const wrapper = mountWithI18n(EmptyPlaceholder, {
      props: { title: 'T', actions: [{ key: 'a', label: 'Do it', onPress }] },
      slots: { footer: '<div class="custom-footer">Custom footer</div>' },
    });
    expect(wrapper.find('.custom-footer').exists()).toBe(true);
    expect(wrapper.find('.empty-placeholder__actions').exists()).toBe(false);
    wrapper.unmount();
  });

  it('renders the icon slot instead of the icon prop', () => {
    const wrapper = mountWithI18n(EmptyPlaceholder, {
      props: { icon: DatabaseOutlined, title: 'T' },
      slots: { icon: '<span class="slot-icon">X</span>' },
    });
    expect(wrapper.find('.slot-icon').exists()).toBe(true);
    expect(wrapper.find('.anticon-database').exists()).toBe(false);
    wrapper.unmount();
  });

  it('renders the features layout with header, columns, and action titles', async () => {
    const onPress = vi.fn();
    const wrapper = mountWithI18n(EmptyPlaceholder, {
      props: {
        variant: 'features',
        title: 'Get started',
        description: 'Set things up',
        features: [
          { key: 'f1', icon: PlusOutlined, title: 'First', description: 'Do first' },
          { key: 'f2', icon: DatabaseOutlined, title: 'Second', action: { onPress, testId: 'second-btn' } },
        ],
      },
    });
    expect(wrapper.find('.empty-placeholder__features-title').text()).toBe('Get started');
    expect(wrapper.find('.empty-placeholder__features-description').text()).toBe('Set things up');
    const features = wrapper.findAll('.empty-placeholder__feature');
    expect(features).toHaveLength(2);
    expect(features[0]?.find('.empty-placeholder__feature-title').text()).toBe('First');
    expect(features[0]?.find('.empty-placeholder__feature-description').text()).toBe('Do first');
    const actionButton = features[1]?.find('[data-testid="second-btn"]');
    expect(actionButton?.text()).toBe('Second');
    await actionButton?.trigger('click');
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(wrapper.find('.empty-placeholder__features--spaced').exists()).toBe(true);
    wrapper.unmount();
  });
});

describe('NoDataPlaceholder', () => {
  it('shows the default heading when it has no copy of its own', () => {
    const wrapper = mountWithI18n(NoDataPlaceholder);
    expect(wrapper.find('.empty-placeholder__title').text()).toBe('No data available.');
    expect(wrapper.find('.anticon-database').exists()).toBe(true);
    wrapper.unmount();
  });

  it('suppresses the default heading when description or footer is present', () => {
    const withDescription = mountWithI18n(NoDataPlaceholder, { props: { description: 'Guidance' } });
    expect(withDescription.find('.empty-placeholder__title').exists()).toBe(false);
    expect(withDescription.find('.empty-placeholder__description').text()).toBe('Guidance');
    withDescription.unmount();

    const withFooter = mountWithI18n(NoDataPlaceholder, {
      slots: { footer: '<div>Footer</div>' },
    });
    expect(withFooter.find('.empty-placeholder__title').exists()).toBe(false);
    withFooter.unmount();
  });

  it('keeps caller copy in its own slot', () => {
    const wrapper = mountWithI18n(NoDataPlaceholder, { props: { title: 'Nothing yet' } });
    expect(wrapper.find('.empty-placeholder__title').text()).toBe('Nothing yet');
    wrapper.unmount();
  });
});

describe('NoFilteredResultsPlaceholder', () => {
  it('shows defaults and the clear-filters action', async () => {
    const onClearFilters = vi.fn();
    const wrapper = mountWithI18n(NoFilteredResultsPlaceholder, { props: { onClearFilters } });
    expect(wrapper.find('.empty-placeholder__title').text()).toBe('No results for these filters');
    expect(wrapper.find('.empty-placeholder__description').text()).toContain('Nothing matches the current filters');
    const button = wrapper.find('.empty-placeholder__actions .ant-btn');
    expect(button.text()).toBe('Clear Filters');
    expect(button.classes()).toContain('ant-btn-primary');
    await button.trigger('click');
    expect(onClearFilters).toHaveBeenCalledTimes(1);
    wrapper.unmount();
  });

  it('suppresses the default description when a title is given', () => {
    const wrapper = mountWithI18n(NoFilteredResultsPlaceholder, { props: { title: 'Custom title' } });
    expect(wrapper.find('.empty-placeholder__description').exists()).toBe(false);
    wrapper.unmount();
  });

  it('lets caller actions replace the generated action entirely', () => {
    const wrapper = mountWithI18n(NoFilteredResultsPlaceholder, {
      props: { actions: [{ key: 'x', label: 'Custom' }], onClearFilters: () => undefined },
    });
    expect(wrapper.find('.empty-placeholder__actions').text()).toBe('Custom');
    wrapper.unmount();
  });
});

describe('NoSearchResultsPlaceholder', () => {
  it('shows defaults and suppresses the description when titled', () => {
    const wrapper = mountWithI18n(NoSearchResultsPlaceholder);
    expect(wrapper.find('.empty-placeholder__title').text()).toBe('No matching results');
    expect(wrapper.find('.empty-placeholder__description').text()).toContain('Check the spelling');
    wrapper.unmount();

    const titled = mountWithI18n(NoSearchResultsPlaceholder, { props: { title: 'Custom' } });
    expect(titled.find('.empty-placeholder__description').exists()).toBe(false);
    titled.unmount();
  });
});

describe('PermissionPlaceholder', () => {
  it('shows the access-denied title and bolds the entity in the message', () => {
    const wrapper = mountWithI18n(PermissionPlaceholder);
    expect(wrapper.find('.empty-placeholder__title').text()).toBe('Access Denied');
    const description = wrapper.find('.empty-placeholder__description');
    expect(description.text()).toBe(
      "You don't have necessary permissions. Please check with the admin to get the Resource permission."
    );
    expect(description.find('b').exists()).toBe(true);
    expect(description.find('b').text()).toBe('Resource');
    expect(wrapper.find('.anticon-lock').exists()).toBe(true);
    wrapper.unmount();
  });

  it('names the missing permission from permissionValue', () => {
    const wrapper = mountWithI18n(PermissionPlaceholder, { props: { permissionValue: 'Bots' } });
    const description = wrapper.find('.empty-placeholder__description');
    expect(description.text()).toContain(
      'get the Bots permission'
    );
    expect(description.find('b').exists()).toBe(true);
    expect(description.find('b').text()).toBe('Bots');
    wrapper.unmount();
  });

  it('suppresses the message when a title or description is given', () => {
    const titled = mountWithI18n(PermissionPlaceholder, { props: { title: 'Custom' } });
    expect(titled.find('.empty-placeholder__description').exists()).toBe(false);
    titled.unmount();

    const described = mountWithI18n(PermissionPlaceholder, { props: { description: 'Custom copy' } });
    expect(described.find('.empty-placeholder__description').text()).toBe('Custom copy');
    described.unmount();
  });
});

describe('SomethingWentWrongPlaceholder', () => {
  it('shows defaults and the reload action', async () => {
    const onReload = vi.fn();
    const wrapper = mountWithI18n(SomethingWentWrongPlaceholder, { props: { onReload } });
    expect(wrapper.find('.empty-placeholder__title').text()).toBe('Something went wrong');
    expect(wrapper.find('.empty-placeholder__description').text()).toContain("We couldn't load this right now");
    const button = wrapper.find('.empty-placeholder__actions .ant-btn');
    expect(button.text()).toBe('Reload');
    await button.trigger('click');
    expect(onReload).toHaveBeenCalledTimes(1);
    wrapper.unmount();
  });
});

describe('CreatePlaceholder', () => {
  it('renders the add action with the default test id', async () => {
    const onCreate = vi.fn();
    const wrapper = mountWithI18n(CreatePlaceholder, { props: { onCreate } });
    expect(wrapper.find('.empty-placeholder__description').text()).toBe(
      'Adding a new Entity is easy, just give it a spin!'
    );
    const button = wrapper.find('[data-testid="add-placeholder-button"]');
    expect(button.text()).toBe('Add');
    await button.trigger('click');
    expect(onCreate).toHaveBeenCalledTimes(1);
    wrapper.unmount();
  });

  it('uses heading for the entity and buttonId for id and test id', () => {
    const wrapper = mountWithI18n(CreatePlaceholder, {
      props: { onCreate: () => undefined, heading: 'Dashboard', buttonId: 'create-dashboard' },
    });
    expect(wrapper.find('.empty-placeholder__description').text()).toContain('Adding a new Dashboard');
    const button = wrapper.find('[data-testid="create-dashboard"]');
    expect(button.attributes('id')).toBe('create-dashboard');
    wrapper.unmount();
  });

  it('renders the doc link only when doc is passed', () => {
    const withDoc = mountWithI18n(CreatePlaceholder, {
      props: { onCreate: () => undefined, doc: 'https://docs.example.com/x' },
    });
    const description = withDoc.find('.empty-placeholder__description');
    expect(description.text()).toBe(
      'Adding a new Entity is easy, just give it a spin! Still need help? Refer to our docs for more information.'
    );
    const link = description.find('a');
    expect(link.text()).toBe('docs');
    expect(link.attributes('href')).toBe('https://docs.example.com/x');
    expect(link.attributes('target')).toBe('_blank');
    expect(link.attributes('rel')).toBe('noopener noreferrer');
    expect(link.attributes('aria-label')).toBe('Documentation');
    withDoc.unmount();

    const withoutDoc = mountWithI18n(CreatePlaceholder, { props: { onCreate: () => undefined } });
    expect(withoutDoc.find('.empty-placeholder__description a').exists()).toBe(false);
    withoutDoc.unmount();
  });

  it('falls back to the permission state when permission is explicitly false', () => {
    const wrapper = mountWithI18n(CreatePlaceholder, {
      props: {
        permission: false,
        title: 'Create title',
        description: 'Create copy',
        actions: [{ key: 'x', label: 'Create action' }],
        onCreate: () => undefined,
        permissionValue: 'Tables',
      },
    });
    expect(wrapper.find('[data-testid="permission-error-placeholder"]').exists()).toBe(true);
    expect(wrapper.find('.empty-placeholder__title').text()).toBe('Access Denied');
    expect(wrapper.text()).not.toContain('Create title');
    expect(wrapper.text()).not.toContain('Create copy');
    expect(wrapper.text()).not.toContain('Create action');
    expect(wrapper.find('.empty-placeholder__description').text()).toContain(
      'get the Tables permission'
    );
    wrapper.unmount();
  });

  it('keeps the permission test id whatever the caller passed', () => {
    const wrapper = mountWithI18n(CreatePlaceholder, {
      props: { permission: false, testId: 'caller-testid' },
    });
    expect(wrapper.find('[data-testid="permission-error-placeholder"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="caller-testid"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('does not fall back when permission is true or unset', () => {
    const unset = mountWithI18n(CreatePlaceholder, { props: { onCreate: () => undefined } });
    expect(unset.find('[data-testid="add-placeholder-button"]').exists()).toBe(true);
    unset.unmount();
  });
});

describe('FeaturesPlaceholder', () => {
  it('renders feature columns through the features variant', () => {
    const wrapper = mountWithI18n(FeaturesPlaceholder, {
      props: {
        title: 'Welcome',
        features: [{ key: 'f1', icon: PlusOutlined, title: 'Start', description: 'Begin here' }],
      },
    });
    expect(wrapper.find('.empty-placeholder__features-title').text()).toBe('Welcome');
    expect(wrapper.find('.empty-placeholder__feature-title').text()).toBe('Start');
    wrapper.unmount();
  });
});

describe('PanelEmptyPlaceholder', () => {
  it('renders the positioned host with the no-data state by default', () => {
    const wrapper = mountWithI18n(PanelEmptyPlaceholder, {
      props: { title: 'No test cases', description: 'Add one to begin' },
    });
    const host = wrapper.find('.panel-empty-placeholder');
    expect(host.exists()).toBe(true);
    expect(wrapper.find('[data-testid="no-data-placeholder"]').exists()).toBe(true);
    expect(wrapper.find('.empty-placeholder__title').text()).toBe('No test cases');
    expect(wrapper.find('.empty-placeholder__description').text()).toBe('Add one to begin');
    wrapper.unmount();
  });

  it('swaps to the search state while a search is active', () => {
    const wrapper = mountWithI18n(PanelEmptyPlaceholder, {
      props: { searchText: 'foo', title: 'No test cases', searchResultsTestId: 'search-empty' },
    });
    expect(wrapper.find('[data-testid="search-empty"]').exists()).toBe(true);
    expect(wrapper.find('.empty-placeholder__title').text()).toBe('No matching results');
    wrapper.unmount();
  });

  it('defaults the search test id to the data test id', () => {
    const wrapper = mountWithI18n(PanelEmptyPlaceholder, {
      props: { searchText: 'foo', testId: 'panel-empty' },
    });
    expect(wrapper.find('[data-testid="panel-empty"]').exists()).toBe(true);
    wrapper.unmount();
  });
});
