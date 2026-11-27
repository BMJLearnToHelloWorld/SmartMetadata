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
import { describe, expect, it } from 'vitest';
import { createTestI18n } from '@/test/i18n';
import type { EstateNode } from '@/catalog/browseEstate';
import ExploreEstateTree from './ExploreEstateTree.vue';

const NODES: EstateNode[] = [
  {
    key: 'databases',
    categoryId: 'databases',
    titleKey: 'explore.estate.databases',
    count: 14,
    isLeaf: false,
    children: [
      {
        key: 'databases:serviceType:mysql',
        categoryId: 'databases',
        serviceType: 'mysql',
        titleKey: '',
        title: 'mysql',
        count: 8,
        isLeaf: false,
        children: [
          {
            key: 'databases:serviceType:mysql:service:isales_mysql',
            categoryId: 'databases',
            serviceType: 'mysql',
            service: 'isales_mysql',
            titleKey: '',
            title: 'isales_mysql',
            count: 8,
            iconUrl: 'https://cdn.example/logo.svg',
            isLeaf: false,
            children: [
              {
                key: 'databases:serviceType:mysql:service:isales_mysql:database:analytics:schema:marts:entityType:table',
                categoryId: 'databases',
                serviceType: 'mysql',
                service: 'isales_mysql',
                database: 'analytics',
                schema: 'marts',
                entityType: 'table',
                titleKey: 'explore.entity.table',
                count: 8,
                isLeaf: true,
              },
            ],
          },
        ],
      },
    ],
  },
];

describe('ExploreEstateTree', () => {
  it('renders official browse-estate title and an icon on every official tree level', () => {
    const wrapper = mount(ExploreEstateTree, {
      props: {
        nodes: NODES,
        selectedKeys: [],
        expandedKeys: [
          'databases',
          'databases:serviceType:mysql',
          'databases:serviceType:mysql:service:isales_mysql',
        ],
      },
      global: { plugins: [Antd, createTestI18n()] },
    });
    expect(wrapper.get('[data-testid="explore-estate"]').text()).toContain('Browse estate');
    expect(wrapper.find('[data-testid="explore-estate-icon-databases"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="explore-estate-logo-databases:serviceType:mysql"]').exists()).toBe(true);
    expect(
      wrapper.find('[data-testid="explore-estate-logo-databases:serviceType:mysql:service:isales_mysql"]').exists(),
    ).toBe(true);
    expect(
      wrapper
        .find(
          '[data-testid="explore-estate-icon-databases:serviceType:mysql:service:isales_mysql:database:analytics:schema:marts:entityType:table"]',
        )
        .exists(),
    ).toBe(true);
    expect(wrapper.text()).toContain('Table');
  });
});
