<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
  Official ResourceTypeIcon: Link/PDF/Storylane/Video have their own
  glyph; anything else (Article included) falls back to the Video glyph.
  Glyphs are product-icon approximations of the official custom SVGs.
-->
<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import {
  FilePdfOutlined,
  LinkOutlined,
  PlayCircleOutlined,
  PlaySquareOutlined,
} from '@ant-design/icons-vue';
import { RESOURCE_TYPE_LABEL_KEYS, type ResourceTypeValue } from './learningConstants';

const props = defineProps<{ resourceType: string }>();
const { t } = useI18n();

const iconType = computed<ResourceTypeValue>(() => {
  switch (props.resourceType) {
    case 'Link':
    case 'PDF':
    case 'Storylane':
    case 'Video':
      return props.resourceType;
    default:
      return 'Video';
  }
});

const labelKey = computed(
  () =>
    RESOURCE_TYPE_LABEL_KEYS[props.resourceType as ResourceTypeValue] ??
    RESOURCE_TYPE_LABEL_KEYS.Video,
);
</script>

<template>
  <span
    role="img"
    :aria-label="t(labelKey)"
    :data-testid="`resource-type-icon-${iconType}`"
  >
    <LinkOutlined v-if="iconType === 'Link'" />
    <FilePdfOutlined v-else-if="iconType === 'PDF'" />
    <PlaySquareOutlined v-else-if="iconType === 'Storylane'" />
    <PlayCircleOutlined v-else />
  </span>
</template>
