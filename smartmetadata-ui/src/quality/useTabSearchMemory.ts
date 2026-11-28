/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 */
import { ref, watch, type Ref } from 'vue';

/**
 * Pin useTabSearchMemory.ts (ADR:2026-10-29): each tab remembers its latest
 * URL search so switching tabs restores filters instead of leaking them.
 */
export function useTabSearchMemory<T extends string>(
  activeTab: Ref<T>,
  search: Ref<string>,
  isRecording: Ref<boolean> = ref(true),
): (tab: T) => string {
  const searchByTab = ref<Partial<Record<T, string>>>({}) as Ref<Partial<Record<T, string>>>;

  watch(
    [activeTab, search, isRecording],
    () => {
      if (isRecording.value) {
        searchByTab.value[activeTab.value] = search.value;
      }
    },
    { immediate: true },
  );

  const getTabSearch = (tab: T): string => searchByTab.value[tab] ?? '';

  return getTabSearch;
}