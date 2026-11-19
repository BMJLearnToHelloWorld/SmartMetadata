<!--
  Copyright 2026 SmartMetadata authors.

  Licensed under the Apache License, Version 2.0 (the "License");
  you may not use this file except in compliance with the License.
  You may obtain a copy of the License at

      http://www.apache.org/licenses/LICENSE-2.0
-->
<!--
  SmCodeEditor — one component + `variant` carrying both official editors
  (SchemaEditor.tsx / CodeEditor.tsx, pin a3012259ca). The two differ only
  in defaults and shell; the hook is shared (useCodeMirrorEditor.ts).

  Variant asymmetry, verbatim from official (do not "fix"):
  - `title` is declared for both variants but rendered only in `code`
    (SchemaEditor declares it at :53 and never renders it).
  - `copyButtonClassName` is applied only in the `schema` variant
    (CodeEditor never reads it).
  - `autoFormat` is fixed to `true` in the `code` variant (CodeEditor
    hardcodes it, :65-66); a passed value is ignored there.
  - `data-testid="code-mirror-container"` is a hardcoded fixed value in
    both variants, not a prop (t367 anchor correction).
  - `onFocus` (interface :52) is forwarded by both official components
    only when provided; here it surfaces as the `focus` event, emitted
    from the editor's focus-change signal only.
-->
<script setup lang="ts">
import type { Extension } from '@codemirror/state';
import { CopyOutlined } from '@ant-design/icons-vue';
import { Button, Card, Tooltip } from 'ant-design-vue';
import { computed, onBeforeUnmount, onMounted, ref, useTemplateRef } from 'vue';
import { useI18n } from 'vue-i18n';
import {
  CODE_DEFAULT_OPTIONS,
  COPY_RESET_TIMEOUT_MS,
  CSMode,
  SCHEMA_DEFAULT_OPTIONS,
  copyTextToClipboard,
  type CodeMirrorOptions,
  type Mode,
} from '@/utils/codeMirrorUtils';
import { useCodeMirrorEditor } from './useCodeMirrorEditor';

export interface SmCodeEditorProps {
  variant?: 'schema' | 'code';
  value?: string | object;
  autoFormat?: boolean;
  mode?: Mode;
  options?: CodeMirrorOptions;
  readOnly?: boolean;
  extensions?: Extension[];
  className?: string;
  editorClass?: string;
  showCopyButton?: boolean;
  copyButtonClassName?: string;
  title?: string;
}

const props = withDefaults(defineProps<SmCodeEditorProps>(), {
  variant: 'schema',
  value: '',
  autoFormat: undefined,
  mode: () => ({ name: CSMode.JAVASCRIPT, json: true }),
  options: undefined,
  readOnly: undefined,
  extensions: undefined,
  className: '',
  editorClass: undefined,
  showCopyButton: true,
  copyButtonClassName: undefined,
  title: undefined,
});

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void;
  (e: 'change', value: string): void;
  (e: 'focus'): void;
}>();

const { t } = useI18n();

const defaultOptions = computed(() =>
  props.variant === 'code' ? CODE_DEFAULT_OPTIONS : SCHEMA_DEFAULT_OPTIONS,
);
// CodeEditor has always formatted its value; it has no autoFormat prop.
const effectiveAutoFormat = computed(() =>
  props.variant === 'code' ? true : (props.autoFormat ?? true),
);

const editorHost = useTemplateRef<HTMLElement>('editorHost');

const { internalValue, mount, getView } = useCodeMirrorEditor({
  value: () => props.value,
  autoFormat: () => effectiveAutoFormat.value,
  mode: () => props.mode,
  defaultOptions: () => defaultOptions.value,
  options: () => props.options,
  readOnly: () => props.readOnly,
  extensions: () => props.extensions,
  onChange: (value) => {
    emit('update:modelValue', value);
    emit('change', value);
  },
  onFocus: () => emit('focus'),
});

onMounted(() => {
  if (editorHost.value) {
    mount(editorHost.value);
  }
});

const hasCopied = ref(false);
let resetTimer: ReturnType<typeof setTimeout> | null = null;

async function handleCopy() {
  const success = await copyTextToClipboard(internalValue.value);
  if (success) {
    hasCopied.value = true;
    if (resetTimer) {
      clearTimeout(resetTimer);
    }
    resetTimer = setTimeout(() => {
      hasCopied.value = false;
    }, COPY_RESET_TIMEOUT_MS);
  } else {
    hasCopied.value = false;
  }
}

onBeforeUnmount(() => {
  if (resetTimer) {
    clearTimeout(resetTimer);
  }
});

const copyTooltip = computed(() =>
  hasCopied.value ? t('label.copied') : t('message.copy-to-clipboard'),
);

// Mirrors official's editorRef exposure (hook returns editorRef; parents
// reach `view` through it): programmatic access to the underlying view.
defineExpose({
  getEditorView: () => getView(),
  focus: () => getView()?.focus(),
});
</script>

