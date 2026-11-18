<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
  Port of official TermBoostCard: pick a tag (fixed once saved) and its
  boost. Every change is reported up; the caller decides when a boost
  is complete enough to keep.
-->
<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { DeleteOutlined } from '@ant-design/icons-vue';
import { Button, Card, Select, Slider, Typography, message } from 'ant-design-vue';
import { searchAssets } from '@/api/search';
import type { SearchTermBoost } from '@/types/admin';
import {
  BOOST_STEP,
  MAX_BOOST,
  TAG_SEARCH_DEBOUNCE_MS,
  TAG_SEARCH_PAGE_SIZE,
  getTermBoostField,
  getTermBoostTagQuery,
} from './searchSettingsConstants';

const props = defineProps<{ termBoost?: SearchTermBoost }>();
const emit = defineEmits<{
  change: [termBoost: SearchTermBoost];
  delete: [value: string];
}>();
const { t } = useI18n();

const isExisting = computed(() => Boolean(props.termBoost?.value));
const draft = reactive<SearchTermBoost>(
  props.termBoost
    ? { ...props.termBoost }
    : { field: '', value: '', boost: 0 },
);
const options = ref<{ value: string; label: string }[]>([]);

watch(
  () => props.termBoost,
  (termBoost) => {
    if (termBoost?.value) {
      Object.assign(draft, termBoost);
    }
  },
);

async function fetchTags(searchText: string): Promise<void> {
  try {
    const { query, queryFilter } = getTermBoostTagQuery(searchText);
    const page = await searchAssets(query, 0, TAG_SEARCH_PAGE_SIZE, {
      index: 'tag',
      query_filter: queryFilter,
    });
    options.value = page.hits.map((hit) => ({
      value: hit.fullyQualifiedName,
      label: hit.fullyQualifiedName,
    }));
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('settings.searchPrefs.loadFailed'));
  }
}

let searchTimer: ReturnType<typeof setTimeout> | undefined;
function debouncedFetch(searchText: string): void {
  if (searchTimer !== undefined) {
    clearTimeout(searchTimer);
  }
  searchTimer = setTimeout(() => {
    void fetchTags(searchText);
  }, TAG_SEARCH_DEBOUNCE_MS);
}

onMounted(() => {
  if (!isExisting.value) {
    void fetchTags('');
  }
});
onBeforeUnmount(() => {
  if (searchTimer !== undefined) {
    clearTimeout(searchTimer);
  }
});

const selectOptions = computed(() => {
  if (draft.value && !options.value.some((option) => option.value === draft.value)) {
    return [...options.value, { value: draft.value, label: draft.value }];
  }
  return options.value;
});

function update(next: SearchTermBoost): void {
  Object.assign(draft, next);
  emit('change', { ...draft });
}

function onSelect(value: unknown): void {
  if (typeof value !== 'string' || !value) {
    update({ ...draft, field: '', value: '' });
    return;
  }
  update({ ...draft, field: getTermBoostField(value), value });
}

function onBoostChange(value: unknown): void {
  const numeric =
    typeof value === 'number' ? value : Array.isArray(value) ? value[0] : undefined;
  if (typeof numeric !== 'number') {
    return;
  }
  update({ ...draft, boost: numeric });
}
</script>

<template>
  <Card
    size="small"
    class="term-boost-card"
    :data-testid="`term-boost-${draft.value || 'new'}`"
  >
    <div class="term-boost-card__body">
      <Select
        :value="draft.value || undefined"
        :options="selectOptions"
        :disabled="isExisting"
        :placeholder="t('settings.searchPrefs.selectTag')"
        :aria-label="t('settings.searchPrefs.selectTag')"
        show-search
        :filter-option="false"
        allow-clear
        data-testid="term-boost-select"
        @search="debouncedFetch"
        @update:value="onSelect"
      />
      <div class="term-boost-card__boost">
        <div class="term-boost-card__boost-row">
          <Typography.Text type="secondary">
            {{ t('settings.searchPrefs.boost') }}
          </Typography.Text>
          <Typography.Text strong data-testid="term-boost-value">
            {{ draft.boost }}
          </Typography.Text>
        </div>
        <Slider
          :value="draft.boost ?? 0"
          :aria-label="t('settings.searchPrefs.boost')"
          :min="0"
          :max="MAX_BOOST"
          :step="BOOST_STEP"
          data-testid="term-boost-slider"
          @update:value="onBoostChange"
        />
      </div>
      <Button
        type="text"
        size="small"
        class="term-boost-card__delete"
        data-testid="delete-term-boost"
        :aria-label="t('settings.searchPrefs.delete')"
        @click="emit('delete', draft.value ?? '')"
      >
        <DeleteOutlined />
      </Button>
    </div>
  </Card>
</template>

<style scoped>
.term-boost-card {
  width: 256px;
}

.term-boost-card__body {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.term-boost-card__boost-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.term-boost-card__delete {
  align-self: flex-end;
}
</style>
