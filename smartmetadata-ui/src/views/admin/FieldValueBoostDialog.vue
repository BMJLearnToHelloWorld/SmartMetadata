<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
  Port of official FieldValueBoostDialog: field (required, fixed when
  editing), impact slider, modifier, missing value, and the four range
  bounds. The parent owns open state and closes the dialog after the
  save completes; this dialog only reports save/close.
-->
<script setup lang="ts">
import { reactive, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { Button, Form, Input, Modal, Select, Slider, Typography } from 'ant-design-vue';
import type { SearchFieldValueBoost } from '@/types/admin';
import {
  BOOST_STEP,
  MAX_BOOST,
  RANGE_KEYS,
  modifierOptions,
  toFieldValueBoost,
  toFieldValueBoostFormValues,
} from './searchSettingsConstants';

const props = defineProps<{
  boost?: SearchFieldValueBoost;
  fieldOptions: string[];
}>();
const emit = defineEmits<{
  save: [boost: SearchFieldValueBoost];
  close: [];
}>();
const { t } = useI18n();

const form = reactive(toFieldValueBoostFormValues(props.boost));
const saveAttempted = ref(false);

const RANGE_LABEL_KEYS: Record<string, string> = {
  gte: 'settings.searchPrefs.greaterThanOrEqualTo',
  lte: 'settings.searchPrefs.lessThanOrEqualTo',
  gt: 'settings.searchPrefs.greaterThan',
  lt: 'settings.searchPrefs.lessThan',
};

function onFieldSelect(value: unknown): void {
  form.field = typeof value === 'string' ? value : null;
}

function onModifierSelect(value: unknown): void {
  form.modifier = typeof value === 'string' ? value : null;
}

function onFactorChange(value: unknown): void {
  const numeric =
    typeof value === 'number' ? value : Array.isArray(value) ? value[0] : undefined;
  if (typeof numeric === 'number') {
    form.factor = numeric;
  }
}

function handleSave(): void {
  saveAttempted.value = true;
  if (!form.field) {
    return;
  }
  emit('save', toFieldValueBoost({ ...form }));
}
</script>

<template>
  <Modal
    :open="true"
    :width="600"
    :title="
      boost
        ? t('settings.searchPrefs.editFieldValueBoost')
        : t('settings.searchPrefs.addFieldValueBoost')
    "
    @cancel="emit('close')"
  >
    <div data-testid="field-value-boost-dialog">
      <Form layout="vertical">
        <Form.Item
          :label="t('settings.searchPrefs.field')"
          required
          :validate-status="saveAttempted && !form.field ? 'error' : ''"
          :help="saveAttempted && !form.field ? t('settings.searchPrefs.fieldRequired') : ''"
        >
          <Select
            :value="form.field ?? undefined"
            :options="fieldOptions.map((option) => ({ value: option, label: option }))"
            :disabled="Boolean(boost)"
            :placeholder="t('settings.searchPrefs.selectField')"
            data-testid="field-select"
            @update:value="onFieldSelect"
          />
        </Form.Item>
        <Form.Item :label="t('settings.searchPrefs.impact')">
          <div class="field-value-boost-dialog__slider-row">
            <Typography.Text type="secondary">
              {{ t('settings.searchPrefs.impact') }}
            </Typography.Text>
            <Typography.Text strong data-testid="field-boost-value">
              {{ form.factor }}
            </Typography.Text>
          </div>
          <Slider
            :value="form.factor"
            :aria-label="t('settings.searchPrefs.impact')"
            :min="0"
            :max="MAX_BOOST"
            :step="BOOST_STEP"
            data-testid="field-boost-slider"
            @update:value="onFactorChange"
          />
        </Form.Item>
        <div class="field-value-boost-dialog__grid">
          <Form.Item :label="t('settings.searchPrefs.modifier')">
            <Select
              :value="form.modifier ?? undefined"
              :options="modifierOptions"
              data-testid="modifier-select"
              @update:value="onModifierSelect"
            />
          </Form.Item>
          <Form.Item :label="t('settings.searchPrefs.missingValue')">
            <Input
              :value="form.missing"
              data-testid="missing-value-input"
              @update:value="form.missing = $event"
            />
          </Form.Item>
        </div>
        <Typography.Text strong>
          {{ t('settings.searchPrefs.rangeCondition') }}
        </Typography.Text>
        <div class="field-value-boost-dialog__grid">
          <Form.Item
            v-for="key in RANGE_KEYS"
            :key="key"
            :label="t(RANGE_LABEL_KEYS[key])"
          >
            <Input
              :value="form[key]"
              :data-testid="`${key}-input`"
              @update:value="form[key] = $event"
            />
          </Form.Item>
        </div>
      </Form>
    </div>
    <template #footer>
      <div class="field-value-boost-dialog__footer">
        <Button @click="emit('close')">
          {{ t('settings.searchPrefs.cancel') }}
        </Button>
        <Button
          type="primary"
          data-testid="save-field-value-boost"
          @click="handleSave"
        >
          {{ t('settings.searchPrefs.save') }}
        </Button>
      </div>
    </template>
  </Modal>
</template>

<style scoped>
.field-value-boost-dialog__slider-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.field-value-boost-dialog__grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}

.field-value-boost-dialog__footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}
</style>