<template>
  <div
    v-if="variant === 'schema'"
    class="sm-code-editor schema-editor-container relative"
    :class="className"
    data-testid="code-mirror-container"
  >
    <div v-if="showCopyButton" class="query-editor-button" :class="copyButtonClassName">
      <Tooltip :title="copyTooltip">
        <Button
          data-testid="query-copy-button"
          type="text"
          size="small"
          :aria-label="t('message.copy-to-clipboard')"
          @click="handleCopy"
        >
          <template #icon><CopyOutlined /></template>
        </Button>
      </Tooltip>
    </div>
    <div ref="editorHost" :class="editorClass" />
  </div>
  <Card
    v-else
    class="sm-code-editor code-editor-new-style"
    :class="className"
    :bordered="true"
    :body-style="{ padding: 0 }"
    data-testid="code-mirror-container"
  >
    <div v-if="title || showCopyButton" class="sm-code-editor-title-row">
      <div class="sm-code-editor-title">{{ title }}</div>
      <div v-if="showCopyButton" class="sm-code-editor-copy" data-testid="copy-button-container">
        <Tooltip :title="copyTooltip">
          <Button
            data-testid="query-copy-button"
            type="text"
            size="small"
            :aria-label="t('message.copy-to-clipboard')"
            @click="handleCopy"
          >
            <template #icon><CopyOutlined /></template>
          </Button>
        </Tooltip>
      </div>
    </div>
    <div class="sm-code-editor-body">
      <div ref="editorHost" :class="editorClass" />
    </div>
  </Card>
</template>

<style>
/*
 * CodeMirror 6 has no stylesheet: the editor surface, token hues and the
 * 300px default height all live here, ported from official
 * `styles/components/code-mirror.less` and `schema-editor.less`.
 * Framework adaptations (selectors only): the product keys dark mode off
 * `:root[data-theme='dark']` (official: `.dark-mode` class), and brand /
 * surface colors come from the product `--sm-*` tokens.
 */
.sm-code-editor .cm-editor {
  height: 300px;
  --cm-token-keyword: #708;
  --cm-token-def: #00c;
  --cm-token-property: #05a;
  --cm-token-number: #164;
  --cm-token-string: #a11;
  --cm-token-type: #085;
  --cm-token-operator: var(--sm-text-secondary);
  --cm-token-comment: #940;
  --cm-token-error: var(--sm-color-error);
}
.sm-code-editor .cm-editor .cm-scroller {
  overflow: auto;
}
.sm-code-editor .cm-editor ::selection {
  background: transparent;
  color: var(--sm-text-primary);
}
.sm-code-editor .cm-editor.cm-focused {
  outline: 1px solid var(--sm-brand);
}
.sm-code-editor .cm-editor .cm-line {
  padding-right: var(--sm-space-100, 4px);
}
.sm-code-editor.schema-editor-container {
  position: relative;
}
.sm-code-editor.schema-editor-container .query-editor-button {
  position: absolute;
  z-index: 10;
  top: 14px;
  right: 14px;
}
.sm-code-editor.code-editor-new-style .cm-gutters {
  display: none;
}
.sm-code-editor-title-row {
  display: flex;
  align-items: center;
  min-height: 28px;
  border-bottom: 1px solid var(--sm-border-color);
  background: var(--sm-bg-container);
  padding: 0 24px;
  font-size: 16px;
  font-weight: 500;
  line-height: 1.5715;
  color: var(--sm-text-primary);
}
.sm-code-editor-title {
  display: inline-block;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.sm-code-editor-copy {
  margin-left: auto;
  font-size: 14px;
  font-weight: 400;
  line-height: 1.5715;
}
.sm-code-editor-body {
  padding: 20px;
}

:root[data-theme='dark'] .sm-code-editor .cm-editor {
  background: var(--sm-bg-container, #22262f);
  color: var(--sm-text-primary, #eef0f4);
  --cm-token-keyword: #bdb4fe;
  --cm-token-def: #53b1fd;
  --cm-token-property: #84caff;
  --cm-token-number: #feb273;
  --cm-token-string: #73e2a3;
  --cm-token-type: #47cd89;
  --cm-token-operator: var(--sm-text-secondary, #cecfd2);
  --cm-token-comment: var(--sm-text-tertiary, #a8aeb9);
  --cm-token-error: #f97066;
}
:root[data-theme='dark'] .sm-code-editor .cm-gutters {
  background-color: var(--sm-bg-base, #16181d);
  border-right-color: var(--sm-border-color, #333741);
  color: var(--sm-text-tertiary, #a8aeb9);
}
:root[data-theme='dark'] .sm-code-editor .cm-cursor,
:root[data-theme='dark'] .sm-code-editor .cm-dropCursor {
  border-left-color: var(--sm-text-primary, #eef0f4);
}
:root[data-theme='dark'] .sm-code-editor .cm-editor .cm-selectionLayer .cm-selectionBackground,
:root[data-theme='dark']
  .sm-code-editor
  .cm-editor.cm-focused
  > .cm-scroller
  > .cm-selectionLayer
  .cm-selectionBackground {
  background: #3e4456;
}
:root[data-theme='dark'] .sm-code-editor .cm-activeLine,
:root[data-theme='dark'] .sm-code-editor .cm-activeLineGutter {
  background: var(--sm-bg-elevated, #1f242f);
}
</style>
