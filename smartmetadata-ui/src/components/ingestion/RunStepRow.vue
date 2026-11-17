<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { BulbOutlined, CopyOutlined, ExclamationCircleOutlined, RightOutlined } from '@ant-design/icons-vue';
import { message } from 'ant-design-vue';
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';
import type { RunStep } from '@/ingestion/agentsDataMapper';
import { fmtNum, RUN_META } from '@/ingestion/agentsUtils';
import RunGlyph from './RunGlyph.vue';

export type { RunAttention, RunStep } from '@/ingestion/agentsDataMapper';

/**
 * One step of a run, ported from official
 * components/ServiceAgents/components/RunStepRow.component.tsx (pin
 * a3012259ca), including its AttentionCard: the first failure only,
 * copy copies the stack trace alone, and the raw-log section toggles
 * the stack-trace lines. The secondary line lists only nonzero
 * filtered/updated/warnings counts, joined with middots.
 */
const props = defineProps<{
  step: RunStep;
  isLast: boolean;
}>();

const { t } = useI18n();
const showLog = ref(false);
const copied = ref(false);
let copyTimer: ReturnType<typeof setTimeout> | undefined;

function secondaryParts(): string[] {
  const parts: string[] = [];
  if (props.step.filtered) {
    parts.push(`${fmtNum(props.step.filtered)} ${t('serviceDetail.drawer.filteredLowercase')}`);
  }
  if (props.step.updated) {
    parts.push(`${fmtNum(props.step.updated)} ${t('serviceDetail.drawer.updatedLowercase')}`);
  }
  if (props.step.warnings) {
    parts.push(`${props.step.warnings} ${t('serviceDetail.drawer.warningsLowercase')}`);
  }
  return parts;
}

async function copyStackTrace(): Promise<void> {
  const stackTrace = props.step.attention?.stackTrace ?? '';
  // The clipboard API is absent on insecure origins and can reject
  // when permission is denied: either way the button must not flip
  // to Copied for text that never reached the clipboard.
  if (!navigator.clipboard) {
    message.error(t('serviceDetail.drawer.copyFailed'));
    return;
  }
  try {
    await navigator.clipboard.writeText(stackTrace);
  } catch {
    message.error(t('serviceDetail.drawer.copyFailed'));
    return;
  }
  copied.value = true;
  if (copyTimer !== undefined) {
    clearTimeout(copyTimer);
  }
  copyTimer = setTimeout(() => {
    copied.value = false;
  }, 2000);
}

function stackLines(): string[] {
  const stackTrace = props.step.attention?.stackTrace;
  return stackTrace ? stackTrace.split('\n') : [];
}
</script>

<template>
  <div class="run-step-row" :class="{ 'run-step-row--last': isLast }">
    <div class="run-step-row__main">
      <RunGlyph :size="18" :status="step.status" />
      <div class="run-step-row__name-block">
        <div class="run-step-row__name">{{ step.name }}</div>
        <div v-if="secondaryParts().length > 0" class="run-step-row__secondary">
          {{ secondaryParts().join(' · ') }}
        </div>
      </div>
      <span v-if="step.status === 'skipped'" class="run-step-row__did-not-run">
        {{ t(RUN_META.skipped.labelKey) }}
      </span>
      <div v-else class="run-step-row__records">
        <div class="run-step-row__records-value">{{ fmtNum(step.records) }}</div>
        <div class="run-step-row__records-label">{{ t('serviceDetail.drawer.records') }}</div>
      </div>
      <span v-if="step.errors > 0" class="run-step-row__errors-badge">
        {{ step.errors }} {{ t('serviceDetail.drawer.errorsLowercase') }}
      </span>
    </div>
    <div v-if="step.attention" class="run-step-row__attention" :class="`run-step-row__attention--${step.attention.severity}`">
      <div class="run-step-row__attention-header">
        <ExclamationCircleOutlined class="run-step-row__attention-icon" />
        <span class="run-step-row__attention-title">{{ step.attention.title }}</span>
        <span class="run-step-row__attention-severity">
          {{
            step.attention.severity === 'error'
              ? t('serviceDetail.drawer.errorLabel')
              : t('serviceDetail.drawer.warningLabel')
          }}
        </span>
        <span class="run-step-row__attention-spacer" />
        <button
          v-if="stackLines().length > 0"
          class="run-step-row__copy"
          type="button"
          @click="copyStackTrace"
        >
          <CopyOutlined />
          {{ copied ? t('serviceDetail.drawer.copied') : t('serviceDetail.drawer.copy') }}
        </button>
      </div>
      <div class="run-step-row__attention-body">
        <div class="run-step-row__attention-message">{{ step.attention.message }}</div>
        <div v-if="step.attention.hint" class="run-step-row__hint">
          <BulbOutlined class="run-step-row__hint-icon" />
          <span>
            <strong>{{ t('serviceDetail.drawer.howToFix') }} &middot; </strong>{{ step.attention.hint }}
          </span>
        </div>
        <template v-if="stackLines().length > 0">
          <button class="run-step-row__raw-log-toggle" type="button" @click="showLog = !showLog">
            <RightOutlined :class="{ 'run-step-row__raw-log-chevron--open': showLog }" />
            {{
              showLog ? t('serviceDetail.drawer.hideRawLogs') : t('serviceDetail.drawer.showRawLogs')
            }}
          </button>
          <div v-if="showLog" class="run-step-row__raw-log">
            <div
              v-for="(line, index) in stackLines()"
              :key="index"
              class="run-step-row__raw-log-line"
              :class="{ 'run-step-row__raw-log-line--error': line.includes('ERROR') }"
            >
              {{ line }}
            </div>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>

