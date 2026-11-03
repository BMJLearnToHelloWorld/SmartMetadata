<!--
  Copyright 2026 SmartMetadata authors.

  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { Spin } from 'ant-design-vue';
import { TOUR_STEPS } from '@/features/tour/tourSteps';
import { useTourStore } from '@/stores/tour';

const router = useRouter();
const tour = useTourStore();

// Mirrors the official /tour page: it only starts the tour, then the
// overlay (mounted in the shell) covers the first step's real page.
onMounted(() => {
  tour.start();
  void router.push({ name: TOUR_STEPS[0].routeName }).catch(() => undefined);
});
</script>

<template>
  <Spin data-testid="tour-start-loading" />
</template>
