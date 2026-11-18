<!--
  Copyright 2026 SmartMetadata authors.

  Licensed under the Apache License, Version 2.0 (the "License");
  you may not use this file except in compliance with the License.
  You may obtain a copy of the License at

      http://www.apache.org/licenses/LICENSE-2.0
-->
<!--
  Vue port of core-components components/application/hover-card/
  hover-card.tsx:28-163 (the HoverCard carrier for UserPopOverCard).

  Official behavior preserved: one shared timer; openDelay 300ms /
  closeDelay 200ms; hover on the trigger AND the card; focus-within on
  the card; trigger focus opens only on keyboard modality (useFocusVisible
  parity); Escape closes immediately with the document listener attached
  only while open; content mounts only when open; no outside-click close
  (non-modal). Framework adaptations: no react-aria in the product, so
  hover/focus are plain DOM handlers and the card is positioned
  absolutely against the trigger wrapper (start-edge aligned) instead
  of a floating-ui portal — only `bottom` is consumed by
  UserPopOverCard; the other placements are positional approximations.
  Card surface uses product tokens.
-->
<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';

export type HoverCardPlacement = 'bottom' | 'top' | 'left' | 'right';

const props = withDefaults(
  defineProps<{
    placement?: HoverCardPlacement;
    openDelay?: number;
    closeDelay?: number;
    isDisabled?: boolean;
    offset?: number;
    arrow?: boolean;
    className?: string;
  }>(),
  {
    placement: 'bottom',
    openDelay: 300,
    closeDelay: 200,
    isDisabled: false,
    offset: 8,
    arrow: false,
    className: '',
  }
);

const isOpen = ref(false);
const shown = computed(() => isOpen.value && !props.isDisabled);

let timer: ReturnType<typeof setTimeout> | undefined;

function clearTimer(): void {
  if (timer !== undefined) {
    clearTimeout(timer);
    timer = undefined;
  }
}

function schedule(open: boolean): void {
  clearTimer();
  timer = setTimeout(() => {
    isOpen.value = open;
  }, open ? props.openDelay : props.closeDelay);
}

function onEscapeKeyDown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    clearTimer();
    isOpen.value = false;
  }
}

watch(isOpen, (open) => {
  if (open) {
    document.addEventListener('keydown', onEscapeKeyDown);
  } else {
    document.removeEventListener('keydown', onEscapeKeyDown);
  }
});

// Keyboard-vs-pointer modality, mirroring react-aria useFocusVisible:
// trigger focus opens the card only when the last interaction was via
// the keyboard; a mouse click focuses without opening.
let lastModality: 'keyboard' | 'pointer' = 'keyboard';

function onDocumentKeyDown(): void {
  lastModality = 'keyboard';
}

function onDocumentPointerDown(): void {
  lastModality = 'pointer';
}

onMounted(() => {
  document.addEventListener('keydown', onDocumentKeyDown);
  document.addEventListener('mousedown', onDocumentPointerDown);
});

onBeforeUnmount(() => {
  clearTimer();
  document.removeEventListener('keydown', onEscapeKeyDown);
  document.removeEventListener('keydown', onDocumentKeyDown);
  document.removeEventListener('mousedown', onDocumentPointerDown);
});

function containsFocus(element: HTMLElement | null, target: EventTarget | null): boolean {
  return !!element && !!target && target instanceof Node && element.contains(target);
}

function onTriggerFocusIn(): void {
  if (lastModality === 'keyboard') {
    schedule(true);
  }
}

function onTriggerFocusOut(event: FocusEvent, element: HTMLElement): void {
  if (!containsFocus(element, event.relatedTarget)) {
    schedule(false);
  }
}

function onCardFocusIn(): void {
  schedule(true);
}

function onCardFocusOut(event: FocusEvent, element: HTMLElement): void {
  if (!containsFocus(element, event.relatedTarget)) {
    schedule(false);
  }
}

const cardStyle = computed(() => {
  const gap = `${props.offset}px`;
  switch (props.placement) {
    case 'top':
      return { bottom: `calc(100% + ${gap})`, left: '0px' };
    case 'left':
      return { right: `calc(100% + ${gap})`, top: '0px' };
    case 'right':
      return { left: `calc(100% + ${gap})`, top: '0px' };
    case 'bottom':
    default:
      return { top: `calc(100% + ${gap})`, left: '0px' };
  }
});
</script>

<template>
  <span class="sm-hover-card" :class="className">
    <span
      class="sm-hover-card__trigger"
      @mouseenter="schedule(true)"
      @mouseleave="schedule(false)"
      @focusin="onTriggerFocusIn"
      @focusout="onTriggerFocusOut($event, $event.currentTarget as HTMLElement)"
    >
      <slot />
    </span>
    <div
      v-if="shown"
      class="sm-hover-card__card"
      :style="cardStyle"
      @mouseenter="schedule(true)"
      @mouseleave="schedule(false)"
      @focusin="onCardFocusIn"
      @focusout="onCardFocusOut($event, $event.currentTarget as HTMLElement)"
    >
      <div v-if="arrow" class="sm-hover-card__arrow" :data-placement="placement" />
      <slot name="content" />
    </div>
  </span>
</template>

<style scoped>
.sm-hover-card {
  position: relative;
  display: inline-flex;
  min-width: 0;
  max-width: 100%;
}
.sm-hover-card__trigger {
  display: inline-flex;
  min-width: 0;
  max-width: 100%;
}
.sm-hover-card__card {
  position: absolute;
  z-index: var(--sm-z-popover);
  padding: 16px;
  background-color: var(--sm-bg-container);
  border: 1px solid var(--sm-border-color);
  border-radius: var(--sm-border-radius);
  box-shadow: var(--sm-shadow-overlay);
  outline: none;
}
.sm-hover-card__arrow {
  position: absolute;
  width: 10px;
  height: 10px;
  background-color: var(--sm-bg-container);
  border: 1px solid var(--sm-border-color);
  transform: rotate(45deg);
}
.sm-hover-card__arrow[data-placement='bottom'] {
  top: -6px;
  left: 12px;
  border-right: none;
  border-bottom: none;
}
.sm-hover-card__arrow[data-placement='top'] {
  bottom: -6px;
  left: 12px;
  border-left: none;
  border-top: none;
}
.sm-hover-card__arrow[data-placement='left'] {
  right: -6px;
  top: 12px;
  border-left: none;
  border-bottom: none;
}
.sm-hover-card__arrow[data-placement='right'] {
  left: -6px;
  top: 12px;
  border-right: none;
  border-top: none;
}
</style>
