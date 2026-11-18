<!--
Copyright 2026 SmartMetadata authors.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the Apache License at

    http://www.apache.org/licenses/LICENSE-2.0
-->
<script setup lang="ts">
import { Radio, RadioGroup, type RadioChangeEvent } from 'ant-design-vue';
import { useI18n } from 'vue-i18n';
import type { AnnouncementType } from '@/types/collaboration';
import {
  ANNOUNCEMENT_TYPE_CONFIG,
  ANNOUNCEMENT_TYPE_ORDER,
} from '@/utils/notifications/announcementUtils';
import { ANNOUNCEMENT_TYPE_ICONS } from '@/utils/notifications/announcementPresentation';

/**
 * Pin `AnnouncementTypeSelect` (AnnouncementTypeField.component.tsx):
 * one of five mutually exclusive types, so a radio group rather than
 * a row of toggle buttons — one tab stop with arrow keys between the
 * options. The radio circle itself is hidden; the chip is the
 * control's whole visual. The chips stay neutral whatever the type:
 * the choice is shown by fill, not by the type's own colour. Custom
 * has no fixed icon of its own to preview, so it falls back to a dot.
 */
const props = defineProps<{
  value?: AnnouncementType;
}>();
const emit = defineEmits<{
  (e: 'change', value: AnnouncementType): void;
}>();

const { t } = useI18n();

function onChange(event: RadioChangeEvent): void {
  emit('change', event.target.value as AnnouncementType);
}
</script>

<template>
  <RadioGroup
    :value="props.value"
    data-testid="announcement-type-select"
    :aria-label="t('label.announcement-type')"
    class="announcement-type-select"
    @change="onChange"
  >
    <Radio
      v-for="type in ANNOUNCEMENT_TYPE_ORDER"
      :key="type"
      :value="type"
      :data-testid="`announcement-type-${type}`"
      class="announcement-type-select__option"
    >
      <span
        class="announcement-type-select__chip"
        :class="{ 'announcement-type-select__chip--selected': props.value === type }"
      >
        <span v-if="type === 'Custom'" class="announcement-type-select__dot" />
        <component
          :is="ANNOUNCEMENT_TYPE_ICONS[ANNOUNCEMENT_TYPE_CONFIG[type].iconKey]"
          v-else
        />
        {{ t(ANNOUNCEMENT_TYPE_CONFIG[type].labelKey) }}
      </span>
    </Radio>
  </RadioGroup>
</template>

<style scoped>
.announcement-type-select {
  display: flex;
  flex-direction: row;
  flex-wrap: wrap;
  gap: 8px;
}

.announcement-type-select__option {
  margin: 0;
}

.announcement-type-select__option :deep(.ant-radio) {
  display: none;
}

.announcement-type-select__option :deep(.ant-radio + span) {
  padding: 0;
}

.announcement-type-select__chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  padding: 6px 12px;
  border-radius: 6px;
  border: 1px solid var(--sm-border-color);
  background: var(--sm-bg-container);
  color: var(--sm-text-primary);
  font-size: 13px;
  line-height: 20px;
}

.announcement-type-select__chip--selected {
  background: var(--sm-color-primary);
  border-color: var(--sm-color-primary);
  color: var(--sm-text-on-primary);
}

.announcement-type-select__dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: currentColor;
  flex-shrink: 0;
}
</style>
