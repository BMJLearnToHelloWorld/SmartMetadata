<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
  Official Test Library quick filter (entity type / test platform):
  searchable single-select list with 更新 / 关闭 footer.
-->
<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { Button, Dropdown, Input, Radio } from 'ant-design-vue';
import { DownOutlined } from '@ant-design/icons-vue';
import { useI18n } from 'vue-i18n';
import { filterOptionsByQuery } from '@/quality/testLibrary';

const props = defineProps<{
  label: string;
  searchPlaceholder: string;
  options: Array<{ key: string; label: string }>;
  modelValue?: string;
  testId: string;
}>();

const emit = defineEmits<{ 'update:modelValue': [value: string | undefined] }>();

const { t } = useI18n();
const open = ref(false);
const query = ref('');
const draft = ref<string | undefined>(props.modelValue);

watch(
  () => props.modelValue,
  (value) => {
    draft.value = value;
  },
);

watch(open, (visible) => {
  if (visible) {
    draft.value = props.modelValue;
    query.value = '';
  }
});

const visibleOptions = computed(() => filterOptionsByQuery(props.options, query.value));

function apply(): void {
  emit('update:modelValue', draft.value || undefined);
  open.value = false;
}

function close(): void {
  open.value = false;
}
</script>

<template>
  <Dropdown v-model:open="open" :trigger="['click']">
    <Button :data-testid="testId">
      {{ label }}
      <DownOutlined />
    </Button>
    <template #overlay>
      <div class="tl-filter" :data-testid="`${testId}-panel`" @click.stop>
        <Input
          v-model:value="query"
          size="small"
          allow-clear
          :placeholder="searchPlaceholder"
          :data-testid="`${testId}-search`"
        />
        <Radio.Group v-model:value="draft" class="tl-filter__list" :data-testid="`${testId}-options`">
          <Radio
            v-for="option in visibleOptions"
            :key="option.key"
            :value="option.key"
            :data-testid="`${testId}-option-${option.key}`"
          >
            {{ option.label }}
          </Radio>
        </Radio.Group>
        <div class="tl-filter__footer">
          <Button type="primary" size="small" :data-testid="`${testId}-update`" @click="apply">
            {{ t('quality.testDefinitions.filterUpdate') }}
          </Button>
          <Button type="link" size="small" :data-testid="`${testId}-close`" @click="close">
            {{ t('quality.testDefinitions.filterClose') }}
          </Button>
        </div>
      </div>
    </template>
  </Dropdown>
</template>

<style scoped>
.tl-filter {
  width: 240px;
  padding: 8px;
  background: #fff;
  border-radius: 8px;
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.08);
}
.tl-filter__list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 220px;
  overflow: auto;
  margin: 8px 0;
}
.tl-filter__footer {
  display: flex;
  align-items: center;
  gap: 8px;
}
</style>
