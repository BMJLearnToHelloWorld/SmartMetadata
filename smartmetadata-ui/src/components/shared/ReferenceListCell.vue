<!--
Copyright 2026 SmartMetadata authors.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0
-->
<script setup lang="ts">
import { Button, Popover, Tooltip } from 'ant-design-vue';
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { RouterLink, type RouteLocationRaw } from 'vue-router';
import { getEntityName } from '@/components/shared/profilePictureUtils';
import {
  EMPTY_REFERENCE_LIST_TEXT,
  splitReferenceList,
  type ColumnEntityReference,
} from '@/utils/columns';

/**
 * Reference-list cell (PAT-COLUMNS COL-3/COL-4): the first `LIST_CAP`
 * references inline, the remainder behind a `+N more` popover, with
 * the same permission branch in both places — a link when the viewer
 * may view the referenced entity, plain text with a
 * `message.no-permission-to-view` tooltip otherwise. An empty list
 * renders `'-- '`. The `+N more` wording is the official literal
 * (official does not translate `more`). Link targets come from the
 * caller's `PAT-FQN` path constructor via `pathFor`.
 */
const props = defineProps<{
  references?: readonly ColumnEntityReference[] | null;
  hasViewPermission: boolean;
  pathFor: (ref: ColumnEntityReference) => RouteLocationRaw;
  testId?: string;
}>();

const { t } = useI18n();
const split = computed(() => splitReferenceList(props.references));

function refKey(ref: ColumnEntityReference, index: number): string {
  return ref.fullyQualifiedName || ref.name || `ref-${index}`;
}
</script>

<template>
  <span v-if="split.isEmpty">{{ EMPTY_REFERENCE_LIST_TEXT }}</span>
  <div v-else class="reference-list-cell" :data-testid="testId ?? undefined">
    <template v-for="(ref, index) in split.visible" :key="refKey(ref, index)">
      <RouterLink v-if="hasViewPermission" :to="pathFor(ref)">
        {{ getEntityName(ref) }}
      </RouterLink>
      <Tooltip v-else :title="t('message.no-permission-to-view')">
        <span>{{ getEntityName(ref) }}</span>
      </Tooltip>
    </template>
    <Popover v-if="split.hasMore" placement="bottom" trigger="click">
      <template #content>
        <div class="reference-list-cell reference-list-cell__popover">
          <template v-for="(ref, index) in split.overflow" :key="refKey(ref, index)">
            <RouterLink v-if="hasViewPermission" :to="pathFor(ref)">
              {{ getEntityName(ref) }}
            </RouterLink>
            <Tooltip v-else :title="t('message.no-permission-to-view')">
              <span>{{ getEntityName(ref) }}</span>
            </Tooltip>
          </template>
        </div>
      </template>
      <Button data-testid="plus-more-count" size="small" type="text">
        {{ `+${split.overflowCount} more` }}
      </Button>
    </Popover>
  </div>
</template>

<style scoped>
.reference-list-cell {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
}
</style>