<style scoped>
.run-step-row {
  padding: 14px 0;
  border-bottom: 1px solid var(--sm-border-secondary);
}

.run-step-row--last {
  border-bottom: none;
}

.run-step-row__main {
  display: flex;
  align-items: center;
  gap: 12px;
}

.run-step-row__name-block {
  flex: 1;
  min-width: 0;
}

.run-step-row__name {
  font-size: 14px;
  font-weight: 600;
  line-height: 1;
}

.run-step-row__secondary {
  margin-top: 1px;
  font-size: 12px;
  color: var(--sm-text-quaternary);
}

.run-step-row__did-not-run {
  font-size: 12px;
  font-weight: 500;
  color: var(--sm-text-quaternary);
}

.run-step-row__records {
  text-align: right;
}

.run-step-row__records-value {
  font-size: 16px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  line-height: 1;
}

.run-step-row__records-label {
  font-size: 12px;
  color: var(--sm-text-tertiary);
}

.run-step-row__errors-badge {
  margin-left: 4px;
  padding: 2px 8px;
  border-radius: var(--sm-radius-full, 999px);
  background: var(--sm-color-error-bg);
  color: var(--sm-color-error);
  font-size: 12px;
  font-weight: 600;
}

.run-step-row__attention {
  margin-top: 12px;
  overflow: hidden;
  border: 1px solid var(--sm-color-error);
  border-radius: 12px;
  background: var(--sm-color-error-bg);
}

.run-step-row__attention--warning {
  border-color: var(--sm-color-warning);
  background: var(--sm-color-warning-bg);
}

.run-step-row__attention-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  border-bottom: 1px solid var(--sm-color-error);
}

.run-step-row__attention--warning .run-step-row__attention-header {
  border-bottom-color: var(--sm-color-warning);
}

.run-step-row__attention-icon {
  color: var(--sm-color-error);
}

.run-step-row__attention--warning .run-step-row__attention-icon {
  color: var(--sm-color-warning);
}

.run-step-row__attention-title {
  font-size: 12px;
  font-weight: 600;
}

.run-step-row__attention-severity {
  margin-left: 2px;
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--sm-color-error);
}

.run-step-row__attention--warning .run-step-row__attention-severity {
  color: var(--sm-color-warning);
}

.run-step-row__attention-spacer {
  flex: 1;
}

.run-step-row__copy {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 0;
  border: none;
  background: transparent;
  color: var(--sm-text-tertiary);
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
}

.run-step-row__attention-body {
  padding: 12px;
}

.run-step-row__attention-message {
  font-family: var(--sm-font-mono, monospace);
  font-size: 12px;
  line-height: 1.6;
  overflow-wrap: break-word;
  color: var(--sm-text-secondary);
}

.run-step-row__hint {
  display: flex;
  gap: 8px;
  margin-top: 10px;
  padding: 8px 12px;
  border: 1px solid var(--sm-border-secondary);
  border-radius: 8px;
  background: var(--sm-bg-base);
  font-size: 12px;
  line-height: 1.5;
  color: var(--sm-text-secondary);
}

.run-step-row__hint-icon {
  flex-shrink: 0;
  margin-top: 1px;
  color: var(--sm-brand);
}

.run-step-row__raw-log-toggle {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin-top: 10px;
  padding: 0;
  border: none;
  background: transparent;
  color: var(--sm-brand);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}

.run-step-row__raw-log-toggle :deep(.anticon) {
  transition: transform 0.2s;
}

.run-step-row__raw-log-chevron--open {
  transform: rotate(90deg);
}

.run-step-row__raw-log {
  max-height: 160px;
  overflow-y: auto;
  margin-top: 8px;
  padding: 10px 12px;
  border-radius: 8px;
  background: var(--sm-bg-elevated);
  border: 1px solid var(--sm-border-color);
}

.run-step-row__raw-log-line {
  font-family: var(--sm-font-mono, monospace);
  font-size: 12px;
  line-height: 1.6;
  white-space: pre-wrap;
  color: var(--sm-text-secondary);
}

.run-step-row__raw-log-line--error {
  color: var(--sm-color-error-text);
}
</style>
