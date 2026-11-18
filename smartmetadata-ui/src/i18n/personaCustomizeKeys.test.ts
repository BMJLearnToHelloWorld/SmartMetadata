/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { describe, expect, it } from 'vitest';
import enUS from './locales/en-US';
import zhCN from './locales/zh-CN';

/**
 * C-4 customize-category copy (S-C4STORE §7): the 14 `persona.*` keys
 * land here so the keys, their pin values, and the Chinese terminology
 * adjudications stay pinned. The old `persona.customizeAppLayout` keys
 * are deliberately NOT reused — their English values differ from pin.
 */
describe('persona customize-category copy (C-4, S-C4STORE §7)', () => {
  const expectedEn: Record<string, string> = {
    customizeCategoryNavigation: 'Navigation',
    customizeCategoryNavigationDescription: 'Customize left sidebar',
    customizeCategoryAppLayout: 'App Layout',
    customizeCategoryAppLayoutDescription:
      'Configure the app layout applied to users of this persona.',
    customizeCategoryAiSidebar: 'AI Sidebar',
    customizeCategoryAiSidebarDescription:
      'Reorder the AI sidebar navigation, toggle item visibility, and move items in or out of the "More" group for this persona.',
    customizeCategoryHomePage: 'Home Page',
    customizeCategoryHomePageDescription:
      'Customize the My data page with widget of your preference',
    customizeCategoryMarketplace: 'Marketplace',
    entityCustomizeDescription:
      'Customize {entity} detail page with choice of your widget and tabs which is more useful for your use case.',
    customizeCategoryGovernance: 'Governance',
    customizeCategoryGovernanceDescription:
      'Customize the Govern pages with widget of your preference',
    customizeCategoryDataAssets: 'Data Assets',
    customizeCategoryDataAssetsDescription:
      'Customize the entity detail page with widget of your preference',
  };

  const expectedZh: Record<string, string> = {
    customizeCategoryNavigation: '导航',
    customizeCategoryNavigationDescription: '自定义左侧边栏',
    customizeCategoryAppLayout: '应用布局',
    customizeCategoryAppLayoutDescription: '配置应用于此 Persona 下用户的应用布局。',
    customizeCategoryAiSidebar: 'AI 边栏',
    customizeCategoryAiSidebarDescription:
      '重新排序此 Persona 的 AI 边栏导航、切换条目可见性，并将条目移入或移出“更多”分组。',
    customizeCategoryHomePage: '首页',
    customizeCategoryHomePageDescription: '使用偏好的小部件自定义“我的数据”页面',
    customizeCategoryMarketplace: '数据市场',
    entityCustomizeDescription:
      '使用更适合您用例的小部件和页签来自定义{entity}详情页面。',
    customizeCategoryGovernance: '治理',
    customizeCategoryGovernanceDescription: '使用偏好的小部件自定义治理页面',
    customizeCategoryDataAssets: '数据资产',
    customizeCategoryDataAssetsDescription: '使用偏好的小部件自定义实体详情页面',
  };

  it('carries all 14 keys with the pin English values', () => {
    expect(Object.keys(expectedEn)).toHaveLength(14);
    for (const [key, value] of Object.entries(expectedEn)) {
      expect((enUS.persona as Record<string, unknown>)[key], key).toBe(value);
    }
    // The pin navigation literal carries a trailing space; it is stripped
    // (D-13 whitespace-artifact precedent), never silently re-added.
    expect(
      enUS.persona.customizeCategoryNavigationDescription.endsWith(' '),
    ).toBe(false);
  });

  it('carries the adjudicated Chinese values with matching placeholders', () => {
    for (const [key, value] of Object.entries(expectedZh)) {
      expect((zhCN.persona as Record<string, unknown>)[key], key).toBe(value);
    }
    // Product terminology: Persona stays untranslated (pin zh-cn's
    // 用户角色 is not a product term), and UI tabs are 页签, not 标签.
    expect(zhCN.persona.customizeCategoryAppLayoutDescription).not.toContain(
      '用户角色',
    );
    expect(zhCN.persona.entityCustomizeDescription).toContain('页签');
    expect(zhCN.persona.entityCustomizeDescription).not.toContain('标签');
    expect(zhCN.persona.entityCustomizeDescription).toContain('{entity}');
    expect(zhCN.persona.entityCustomizeDescription).not.toContain('{{entity}}');
  });

  it('does not reuse the 4 old customize keys, whose values differ from pin', () => {
    expect(enUS.persona.customizeAppLayout).toBe('App layout');
    expect(enUS.persona.customizeAppLayout).not.toBe(
      enUS.persona.customizeCategoryAppLayout,
    );
    expect(enUS.persona.customizeMarketplace).toBe('Data marketplace');
    expect(enUS.persona.customizeMarketplace).not.toBe(
      enUS.persona.customizeCategoryMarketplace,
    );
    expect(enUS.persona.customizeGovern).toBe('Govern pages');
    expect(enUS.persona.customizeGovern).not.toBe(
      enUS.persona.customizeCategoryGovernance,
    );
  });
});
