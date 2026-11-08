<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { Empty, Typography } from 'ant-design-vue';
import HomeWidgetCard from '../HomeWidgetCard.vue';

/**
 * Honest empty cell for a landing-page widget whose official component
 * lands in stage B: the official empty state, never fake data and
 * never a blank grid cell. Stage B replaces each registry entry with
 * its real component; this component then has no callers left.
 */
defineProps<{
  title: string;
  slug: string;
}>();

const { t } = useI18n();
</script>

<template>
  <HomeWidgetCard :title="title" :test-id="`home-widget-${slug}`">
    <Empty :data-testid="`home-widget-${slug}-empty`" :description="t('home.widgetUnavailable')">
      <template #description>
        <Typography.Title :level="5">{{ t('home.widgetUnavailableTitle') }}</Typography.Title>
        <Typography.Paragraph type="secondary">{{ t('home.widgetUnavailable') }}</Typography.Paragraph>
      </template>
    </Empty>
  </HomeWidgetCard>
</template>
