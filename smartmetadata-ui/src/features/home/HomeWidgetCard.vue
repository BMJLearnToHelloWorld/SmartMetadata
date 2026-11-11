<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed } from 'vue';
import { DeleteOutlined, DownOutlined, HolderOutlined, UpOutlined } from '@ant-design/icons-vue';
import { Button, Card, Skeleton, Tag, Tooltip } from 'ant-design-vue';
import { useI18n } from 'vue-i18n';
import { getMyDataWidgetBaseKey } from './landingPageLayout';
import { getWidgetTone } from './widgetTones';

export interface HomeWidgetStatus {
  label: string;
  /**
   * The tones the stage-B cards actually pass: 'warning' for items that
   * need attention, 'info' for deltas and informational counts,
   * 'default'/'neutral' for plain counts; 'error'/'success'/'muted' as
   * before. statusColor maps each to a real antd Tag colour below.
   */
  tone: 'error' | 'success' | 'muted' | 'warning' | 'info' | 'default' | 'neutral';
}

export interface HomeWidgetEmptyState {
  title: string;
  description?: string;
  actionLabel?: string;
  /** Rule phrase shown above the title (CuratedAssets: the rule being waited on). */
  summary?: string;
}

const props = withDefaults(
  defineProps<{
    title: string;
    testId?: string;
    /**
     * Official TopicCard states, extended once for all eight stage-B
     * cards (REVIEW-W2-G11-BC condition 6): loading skeleton, error
     * with retry, status chip, summary row, empty state. Stage-A
     * cards pass none of these and render exactly as before.
     */
    isLoading?: boolean;
    isError?: boolean;
    status?: HomeWidgetStatus;
    summary?: string;
    meta?: string;
    emptyState?: HomeWidgetEmptyState;
    /**
     * Stage D (G-11) edit-view variant, per the official TopicCardControls:
     * the drag handle (pointer-only, not focusable) and the remove button,
     * on the right of the header. The editor passes these through the
     * widget as undeclared props — they fall through to this card, the
     * widget's root — so no widget has to forward them explicitly.
     */
    editView?: boolean;
    /**
     * Stage D collapse (official TopicWidget header strip): when true the
     * title area + chevron toggle the collapsed state, which hides the
     * body. The chevron lives in the header strip itself, NOT in the
     * edit-view control group above. Collapse is display-only — the
     * state is derived in `useTopicsView` and never written back.
     */
    collapsible?: boolean;
    collapsed?: boolean;
    /**
     * The widget key, for the edit-view test-ids (`drag-widget-{key}`,
     * `remove-widget-{key}`). Widgets that carry it pass it explicitly;
     * otherwise it is derived from the card test-id, which encodes the
     * key for every self-fetching widget (`home-widget-<key>`).
     */
    widgetKey?: string;
  }>(),
  {
    testId: 'home-widget',
    isLoading: false,
    isError: false,
    editView: false,
    collapsible: false,
    collapsed: false,
  },
);

const emit = defineEmits<{
  (event: 'retry'): void;
  (event: 'empty-action'): void;
  (event: 'remove'): void;
  (event: 'toggle-collapse'): void;
}>();

const { t } = useI18n();

/** The widget key for the edit-view test-ids. */
const dragKey = computed(() => {
  if (props.widgetKey) {
    return props.widgetKey;
  }
  return props.testId.startsWith('home-widget-')
    ? props.testId.slice('home-widget-'.length)
    : props.testId;
});

/**
 * The header tone tile (icon + tint) for this widget, from the
 * official per-widget TONE table (widgetTones.ts). Unknown keys —
 * the editor's stub cards — render without a tile.
 * ADR:2026-11-11-home-style-compaction-and-tokens
 */
const tone = computed(() => getWidgetTone(getMyDataWidgetBaseKey(dragKey.value)));

function toggleCollapse(): void {
  if (props.collapsible) {
    emit('toggle-collapse');
  }
}

function statusColor(tone: HomeWidgetStatus['tone']): string {
  switch (tone) {
    case 'error':
      return 'error';
    case 'success':
      return 'success';
    case 'warning':
      return 'warning';
    case 'info':
      return 'processing';
    default:
      return 'default';
  }
}
</script>

