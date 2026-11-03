<!--
  Copyright 2026 SmartMetadata authors.

  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { nextTick, onUnmounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute, useRouter } from 'vue-router';
import { Button, Card, Space, Typography } from 'ant-design-vue';
import { TOUR_STEPS } from '@/features/tour/tourSteps';
import { useTourStore } from '@/stores/tour';

const { t } = useI18n();
const route = useRoute();
const router = useRouter();
const tour = useTourStore();
const highlighted = ref<HTMLElement | null>(null);

function clearHighlight(): void {
  if (highlighted.value) {
    highlighted.value.style.outline = '';
    highlighted.value.style.outlineOffset = '';
    highlighted.value = null;
  }
}

/**
 * Official fallback: a step whose target is missing points at the page
 * content, marked data-tour-page in each shell. The tour runs over real
 * pages (no fixtures layer exists in this product), so a step whose
 * section does not exist yet — MyData has no topics section — still
 * shows its copy against the page itself instead of failing.
 */
async function highlightStep(): Promise<void> {
  clearHighlight();
  if (!tour.active) {
    return;
  }
  await nextTick();
  const target =
    (document.querySelector(`[data-tour-step="${tour.step.stepKey}"]`) as HTMLElement | null) ??
    (document.querySelector('[data-tour-page]') as HTMLElement | null);
  if (target) {
    target.style.outline = '2px solid var(--sm-primary, #005587)';
    target.style.outlineOffset = '2px';
    target.scrollIntoView({ block: 'center' });
    highlighted.value = target;
  }
}

watch(
  () => tour.stepIndex,
  (index) => {
    const step = TOUR_STEPS[index];
    if (tour.active && step && route.name !== step.routeName) {
      void router.push({ name: step.routeName }).catch(() => undefined);
    }
    void highlightStep();
  },
);

watch(
  () => route.fullPath,
  () => {
    void highlightStep();
  },
);

watch(
  () => tour.active,
  (active) => {
    if (!active) {
      clearHighlight();
    } else {
      void highlightStep();
    }
  },
);

onUnmounted(clearHighlight);

function onNext(): void {
  tour.next();
}

function onPrev(): void {
  tour.prev();
}

function onSkip(): void {
  tour.stop();
}
</script>

<template>
  <Card
    v-if="tour.active"
    class="tour-overlay"
    data-testid="tour-overlay"
    :title="t(`tour.steps.${tour.step.key}.title`)"
  >
    <Typography.Paragraph>{{ t(`tour.steps.${tour.step.key}.text`) }}</Typography.Paragraph>
    <Space wrap>
      <Button data-testid="tour-prev" :disabled="tour.isFirst" @click="onPrev">{{ t('tour.prev') }}</Button>
      <Button
        v-if="tour.isLast"
        type="primary"
        data-testid="tour-finish"
        @click="onSkip"
      >
        {{ t('tour.finish') }}
      </Button>
      <Button v-else type="primary" data-testid="tour-next" @click="onNext">{{ t('tour.next') }}</Button>
      <Button data-testid="tour-skip" @click="onSkip">{{ t('tour.skip') }}</Button>
      <Typography.Text type="secondary" data-testid="tour-progress">
        {{ t('tour.stepOf', { current: tour.stepIndex + 1, total: TOUR_STEPS.length }) }}
      </Typography.Text>
    </Space>
  </Card>
</template>

<style scoped>
.tour-overlay {
  position: fixed;
  left: 50%;
  bottom: 24px;
  z-index: 1000;
  width: min(480px, calc(100vw - 48px));
  transform: translateX(-50%);
  box-shadow: 0 8px 24px rgb(0 0 0 / 16%);
}
</style>
