/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0.
 */
import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import SmMarkdown from './SmMarkdown.vue';

describe('SmMarkdown', () => {
  it('renders headings, bold, links and lists', () => {
    const wrapper = mount(SmMarkdown, {
      props: {
        markdown: '# Title\n\nHello **world** and [docs](https://example.com).\n\n- one\n- two',
      },
    });
    expect(wrapper.find('h1').text()).toBe('Title');
    expect(wrapper.find('strong').text()).toBe('world');
    const link = wrapper.find('a');
    expect(link.attributes('href')).toBe('https://example.com');
    expect(wrapper.findAll('li').map((item) => item.text())).toEqual(['one', 'two']);
  });

  it('escapes raw HTML instead of rendering it', () => {
    const wrapper = mount(SmMarkdown, {
      props: { markdown: '<script>alert(1)</script> plain' },
    });
    expect(wrapper.find('script').exists()).toBe(false);
    expect(wrapper.text()).toContain('plain');
  });

  it('drops unsafe link schemes', () => {
    const wrapper = mount(SmMarkdown, {
      props: { markdown: '[click](javascript:alert(1))' },
    });
    expect(wrapper.find('a').exists()).toBe(false);
    expect(wrapper.text()).toContain('click');
  });

  it('renders fenced code without interpreting its contents', () => {
    const wrapper = mount(SmMarkdown, {
      props: { markdown: '```\nconst x = "**not bold**";\n```' },
    });
    expect(wrapper.find('pre code').text()).toContain('**not bold**');
    expect(wrapper.find('strong').exists()).toBe(false);
  });
});
