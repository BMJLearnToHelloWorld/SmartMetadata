<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
/**
 * Pin QueryViewer.component.tsx: read-only SQL card, line-count badge, copy.
 * SmCodeEditor replaces official SchemaEditor (CSMode.SQL, readOnly).
 */
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { Button, Card, Tooltip } from 'ant-design-vue';
import { CopyOutlined } from '@ant-design/icons-vue';
import SmCodeEditor from '@/components/shared/SmCodeEditor.vue';
import { formatLineCount, sqlLineCount } from '@/catalog/queryDisplay';
import { CSMode } from '@/utils/codeMirrorUtils';

const props = defineProps<{
  sqlQuery: string;
  /** Root test id; official QueryViewer has no root id — callers set context. */
  testId?: string;
}>();

const { t } = useI18n();

const hasQuery = computed(() => Boolean(props.sqlQuery?.trim()));
const lineCount = computed(() => sqlLineCount(props.sqlQuery));
const lineLabel = computed(() =>
  formatLineCount(lineCount.value, t('query.line'), t('query.lines')),
);

const editorClass = computed(() =>
  lineCount.value > 4 ? 'sm-sql-query-viewer__editor--tall' : 'sm-sql-query-viewer__editor--short',
);

async function onCopy(): Promise<void> {
  if (!hasQuery.value) {
    return;
  }
  try {
    await navigator.clipboard.writeText(props.sqlQuery);
  } catch {
    // clipboard may be unavailable; official still exposes the control
  }
}
</script>

<template>
  <Card class="sm-sql-query-viewer" :data-testid="testId ?? 'sm-sql-query-viewer'">
    <template v-if="hasQuery" #extra>
      <div class="sm-sql-query-viewer__extra">
        <span class="sm-sql-query-viewer__lines" data-testid="query-line">{{ lineLabel }}</span>
        <Tooltip :title="t('message.copy-to-clipboard')">
          <Button
            type="text"
            size="small"
            data-testid="query-entity-copy-button"
            :aria-label="t('message.copy-to-clipboard')"
            @click="onCopy"
          >
            <template #icon><CopyOutlined /></template>
          </Button>
        </Tooltip>
      </div>
    </template>
    <SmCodeEditor
      v-if="hasQuery"
      variant="schema"
      :mode="{ name: CSMode.SQL }"
      :value="sqlQuery"
      :read-only="true"
      :show-copy-button="false"
      :editor-class="editorClass"
      data-testid="test-case-sql-editor"
    />
  </Card>
</template>

<style scoped>
.sm-sql-query-viewer__extra {
  display: flex;
  align-items: center;
  gap: 8px;
}

.sm-sql-query-viewer__lines {
  font-size: 12px;
  color: var(--sm-color-text-secondary, rgba(0, 0, 0, 0.45));
  padding: 0 8px;
  border-radius: 12px;
  background: var(--sm-color-fill-tertiary, #f0f0f0);
}

:deep(.sm-sql-query-viewer__editor--short .cm-editor) {
  min-height: 120px;
}

:deep(.sm-sql-query-viewer__editor--tall .cm-editor) {
  min-height: 300px;
}
</style>