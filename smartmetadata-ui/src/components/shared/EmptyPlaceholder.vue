<!--
  Copyright 2026 SmartMetadata authors.

  Licensed under the Apache License, Version 2.0 (the "License");
  you may not use this file except in compliance with the License.
  You may obtain a copy of the License at

      http://www.apache.org/licenses/LICENSE-2.0
-->
<!--
  Vue port of the core-components EmptyPlaceholder: the shell
  (empty-placeholder-shell.tsx) plus the blank and features layouts
  (blank-empty-placeholder.tsx, features-empty-placeholder.tsx).

  The root is absolutely positioned and fills its nearest positioned
  ancestor, so the host container MUST set `position: relative`.
  The footer slot replaces the generated action buttons entirely.
  The features variant has no gradient background: the product has no
  `--gradient-empty-placeholder-features` token and no new visual
  language is introduced (00 D6 EMP-6).
-->
<script setup lang="ts">
import { computed, useSlots } from 'vue';
import type {
  EmptyPlaceholderContentPropsInput,
  EmptyPlaceholderFeature,
} from '@/utils/emptyPlaceholder';

export type EmptyPlaceholderVariant = 'blank' | 'features';

const props = withDefaults(
  defineProps<
    EmptyPlaceholderContentPropsInput & {
      variant?: EmptyPlaceholderVariant;
      features?: EmptyPlaceholderFeature[];
    }
  >(),
  { variant: 'blank', gap: 5, testId: 'empty-placeholder' }
);

const slots = useSlots();

const DEFAULT_BLANK_WIDTH = 512;

const hasIcon = computed(() => !!slots.icon || !!props.icon);
const hasTitle = computed(() => !!slots.title || !!props.title);
const hasDescription = computed(() => !!slots.description || !!props.description);
const hasHeader = computed(() => hasTitle.value || hasDescription.value);
const hasFeatures = computed(() => !!props.features && props.features.length > 0);

const innerStyle = computed(() => {
  const width = props.variant === 'blank' ? (props.width ?? DEFAULT_BLANK_WIDTH) : props.width;
  return {
    gap: `${(props.variant === 'features' ? 0 : (props.gap ?? 5)) * 4}px`,
    ...(width === undefined
      ? {}
      : { width: '100%', maxWidth: typeof width === 'number' ? `${width}px` : width }),
  };
});
</script>

<template>
  <div
    class="empty-placeholder"
    :class="className"
    :data-testid="testId"
  >
    <div class="empty-placeholder__inner" :style="innerStyle">
      <template v-if="variant === 'features'">
        <div v-if="hasHeader" class="empty-placeholder__text-block">
          <div v-if="hasTitle" class="empty-placeholder__features-title">
            <slot name="title">{{ title }}</slot>
          </div>
          <div v-if="hasDescription" class="empty-placeholder__features-description">
            <slot name="description">{{ description }}</slot>
          </div>
        </div>
        <div v-if="hasFeatures" class="empty-placeholder__features" :class="{ 'empty-placeholder__features--spaced': hasHeader }">
          <div v-for="feature in features" :key="feature.key" class="empty-placeholder__feature">
            <div class="empty-placeholder__icon-box" :class="feature.iconClassName">
              <component :is="feature.icon" data-icon />
            </div>
            <div class="empty-placeholder__feature-text">
              <a-button
                v-if="feature.action"
                size="small"
                :disabled="feature.action.disabled"
                :data-testid="feature.action.testId"
                @click="feature.action.onPress?.()"
              >
                {{ feature.title }}
              </a-button>
              <div v-else class="empty-placeholder__feature-title">{{ feature.title }}</div>
              <div v-if="feature.description" class="empty-placeholder__feature-description">
                {{ feature.description }}
              </div>
            </div>
          </div>
        </div>
      </template>
      <template v-else>
        <div v-if="hasIcon" class="empty-placeholder__icon-box">
          <slot name="icon">
            <component :is="icon" v-if="icon" data-icon />
          </slot>
        </div>
        <div v-if="hasTitle || hasDescription" class="empty-placeholder__text-block">
          <div v-if="hasTitle" class="empty-placeholder__title">
            <slot name="title">{{ title }}</slot>
          </div>
          <div v-if="hasDescription" class="empty-placeholder__description">
            <slot name="description">{{ description }}</slot>
          </div>
        </div>
      </template>
      <div
        v-if="$slots.footer || (actions && actions.length > 0)"
        class="empty-placeholder__footer"
        :class="{
          'empty-placeholder__footer--spaced':
            variant === 'features' && (hasHeader || hasFeatures),
        }"
      >
        <slot name="footer">
          <div class="empty-placeholder__actions">
            <a-button
              v-for="action in actions"
              :key="action.key"
              :id="action.id"
              :size="action.size ?? 'small'"
              :type="action.color === 'primary' ? 'primary' : 'default'"
              :disabled="action.disabled"
              :data-testid="action.testId"
              @click="action.onPress?.()"
            >
              <component :is="action.icon" v-if="action.icon" />
              {{ action.label }}
            </a-button>
          </div>
        </slot>
      </div>
    </div>
  </div>
</template>

<style scoped>
.empty-placeholder {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
}
.empty-placeholder__inner {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
}
.empty-placeholder__icon-box {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  width: 64px;
  height: 64px;
  font-size: 28px;
  color: var(--sm-color-primary);
  background-color: var(--sm-color-primary-bg);
  border-radius: 16px;
  box-shadow: var(--sm-shadow-card);
}
/* Dark adaptation: the light tint would glare on dark surfaces, so the
   box becomes a darker well in the established dark tint, with the
   focus-ring tint for the glyph (theme.css dark-block pattern). */
:root[data-theme='dark'] .empty-placeholder__icon-box {
  color: var(--sm-icon-accent-on-dark);
  background-color: rgb(0 85 135 / 16%);
  box-shadow: var(--sm-shadow-widget);
}
.empty-placeholder__text-block {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  max-width: 512px;
  text-align: center;
}
.empty-placeholder__title {
  /* Explicit colour: hosts that tint their text (table empty rows) must
     not turn the heading into description-grey. */
  font-size: 14px;
  font-weight: 600;
  color: var(--sm-text-primary);
}
.empty-placeholder__description {
  font-size: 12px;
  color: var(--sm-text-secondary);
}
.empty-placeholder__features-title {
  font-size: 18px;
  font-weight: 600;
}
.empty-placeholder__features-description {
  font-size: 14px;
  color: var(--sm-text-tertiary);
}
.empty-placeholder__features {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  justify-content: center;
  gap: 40px;
}
.empty-placeholder__features--spaced {
  margin-top: 30px;
}
.empty-placeholder__feature {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 20px;
  max-width: 220px;
  text-align: center;
}
.empty-placeholder__feature-text {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}
.empty-placeholder__feature-title {
  font-size: 14px;
  font-weight: 600;
}
.empty-placeholder__feature-description {
  font-size: 14px;
  color: var(--sm-text-tertiary);
}
.empty-placeholder__footer--spaced {
  margin-top: 22px;
}
.empty-placeholder__actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 12px;
}
</style>
