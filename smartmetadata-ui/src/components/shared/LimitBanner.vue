<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed } from 'vue';
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
 */
const banner = useLimitBannerStore();

const alertType = computed(() =>
  banner.bannerDetails?.type === 'danger' ? 'error' : 'warning',
);
</script>

<template>
  <Alert
    v-if="banner.bannerDetails"
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
