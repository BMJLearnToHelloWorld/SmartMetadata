<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { LeftOutlined, RightOutlined } from '@ant-design/icons-vue';
import type { RailScrollState } from '@/features/home/useRailPager';

const props = defineProps<{
  testIdPrefix: string;
  canScroll: RailScrollState;
}>();

const emit = defineEmits<{
  previous: [];
  next: [];
}>();

const { t } = useI18n();
const pagerRef = ref<HTMLElement | null>(null);
// Survives the blur that disabling the button causes, so the watcher
// below still knows which side held focus.
const focusedSideRef = ref<'previous' | 'next' | null>(null);

function onFocus(side: 'previous' | 'next'): void {
  focusedSideRef.value = side;
}

function onBlur(event: FocusEvent): void {
  if (!(event.currentTarget as HTMLButtonElement | null)?.disabled) {
    focusedSideRef.value = null;
  }
}

// When the focused button becomes disabled, focus moves to the other
// button rather than falling to the page.
watch(
  () => props.canScroll,
  (canScroll) => {
    const side = focusedSideRef.value;
    if (!side) {
      return;
    }
    const opposite = side === 'previous' ? 'next' : 'previous';
    const active = document.activeElement;
    const isFocusDropped =
      !active || active === document.body || Boolean(pagerRef.value?.contains(active));
    if (isFocusDropped && !canScroll[side] && canScroll[opposite]) {
      pagerRef.value
        ?.querySelector<HTMLButtonElement>(`[data-pager-side="${opposite}"]`)
        ?.focus();
    }
  },
);
</script>

<template>
  <div ref="pagerRef" class="rail-pager" role="group" :aria-label="t('home.announcements')">
    <button
      type="button"
      class="rail-pager__button"
      :data-testid="`${testIdPrefix}-previous`"
      data-pager-side="previous"
      :disabled="!canScroll.previous"
      :aria-label="t('home.previousPage')"
      @focus="onFocus('previous')"
      @blur="onBlur"
      @click="emit('previous')"
    >
      <LeftOutlined />
    </button>
    <button
      type="button"
      class="rail-pager__button"
      :data-testid="`${testIdPrefix}-next`"
      data-pager-side="next"
      :disabled="!canScroll.next"
      :aria-label="t('home.nextPage')"
      @focus="onFocus('next')"
      @blur="onBlur"
      @click="emit('next')"
    >
      <RightOutlined />
    </button>
  </div>
</template>

<style scoped>
.rail-pager {
  display: flex;
  align-items: center;
  gap: 4px;
}
.rail-pager__button {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border: 1px solid var(--sm-border, #d9d9d9);
  border-radius: 6px;
  background: var(--sm-bg-elevated, #fff);
  cursor: pointer;
}
.rail-pager__button:disabled {
  cursor: default;
  opacity: 0.4;
}
</style>
