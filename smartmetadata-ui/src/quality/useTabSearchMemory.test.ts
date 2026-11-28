/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 */
import { describe, expect, it } from 'vitest';
import { nextTick, ref } from 'vue';
import { useTabSearchMemory } from './useTabSearchMemory';

type Tab = 'test-cases' | 'test-suites' | 'dashboard';

describe('useTabSearchMemory', () => {
  it('records the latest search per tab', async () => {
    const activeTab = ref<Tab>('test-cases');
    const search = ref('?status=Failed');
    const getTabSearch = useTabSearchMemory(activeTab, search);

    search.value = '?status=Success';
    await nextTick();
    activeTab.value = 'test-suites';
    search.value = '?owner=admin';
    await nextTick();

    expect(getTabSearch('test-cases')).toBe('?status=Success');
    expect(getTabSearch('test-suites')).toBe('?owner=admin');
  });

  it('returns an empty search for a tab that was never visited', () => {
    const activeTab = ref<Tab>('test-cases');
    const search = ref('?status=Failed');
    const getTabSearch = useTabSearchMemory(activeTab, search);

    expect(getTabSearch('dashboard')).toBe('');
  });

  it('does not record while another route owns the URL', () => {
    const activeTab = ref<Tab>('test-cases');
    const search = ref('?status=Failed');
    const isRecording = ref(true);
    const getTabSearch = useTabSearchMemory(activeTab, search, isRecording);

    isRecording.value = false;
    search.value = '?q=other-route';

    expect(getTabSearch('test-cases')).toBe('?status=Failed');
  });

  it('keeps the same lookup function across renders', () => {
    const activeTab = ref<Tab>('test-cases');
    const search = ref('?status=Failed');
    const getTabSearch = useTabSearchMemory(activeTab, search);
    const firstLookup = getTabSearch;

    activeTab.value = 'test-suites';
    search.value = '';

    expect(getTabSearch).toBe(firstLookup);
  });
});