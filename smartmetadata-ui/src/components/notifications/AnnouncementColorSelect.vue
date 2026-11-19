<!--
Copyright 2026 SmartMetadata authors.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the Apache License at

    http://www.apache.org/licenses/LICENSE-2.0
-->
<script setup lang="ts">
import { Radio, RadioGroup, type RadioChangeEvent } from 'ant-design-vue';
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import {
  ANNOUNCEMENT_COLOR_LABEL_KEYS,
  getAnnouncementColorOptions,
  type AnnouncementColorValue,
} from '@/utils/notifications/announcementUtils';
import { ANNOUNCEMENT_FAMILY_BASE } from '@/utils/notifications/announcementPresentation';

/**
 * Pin `AnnouncementColorSelect` (AnnouncementTypeField.component.tsx):
 * a radio group whose indicator *is* the swatch — the family's base
 * fills it, and the selected state's white centre dot and brand edge
 * come from the selection. An announcement stored with a colour the
 * form no longer offers keeps it on edit: the swatch is appended
 * rather than silently dropped from the selection.
 */
const props = defineProps<{
  value?: string;
}>();
const emit = defineEmits<{
  (e: 'change', value: AnnouncementColorValue): void;
}>();

const { t } = useI18n();

const options = computed(() => getAnnouncementColorOptions(props.value));

function onChange(event: RadioChangeEvent): void {
  emit('change', event.target.value as AnnouncementColorValue);
}
</script>

<template>
  <RadioGroup
    :value="props.value"
    data-testid="announcement-color-select"
    :aria-label="t('label.color')"
    class="announcement-color-select"
    @change="onChange"
  >
    <Radio
      v-for="color in options"
      :key="color"
      :value="color"
      :aria-label="t(ANNOUNCEMENT_COLOR_LABEL_KEYS[color])"
      :data-testid="`announcement-color-${color}`"
      class="announcement-color-select__option"
    >
      <span
        class="announcement-color-select__swatch"
        :class="{ 'announcement-color-select__swatch--selected': props.value === color }"
        :style="{ backgroundColor: ANNOUNCEMENT_FAMILY_BASE[color] }"
      >
        <span
          v-if="props.value === color"
          class="announcement-color-select__dot"
        />
      </span>
    </Radio>
  </RadioGroup>
</template>

<style scoped>
.announcement-color-select {
  display: flex;
  flex-direction: row;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  min-height: 40px;
}

.announcement-color-select__option {
  margin: 0;
}

.announcement-color-select__option :deep(.ant-radio) {
  display: none;
}

.announcement-color-select__option :deep(.ant-radio + span) {
  padding: 0;
}

.announcement-color-select__swatch {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  width: 24px;
  height: 24px;
  min-width: 24px;
  min-height: 24px;
  border-radius: 50%;
  border: 2px solid transparent;
}

.announcement-color-select__swatch--selected {
  border-color: var(--sm-color-primary);
}

.announcement-color-select__dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--sm-bg-container);
}
</style>
