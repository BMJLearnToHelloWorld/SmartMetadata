<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { Card } from 'ant-design-vue';
import type { CustomPropertyDef } from '@/types/collaboration';
import VersionDiffText from '@/components/ingestion/VersionDiffText.vue';
import {
  isCustomPropertyValueEmpty,
  summarizeCustomPropertyValue,
} from '@/features/explore/previewCustomProperties';
import { isTextDiffResult, type TextDiffResult } from '@/ingestion/versionDiff';
import CustomPropertyListItem from './CustomPropertyListItem.vue';

/** Official CustomPropertyVersionList: read-only Custom Properties tab of an entity version page. */
const props = withDefaults(
  defineProps<{
    properties: CustomPropertyDef[];
    /** Extension of the version; a changed value holds its word-diff result or markup. */
    extension?: Record<string, unknown>;
    /** Properties that first got a value in this version. */
    addedKeys?: string[];
  }>(),
  { addedKeys: () => [] },
);

const { t } = useI18n();

export type VersionValueKind = 'diff' | 'string' | 'summary' | 'empty';

export interface VersionRowView {
  property: CustomPropertyDef;
  value: unknown;
  kind: VersionValueKind;
  added: boolean;
  text?: string;
  diff?: TextDiffResult;
}

function visibleTextFromMaybeHtml(value: string): string {
  return value.replace(/<[^>]+>/g, '');
}

const rows = computed<VersionRowView[]>(() =>
  props.properties.map((property) => {
    const typeName = property.propertyType;
    const value = props.extension?.[property.name];
    const added = props.addedKeys.includes(property.name);

    // Official: a changed value of any type arrives as a word-diff
    // string (or, in product, a TextDiffResult) and is rendered before
    // the type-aware empty check so a hyperlink diff is not "not set".
    if (isTextDiffResult(value)) {
      return { property, value, kind: 'diff', added, diff: value };
    }
    if (typeof value === 'string' && value) {
      return { property, value, kind: 'string', added, text: visibleTextFromMaybeHtml(value) };
    }
    if (isCustomPropertyValueEmpty(typeName, value)) {
      return { property, value, kind: 'empty', added };
    }
    return {
      property,
      value,
      kind: 'summary',
      added,
      text: summarizeCustomPropertyValue(typeName, value, t),
    };
  }),
);
</script>

<template>
  <Card class="custom-property-version-list" data-testid="custom-properties-card" :bordered="true">
    <ul class="custom-property-version-list__grid" role="list">
      <CustomPropertyListItem
        v-for="row in rows"
        :key="row.property.name"
        :property="row.property"
        :value="row.value"
        :has-edit-permissions="false"
      >
        <template v-if="row.kind !== 'empty'" #value>
          <VersionDiffText v-if="row.kind === 'diff' && row.diff" :diff="row.diff" :class="{ 'diff-added': row.added }" />
          <span
            v-else-if="row.kind === 'string'"
            data-testid="rich-text-previewer"
            :class="{ 'diff-added': row.added }"
          >{{ row.text }}</span>
          <span v-else :class="{ 'diff-added': row.added }">{{ row.text }}</span>
        </template>
      </CustomPropertyListItem>
    </ul>
  </Card>
</template>

<style scoped>
.custom-property-version-list :deep(.ant-card-body) {
  padding: 16px;
}
.custom-property-version-list__grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 12px;
  margin: 0;
  padding: 0;
  list-style: none;
}
@media (min-width: 768px) {
  .custom-property-version-list__grid {
    grid-template-columns: 1fr 1fr;
  }
}
@media (min-width: 1200px) {
  .custom-property-version-list__grid {
    grid-template-columns: 1fr 1fr 1fr;
  }
}
.diff-added {
  text-decoration: underline;
}
</style>
