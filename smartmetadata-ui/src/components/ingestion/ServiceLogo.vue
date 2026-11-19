<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed } from 'vue';
import SmIcon from '@/components/shared/SmIcon.vue';
import {
  getCategoryDefaultLogo,
  getServiceTypeLogo,
  type ServiceLogoSource,
} from '@/ingestion/serviceLogos';
import type { ServiceKind } from '@/types/ingestion';

const props = withDefaults(
  defineProps<{
    source?: ServiceLogoSource;
    /**
     * Category default (empty states, headers): used only when the
     * source carries neither a style icon nor a service type.
     */
    defaultKind?: ServiceKind;
    testId?: string;
    size?: number;
  }>(),
  { source: undefined, defaultKind: undefined, testId: 'service-logo', size: 32 },
);

const logo = computed(() => {
  if (props.source?.style?.iconURL ?? props.source?.service?.style?.iconURL) {
    return getServiceTypeLogo(props.source);
  }
  if (props.source?.serviceType) {
    return getServiceTypeLogo(props.source);
  }
  if (props.defaultKind) {
    return getCategoryDefaultLogo(props.defaultKind);
  }
  return getServiceTypeLogo(props.source);
});
</script>

<template>
  <img
    v-if="logo.kind === 'url'"
    :src="logo.url"
    :width="size"
    :height="size"
    :data-testid="testId"
    alt=""
  />
  <span v-else class="service-logo-icon" :data-testid="testId">
    <SmIcon :icon-key="logo.iconKey" :test-id="`${testId}-icon`" />
  </span>
</template>

<style scoped>
.service-logo-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
</style>
