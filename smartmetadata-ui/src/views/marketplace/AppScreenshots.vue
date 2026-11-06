<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';

export interface AppScreenshotItem {
  key: string;
  name: string;
  src?: string;
}

const props = defineProps<{ screenshots: AppScreenshotItem[] }>();

const { t } = useI18n();

/**
 * Official AppScreenshots (components/Settings/Applications/
 * MarketPlaceAppDetails/AppScreenshots.tsx, pin a3012259ca), ported to Vue:
 * auto-rotates every 3000 ms; pauses while hovered, focused, manually
 * paused, `prefers-reduced-motion: reduce`, or fewer than 2 screenshots.
 * Dot buttons + Play/Pause render only when there is more than one slide.
 * The current index is clamped when the list shrinks, so a screenshot stays
 * visible. A slide without a `src` renders an empty slot of the same size
 * (official's empty-`<Fragment>` for an unresolvable name).
 */
const activeIndex = ref(0);
const isPaused = ref(false);
const isHovered = ref(false);
const isFocused = ref(false);

const currentIndex = computed(() =>
  Math.min(activeIndex.value, Math.max(0, props.screenshots.length - 1)),
);

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

const shouldAutoRotate = computed(
  () =>
    !isPaused.value &&
    !isHovered.value &&
    !isFocused.value &&
    props.screenshots.length >= 2 &&
    !prefersReducedMotion(),
);

let timer: ReturnType<typeof setInterval> | null = null;

function stopTimer(): void {
  if (timer !== null) {
    window.clearInterval(timer);
    timer = null;
  }
}

function startTimer(): void {
  stopTimer();
  if (!shouldAutoRotate.value) {
    return;
  }
  timer = window.setInterval(() => {
    activeIndex.value = (activeIndex.value + 1) % props.screenshots.length;
  }, 3000);
}

watch(shouldAutoRotate, () => startTimer(), { immediate: true });
onBeforeUnmount(stopTimer);

function onFocusOut(event: FocusEvent): void {
  const target = event.currentTarget as HTMLElement | null;
  if (
    target &&
    event.relatedTarget instanceof Node &&
    target.contains(event.relatedTarget)
  ) {
    return;
  }
  isFocused.value = false;
}
</script>

<template>
  <div
    role="region"
    :aria-label="t('apps.detail.screenshots')"
    data-testid="app-screenshots"
    @mouseenter="isHovered = true"
    @mouseleave="isHovered = false"
    @focusin="isFocused = true"
    @focusout="onFocusOut"
  >
    <div style="overflow: hidden">
      <div
        style="display: flex; transition: transform 500ms ease-in-out"
        :style="{ transform: `translateX(-${currentIndex * 100}%)` }"
      >
        <div
          v-for="(screenshot, index) in screenshots"
          :key="screenshot.key"
          :aria-hidden="currentIndex !== index"
          data-testid="app-screenshots-slide"
          style="width: 100%; flex-shrink: 0"
        >
          <img
            v-if="screenshot.src"
            :alt="screenshot.name"
            :src="screenshot.src"
            style="height: 320px; max-width: 100%; object-fit: contain"
          />
        </div>
      </div>
    </div>
    <div
      v-if="screenshots.length > 1"
      style="display: flex; align-items: center; justify-content: center; gap: 8px; margin-top: 12px"
    >
      <button
        v-for="(screenshot, index) in screenshots"
        :key="`dot-${screenshot.key}`"
        type="button"
        :aria-label="t('apps.detail.screenshotsPage', { index: index + 1 })"
        :aria-pressed="currentIndex === index"
        data-testid="app-screenshots-dot"
        style="background: transparent; border: none; cursor: pointer; padding: 4px; line-height: 0"
        @click="activeIndex = index"
      >
        <span
          :style="{
            display: 'inline-block',
            width: '8px',
            height: '8px',
            borderRadius: '50%',
            background: currentIndex === index ? 'var(--sm-primary, #005587)' : '#d9d9d9',
          }"
        />
      </button>
      <button
        type="button"
        data-testid="app-screenshots-play-pause"
        style="background: transparent; border: none; cursor: pointer; color: var(--sm-primary, #005587)"
        @click="isPaused = !isPaused"
      >
        {{ isPaused ? t('apps.detail.play') : t('apps.detail.pause') }}
      </button>
    </div>
  </div>
</template>
