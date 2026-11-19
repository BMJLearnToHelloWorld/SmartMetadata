<!--
Copyright 2026 SmartMetadata authors.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the Apache License at

    http://www.apache.org/licenses/LICENSE-2.0
-->
<script setup lang="ts">
import { CalendarOutlined } from '@ant-design/icons-vue';
import { Button, Calendar, Input, Popover } from 'ant-design-vue';
import dayjs, { type Dayjs } from 'dayjs';
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import {
  fromCalendarValue,
  toCalendarDay,
} from '@/utils/notifications/announcementUtils';

/**
 * Pin `AnnouncementDateField` (AnnouncementDateField.tsx:67-116): a
 * field-shaped control opening a calendar popover. Every day click
 * commits straight through `onChange`, and Apply is the only
 * confirming exit — Cancel, Escape and an outside click all revert
 * to what the field held when the popover opened, so a mis-click
 * never survives dismissing the popover. The `end` boundary anchors
 * the value to 23:59:59.999 so the chosen day is included. The
 * popover also carries a Today preset, as pin's DatePicker does.
 */
const props = withDefaults(
  defineProps<{
    /** `end` anchors the value to 23:59:59.999 so the chosen day is included. */
    boundary?: 'start' | 'end';
    error?: string;
    id: string;
    label: string;
    value?: number | null;
  }>(),
  { boundary: 'start' },
);
const emit = defineEmits<{
  (e: 'change', value: number | null): void;
}>();

const { t } = useI18n();

const popoverOpen = ref(false);
const panelDay = ref<Dayjs>(dayjs());
// What the field held when the popover opened; restored on any
// dismiss that is not Apply.
const valueOnOpen = ref<number | null>(null);
const wasApplied = ref(false);
// The revert can reach the close through two paths — the Cancel
// button and the popover's own close event — and must fire once.
const revertEmitted = ref(false);

const displayDay = computed(() =>
  props.value == null ? '' : toCalendarDay(props.value),
);

function revertIfNeeded(): void {
  if (!wasApplied.value && !revertEmitted.value) {
    revertEmitted.value = true;
    emit('change', valueOnOpen.value);
  }
}

function onOpenChange(isOpen: boolean): void {
  popoverOpen.value = isOpen;
  if (isOpen) {
    valueOnOpen.value = props.value ?? null;
    wasApplied.value = false;
    revertEmitted.value = false;
    panelDay.value = props.value == null ? dayjs() : dayjs(props.value);
  } else {
    revertIfNeeded();
  }
}

function onSelectDay(day: Dayjs): void {
  panelDay.value = day;
  emit('change', fromCalendarValue(day.format('YYYY-MM-DD'), props.boundary));
}

function onPanelChange(day: Dayjs | string): void {
  panelDay.value = dayjs(day);
}

function onToday(): void {
  onSelectDay(dayjs());
}

function onApply(): void {
  wasApplied.value = true;
  popoverOpen.value = false;
}

function onCancel(): void {
  revertIfNeeded();
  popoverOpen.value = false;
}
</script>

<template>
  <div class="announcement-date-field">
    <label class="announcement-date-field__label" :for="id">{{ label }} *</label>
    <Popover
      trigger="click"
      :open="popoverOpen"
      placement="bottomLeft"
      @open-change="onOpenChange"
    >
      <Input
        :id="id"
        :value="displayDay"
        :data-testid="id"
        :aria-label="label"
        :status="error ? 'error' : undefined"
        readonly
      >
        <template #suffix>
          <CalendarOutlined />
        </template>
      </Input>
      <template #content>
        <div class="announcement-date-field__popover">
          <Calendar :value="panelDay" :fullscreen="false" @select="onSelectDay" @panel-change="onPanelChange" />
          <div class="announcement-date-field__footer">
            <Button size="small" @click="onToday">{{ t('label.today') }}</Button>
            <span class="announcement-date-field__spacer" />
            <Button size="small" @click="onCancel">{{ t('label.cancel') }}</Button>
            <Button size="small" type="primary" @click="onApply">{{ t('label.apply') }}</Button>
          </div>
        </div>
      </template>
    </Popover>
    <p v-if="error" class="announcement-date-field__error" :data-testid="`${id}-error`">
      {{ error }}
    </p>
  </div>
</template>

<style scoped>
.announcement-date-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
  flex: 1;
}

.announcement-date-field__label {
  font-weight: 500;
}

.announcement-date-field__error {
  color: var(--sm-color-error);
  margin: 0;
}

.announcement-date-field__popover {
  width: 300px;
}

.announcement-date-field__footer {
  display: flex;
  gap: 8px;
  padding-top: 8px;
  border-top: 1px solid var(--sm-border-secondary);
}

.announcement-date-field__spacer {
  flex: 1;
}
</style>
