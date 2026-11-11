<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, nextTick, onUnmounted, ref, watch } from 'vue';
import { Alert } from 'ant-design-vue';
import { useLimitBannerStore } from '@/stores/limitBanner';

/**
 * The global limit banner, ported from the official framework
 * (openmetadata-ui `components/LimitBanner/LimitBanner.tsx`): the
 * header, the subheader, and a dismiss that clears the banner
 * details. Mounted once in App.vue, above the routed content.
 *
 * Deviation, recorded in
 * ADR:2026-11-10-my-data-limit-banner-no-plans-link — the official
 * banner links to `/settings/billing/plans`, which does not exist in
 * this console, so the link is dropped rather than pointing at a
 * dead route.
 *
 * The banner sits outside AppShell while the home page sizes itself
 * against the viewport, so its height is published as
 * `--sm-banner-height` on the document root (measured with a
 * ResizeObserver; 0 when hidden) for pages to subtract (S-H3).
 * ADR:2026-11-11-home-style-compaction-and-tokens
 */
const banner = useLimitBannerStore();

const alertType = computed(() =>
  banner.bannerDetails?.type === 'danger' ? 'error' : 'warning',
);

const bannerRef = ref<{ $el?: HTMLElement } | null>(null);
let observer: ResizeObserver | null = null;

function syncBannerHeight(): void {
  const el = bannerRef.value?.$el;
  const height = el ? Math.round(el.getBoundingClientRect().height) : 0;
  document.documentElement.style.setProperty('--sm-banner-height', `${height}px`);
}

watch(
  () => banner.bannerDetails,
  async (details) => {
    if (!details) {
      observer?.disconnect();
      observer = null;
      document.documentElement.style.setProperty('--sm-banner-height', '0px');
      return;
    }
    await nextTick();
    syncBannerHeight();
    const el = bannerRef.value?.$el;
    if (el && typeof ResizeObserver !== 'undefined') {
      observer?.disconnect();
      observer = new ResizeObserver(() => syncBannerHeight());
      observer.observe(el);
    }
  },
  { immediate: true },
);

onUnmounted(() => {
  observer?.disconnect();
  observer = null;
  document.documentElement.style.removeProperty('--sm-banner-height');
});
</script>

<template>
  <Alert
    v-if="banner.bannerDetails"
    ref="bannerRef"
    class="limit-banner"
    data-testid="limit-banner"
    :message="banner.bannerDetails.header"
    :description="banner.bannerDetails.subheader"
    :type="alertType"
    show-icon
    closable
    @close="banner.clearBannerDetails()"
  />
</template>

<style scoped>
.limit-banner {
  border-radius: 0;
  border-inline: 0;
  border-top: 0;
}
</style>