<template>
  <Card :data-testid="testId" class="home-widget-card" :bordered="true">
    <template #title>
      <!-- Official TopicCardHeader: tone tile + title over summary +
           trailing status, and the whole strip is the collapse
           button when collapsible (the chevron is decorative). -->
      <component
        :is="collapsible ? 'button' : 'div'"
        :type="collapsible ? 'button' : undefined"
        class="home-widget-card__title"
        :class="{ 'home-widget-card__title--collapsible': collapsible }"
        :data-testid="collapsible ? `${testId}-collapse` : undefined"
        :aria-label="collapsible ? t(collapsed ? 'home.expand' : 'home.collapse') : undefined"
        @click="toggleCollapse"
      >
        <span
          v-if="tone"
          class="home-widget-card__tone"
          :style="{ background: tone.bg, color: tone.fg }"
        >
          <component :is="tone.icon" />
        </span>
        <span class="home-widget-card__title-block">
          <span class="home-widget-card__title-text">{{ title }}</span>
          <span
            v-if="summary"
            :data-testid="`${testId}-summary`"
            class="home-widget-card__summary"
          >
            {{ summary }}
          </span>
        </span>
        <span v-if="status" class="home-widget-card__status" :title="status.label">
          <Tag :data-testid="`${testId}-status`" :color="statusColor(status.tone)">
            {{ status.label }}
          </Tag>
        </span>
        <UpOutlined
          v-if="collapsible && !collapsed"
          class="home-widget-card__chevron"
          aria-hidden="true"
        />
        <DownOutlined
          v-if="collapsible && collapsed"
          class="home-widget-card__chevron"
          aria-hidden="true"
        />
      </component>
    </template>
    <template #extra>
      <div class="home-widget-card__extra">
        <span v-if="editView" class="home-widget-card__edit-controls">
          <!-- The editor's drag handle: `.drag-widget-icon` is the
               selector the editor's drag logic keys off, and dragging
               is pointer-only, so this is not a focusable control. -->
          <Tooltip :title="t('home.reposition')">
            <span
              aria-hidden="true"
              class="drag-widget-icon"
              :data-testid="`drag-widget-${dragKey}`"
              draggable="true"
            >
              <HolderOutlined />
            </span>
          </Tooltip>
          <Button
            type="text"
            size="small"
            class="home-widget-card__remove"
            :data-testid="`remove-widget-${dragKey}`"
            :aria-label="t('home.remove')"
            @click="emit('remove')"
          >
            <template #icon><DeleteOutlined /></template>
          </Button>
        </span>
        <slot name="extra" />
      </div>
    </template>
    <div v-if="!collapsed" class="home-widget-card__body">
      <div v-if="isLoading" :data-testid="`${testId}-loading`" class="home-widget-card__loading">
        <Skeleton :paragraph="{ rows: 3 }" active />
      </div>
      <div
        v-else-if="isError"
        :data-testid="`${testId}-error`"
        class="home-widget-card__error"
        role="alert"
      >
        <span>{{ t('home.widgetLoadFailed') }}</span>
        <Button
          :data-testid="`${testId}-retry`"
          type="link"
          size="small"
          @click="emit('retry')"
        >
          {{ t('shared.retry') }}
        </Button>
      </div>
      <div
        v-else-if="emptyState"
        :data-testid="`${testId}-empty`"
        class="home-widget-card__empty"
      >
        <p v-if="emptyState.summary" class="home-widget-card__empty-summary">
          {{ emptyState.summary }}
        </p>
        <p class="home-widget-card__empty-title">{{ emptyState.title }}</p>
        <p v-if="emptyState.description" class="home-widget-card__empty-description">
          {{ emptyState.description }}
        </p>
        <Button
          v-if="emptyState.actionLabel"
          :data-testid="`${testId}-empty-action`"
          type="link"
          size="small"
          @click="emit('empty-action')"
        >
          {{ emptyState.actionLabel }}
        </Button>
      </div>
      <slot v-else />
      <p v-if="meta && !isLoading" :data-testid="`${testId}-meta`" class="home-widget-card__meta">
        {{ meta }}
      </p>
    </div>
  </Card>
</template>

<style scoped>
.home-widget-card {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  border-radius: var(--sm-radius-card);
  border-color: var(--sm-home-card-border);
  box-shadow: var(--sm-shadow-card);
  overflow: hidden;
}
.home-widget-card :deep(.ant-card-head) {
  flex: none;
  min-height: 0;
  padding: 8px 16px;
  border-bottom-color: var(--sm-border-secondary);
}
.home-widget-card :deep(.ant-card-head-wrapper) {
  align-items: center;
  gap: 8px;
}
.home-widget-card :deep(.ant-card-head-title) {
  overflow: hidden;
  font-size: 14px;
  font-weight: 600;
  color: var(--sm-text-primary);
  text-overflow: ellipsis;
  white-space: nowrap;
}
.home-widget-card :deep(.ant-card-extra) {
  flex: none;
}
.home-widget-card :deep(.ant-card-body) {
  flex: 1;
  min-height: 0;
  overflow: auto;
}
.home-widget-card__title {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  min-width: 0;
  padding: 0;
  border: 0;
  background: none;
  font: inherit;
  text-align: left;
  color: inherit;
}
.home-widget-card__title--collapsible {
  cursor: pointer;
}
.home-widget-card__tone {
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border-radius: var(--sm-radius-card);
  font-size: 20px;
}
.home-widget-card__title-block {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
  gap: 2px;
}
.home-widget-card__title-text {
  overflow: hidden;
  font-size: 14px;
  font-weight: 600;
  color: var(--sm-text-primary);
  text-overflow: ellipsis;
  white-space: nowrap;
}
.home-widget-card__summary {
  margin: 0;
  overflow: hidden;
  font-size: 12px;
  font-weight: 400;
  color: var(--sm-text-secondary);
  text-overflow: ellipsis;
  white-space: nowrap;
}
.home-widget-card__status {
  flex: none;
  max-width: 50%;
  overflow: hidden;
}
.home-widget-card__status .ant-tag {
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
}
.home-widget-card__chevron {
  flex: none;
  font-size: 12px;
  color: var(--sm-text-secondary);
}
.home-widget-card__edit-controls {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
.drag-widget-icon {
  display: inline-flex;
  align-items: center;
  padding: 6px;
  color: var(--sm-text-tertiary);
  cursor: grab;
}
.drag-widget-icon:active {
  cursor: grabbing;
}
.home-widget-card__remove {
  color: var(--sm-text-secondary);
}
.home-widget-card__extra {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}
.home-widget-card__body {
  min-height: 0;
}
.home-widget-card__loading {
  padding: 4px 0;
}
.home-widget-card__error {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 0;
  font-size: 13px;
  color: var(--sm-text-secondary);
}
.home-widget-card__empty {
  padding: 12px 0;
}
.home-widget-card__empty-title {
  margin: 0 0 4px;
  font-size: 14px;
  font-weight: 600;
  color: var(--sm-text-primary);
}
.home-widget-card__empty-description {
  margin: 0;
  font-size: 13px;
  color: var(--sm-text-secondary);
}
.home-widget-card__meta {
  margin: 12px 0 0;
  font-size: 12px;
  color: var(--sm-text-tertiary);
}
</style>
