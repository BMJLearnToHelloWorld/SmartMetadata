<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { Avatar, Button } from 'ant-design-vue';
import { useAuthStore } from '@/stores/auth';
import {
  DEFAULT_HEADER_BG_COLOR,
  getLandingPageHeaderTintStyle,
  headerBackgroundColors,
} from './landingHeaderColor';

/**
 * The header-theme picker, ported from the official framework
 * (openmetadata-ui `components/MyData/HeaderTheme/HeaderTheme.tsx`).
 *
 * The colour is laid on the home page's header as a light wash, so
 * the preview renders that same header rather than a swatch of the
 * raw colour: the greeting (`Hi {user}` + the landing subtitle) over
 * the tint style, flat when a colour is chosen, the default gradient
 * otherwise. The preview is the only place the colour is rendered —
 * pin has no production home-page consumer for it (R-G11D-1).
 */
const props = defineProps<{ selectedColor: string }>();
const emit = defineEmits<{ (event: 'update:selected-color', color: string): void }>();

const { t } = useI18n();
const auth = useAuthStore();

function startCase(value: string): string {
  return value
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

const displayName = computed(() => {
  const name = auth.displayName || auth.user?.name || '';
  return name ? startCase(name) : t('home.user');
});

const tintStyle = computed(() => getLandingPageHeaderTintStyle(props.selectedColor));
const previewStyle = computed(
  () =>
    tintStyle.value ?? {
      backgroundImage: DEFAULT_HEADER_BG_COLOR,
    },
);
</script>

<template>
  <div class="header-theme" data-testid="header-theme">
    <h3 class="header-theme__title">{{ t('home.previewHeader') }}</h3>
    <div
      class="header-theme__preview"
      data-testid="modal-header-theme"
      :style="previewStyle"
    >
      <Avatar v-if="auth.user?.name" :size="42" class="header-theme__preview-avatar">
        {{ displayName.charAt(0).toUpperCase() }}
      </Avatar>
      <div class="header-theme__preview-copy">
        <div class="header-theme__preview-title">
          {{ t('home.hiUser', { user: displayName }) }}
        </div>
        <div class="header-theme__preview-subtitle">{{ t('home.landingPageSubtitle') }}</div>
      </div>
    </div>
    <div class="header-theme__select">
      <h3 class="header-theme__title">{{ t('home.selectBackground') }}</h3>
      <div class="header-theme__swatches">
        <Button
          v-for="swatch in headerBackgroundColors"
          :key="swatch.color"
          class="header-theme__swatch"
          :class="{ 'header-theme__swatch--selected': props.selectedColor === swatch.color }"
          :aria-label="swatch.label"
          :aria-pressed="props.selectedColor === swatch.color"
          data-testid="option-color"
          shape="circle"
          :style="{ backgroundColor: swatch.color, borderColor: swatch.color }"
          @click="emit('update:selected-color', swatch.color)"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
.header-theme__title {
  margin: 0 0 12px;
  font-size: 15px;
  font-weight: 600;
}
.header-theme__preview {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px;
  border-radius: var(--sm-radius-card);
  color: var(--sm-text-primary);
}
.header-theme__preview-title {
  font-size: 16px;
  font-weight: 600;
}
.header-theme__preview-subtitle {
  font-size: 12px;
  color: var(--sm-text-secondary);
}
.header-theme__select {
  margin-top: 20px;
}
.header-theme__swatches {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 12px 0;
}
.header-theme__swatch {
  width: 52px !important;
  height: 52px !important;
  min-width: 52px;
  padding: 1px;
  border-width: 2px;
  border-style: solid;
}
.header-theme__swatch--selected {
  outline: 3px solid var(--sm-bg-elevated);
  outline-offset: -6px;
}
</style>
