/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may
 * not use this file except in compliance with the License. You may obtain
 * a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { onBeforeUnmount, ref, watch, type Ref } from 'vue';

/**
 * Port of official `hooks/useRailPager.ts`: paging for a horizontally
 * scrolling, scroll-snapped list. Which pager buttons are live is read
 * off the element rather than tracked as an index, so it stays correct
 * however many items fit at the current width.
 *
 * `itemCount` re-measures the rail when its items change. The rail
 * moves only when the user pages — never auto-rotating, so an outage
 * notice never slides away mid-read.
 *
 * ADR:2026-11-08-my-data-announcements-rail
 */

// Fraction of the rail's visible width a pager click travels. Under 1
// so the item at the edge stays partly visible and the scroll reads as
// continuous; the rail's scroll-snap settles it on the next item's start.
const RAIL_PAGE_FRACTION = 0.9;
// Sub-pixel slack: fractional item widths leave a fraction of a pixel
// of scroll left at either end, which would otherwise keep a pager
// button enabled forever.
const RAIL_SCROLL_EPSILON = 1;

export interface RailScrollState {
  next: boolean;
  previous: boolean;
}

export interface RailPager {
  railRef: Ref<HTMLElement | null>;
  canScroll: Ref<RailScrollState>;
  /** The page the rail rests on, a page being its visible width plus a gap. */
  pageIndex: Ref<number>;
  syncScrollState: () => void;
  goToPrevious: () => void;
  goToNext: () => void;
}

export function useRailPager(itemCount: Ref<number>): RailPager {
  const railRef = ref<HTMLElement | null>(null);
  const canScroll = ref<RailScrollState>({ next: false, previous: false });
  const pageIndex = ref(0);

  function syncScrollState(): void {
    const rail = railRef.value;
    if (!rail) {
      return;
    }
    const maxScrollLeft = rail.scrollWidth - rail.clientWidth;
    const next = rail.scrollLeft < maxScrollLeft - RAIL_SCROLL_EPSILON;
    const previous = rail.scrollLeft > RAIL_SCROLL_EPSILON;
    // Smooth scrolling fires this every frame — hand back the same
    // values when nothing changed so Vue bails out instead of
    // re-rendering the rail.
    if (canScroll.value.next !== next || canScroll.value.previous !== previous) {
      canScroll.value = { next, previous };
    }
    // The gap is the space between two items, so one page of travel spans it.
    const gap = Number.parseFloat(getComputedStyle(rail).columnGap) || 0;
    const pageWidth = rail.clientWidth + gap;
    pageIndex.value = pageWidth > 0 ? Math.round(rail.scrollLeft / pageWidth) : 0;
  }

  function scrollByPage(direction: 1 | -1): void {
    const rail = railRef.value;
    rail?.scrollBy?.({
      behavior: 'smooth',
      left: direction * rail.clientWidth * RAIL_PAGE_FRACTION,
    });
  }

  let observer: ResizeObserver | null = null;

  // The rail element may mount after the first load (the section only
  // renders once live items arrive), so attach when the ref lands
  // rather than once at mount.
  watch(
    railRef,
    (rail) => {
      observer?.disconnect();
      observer = null;
      if (!rail) {
        return;
      }
      syncScrollState();
      observer = new ResizeObserver(syncScrollState);
      observer.observe(rail);
    },
    { immediate: true },
  );

  onBeforeUnmount(() => {
    observer?.disconnect();
    observer = null;
  });

  watch(itemCount, () => syncScrollState());

  return {
    railRef,
    canScroll,
    pageIndex,
    syncScrollState,
    goToPrevious: () => scrollByPage(-1),
    goToNext: () => scrollByPage(1),
  };
}
