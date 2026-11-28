<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
  Official ResourceTypeIcon: Link/PDF/Storylane/Video glyphs; anything
  else (including Article) falls back to Video. Official label.* keys.
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

const RESOURCE_TYPE_LABEL_KEYS: Record<string, string> = {
  Article: 'label.article',
  Link: 'label.link',
  PDF: 'label.pdf',
  Storylane: 'label.storylane',
  Video: 'label.video',
};

const props = defineProps<{ resourceType: string }>();
const { t } = useI18n();

const iconType = computed(() => {
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
  () => RESOURCE_TYPE_LABEL_KEYS[props.resourceType] ?? RESOURCE_TYPE_LABEL_KEYS.Video,
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
