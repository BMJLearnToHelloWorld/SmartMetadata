<!--
  Copyright 2026 SmartMetadata authors.

  Licensed under the Apache License, Version 2.0 (the "License");
  you may not use this file except in compliance with the License.
  You may obtain a copy of the License at

      http://www.apache.org/licenses/LICENSE-2.0
-->
<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { Button, Empty, Modal, Select, Space, Tag, Typography, message } from 'ant-design-vue';
import type { SelectValue } from 'ant-design-vue/es/select';
import { getContextMemoryById } from '@/api/contextCenter';
import { resolveTask } from '@/api/tasks';
import {
  MEMORY_FIELDS,
  REVIEW_DECISIONS,
  getComparedMemories,
  getConflictRecency,
  getMemoryDiffRows,
  getReadiness,
  getReviewDisputes,
  getUnavailableMemory,
  type MemorySide,
  type ReviewDecision,
} from '@/catalog/contextCenterMemories';
import type { CollaborationTask } from '@/types/collaboration';
import type { ContextMemory } from '@/types/contextCenter';

const props = defineProps<{
  open: boolean;
  review: CollaborationTask | null;
}>();

const emit = defineEmits<{
  resolved: [];
  cancel: [];
  'update:open': [open: boolean];
}>();

const { t } = useI18n();

const emptySide: MemorySide = { isLoading: false };
const reviewed = ref<MemorySide>({ isLoading: false });
const disputedSides = ref<MemorySide[]>([]);
const selectedDisputedId = ref<string | undefined>();

/**
 * antd Select emits SelectValue (RawValue | LabeledValue, single or array);
 * this single select only ever carries a plain string value, so normalise
 * to string here and keep the rest in string terms.
 */
function onDisputedChange(value: SelectValue): void {
  const next = Array.isArray(value) ? value[0] : value;
  selectedDisputedId.value =
    next === undefined
      ? undefined
      : typeof next === 'object' && next !== null
        ? String(next.value)
        : String(next);
}
const resolving = ref<ReviewDecision | undefined>();
const loading = ref(false);
const generation = ref(0);

const disputes = computed(() =>
  props.review ? getReviewDisputes(props.review.reviewPayload) : [],
);

const shownIndex = computed(() => {
  const index = disputes.value.findIndex(
    (dispute) => dispute.memory.id === selectedDisputedId.value,
  );
  return index >= 0 ? index : 0;
});

const shown = computed(() => disputedSides.value[shownIndex.value] ?? emptySide);

const rows = computed(() =>
  getMemoryDiffRows(shown.value.memory, reviewed.value.memory, (key: string) => t(key)),
);

const recency = computed(() =>
  getConflictRecency(
    reviewed.value.memory,
    disputedSides.value.flatMap((side) => (side.memory ? [side.memory] : [])),
  ),
);

const readiness = computed(() =>
  getReadiness(shown.value, reviewed.value, disputedSides.value),
);

const compared = computed(() =>
  getComparedMemories([
    { id: props.review?.about?.id, memory: reviewed.value.memory },
    ...disputes.value.map((dispute, index) => ({
      id: dispute.memory.id,
      memory: disputedSides.value[index]?.memory,
    })),
  ]),
);

const disputedOptions = computed(() =>
  disputes.value.map((dispute, index) => ({
    value: dispute.memory.id ?? '',
    label:
      disputedSides.value[index]?.memory?.title ||
      dispute.memory.displayName ||
      dispute.memory.name ||
      dispute.memory.id ||
      '',
  })),
);

function sideTitle(memory: ContextMemory | undefined, fallback: string): string {
  return memory?.title || memory?.displayName || memory?.name || fallback;
}

async function loadSide(id: string): Promise<MemorySide> {
  try {
    const memory = await getContextMemoryById(id, MEMORY_FIELDS);
    return memory ? { memory, isLoading: false } : { isLoading: false, unavailable: 'gone' };
  } catch (error) {
    return { isLoading: false, unavailable: getUnavailableMemory(error) ?? 'failed' };
  }
}

async function load(): Promise<void> {
  const review = props.review;
  if (!review) {
    return;
  }
  const request = ++generation.value;
  loading.value = true;
  const reviewDisputes = getReviewDisputes(review.reviewPayload);
  reviewed.value = { isLoading: true };
  disputedSides.value = reviewDisputes.map(() => ({ isLoading: true }));
  selectedDisputedId.value = reviewDisputes[0]?.memory.id;
  const aboutId = review.about?.id;
  const [reviewedSide, ...disputed] = await Promise.all([
    aboutId ? loadSide(aboutId) : Promise.resolve(emptySide),
    ...reviewDisputes.map((dispute) =>
      dispute.memory.id ? loadSide(dispute.memory.id) : Promise.resolve(emptySide),
    ),
  ]);
  if (request !== generation.value) {
    return;
  }
  reviewed.value = reviewedSide;
  disputedSides.value = disputed;
  loading.value = false;
}

watch(
  () => [props.open, props.review?.id],
  ([open]) => {
    if (open && props.review) {
      void load();
    }
  },
  { immediate: true },
);

function close(): void {
  emit('cancel');
  emit('update:open', false);
}

async function handleKeep(decision: ReviewDecision): Promise<void> {
  const review = props.review;
  if (!review) {
    return;
  }
  resolving.value = decision;
  try {
    await resolveTask(review.id, {
      transitionId: decision,
      resolutionType: REVIEW_DECISIONS[decision],
      payload: { compared: compared.value },
    });
    message.success(t('contextCenter.saved'));
    emit('resolved');
    close();
  } catch {
    // The server refuses the decision when the review or a claim moved
    // on since it was read; refresh both sides instead of failing silent.
    message.error(t('contextCenter.resolveFailed'));
    await load();
  } finally {
    resolving.value = undefined;
  }
}
</script>

<template>
  <Modal
    :open="open"
    :title="t('contextCenter.reviewTitle')"
    :footer="null"
    :width="900"
    data-testid="memory-compare-modal"
    @cancel="close"
    @update:open="close"
  >
    <div v-if="loading">
      <Typography.Text type="secondary">{{ t('shared.loading') }}</Typography.Text>
    </div>
    <div v-else-if="!review">
      <Empty :description="t('contextCenter.reviewEmpty')" />
    </div>
    <div v-else>
      <Select
        v-if="disputes.length > 1"
        :value="selectedDisputedId"
        data-testid="memory-compare-disputed"
        :options="disputedOptions"
        style="min-width: 240px; margin-bottom: 12px"
        @change="onDisputedChange"
      />
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 12px">
        <div>
          <Typography.Title :level="5" style="margin: 0">
            {{ t('contextCenter.approvedMemory') }}
          </Typography.Title>
          <Typography.Text strong>
            {{ sideTitle(shown.memory, shown.memory?.name ?? '') }}
          </Typography.Text>
          <Typography.Paragraph
            v-if="shown.unavailable"
            type="danger"
            style="margin: 4px 0 0"
          >
            {{ t('contextCenter.reviewMemoryUnavailable') }}
          </Typography.Paragraph>
          <Typography.Paragraph
            v-if="recency.disputed[selectedDisputedId ?? '']"
            type="secondary"
            style="margin: 4px 0 0"
          >
            {{
              recency.disputed[selectedDisputedId ?? ''] === 'newer'
                ? t('contextCenter.newerClaim')
                : t('contextCenter.olderClaim')
            }}
          </Typography.Paragraph>
        </div>
        <div>
          <Typography.Title :level="5" style="margin: 0">
            {{ t('contextCenter.reviewedMemory') }}
          </Typography.Title>
          <Typography.Text strong>
            {{ sideTitle(reviewed.memory, review.about?.displayName || review.about?.name || '') }}
          </Typography.Text>
          <Typography.Paragraph
            v-if="reviewed.unavailable"
            type="danger"
            style="margin: 4px 0 0"
          >
            {{ t('contextCenter.reviewMemoryUnavailable') }}
          </Typography.Paragraph>
          <Typography.Paragraph
            v-if="recency.reviewed"
            type="secondary"
            style="margin: 4px 0 0"
          >
            {{
              recency.reviewed === 'newer'
                ? t('contextCenter.newerClaim')
                : t('contextCenter.olderClaim')
            }}
          </Typography.Paragraph>
        </div>
      </div>
      <table style="width: 100%; border-collapse: collapse" data-testid="memory-diff-rows">
        <tbody>
          <tr v-for="row in rows" :key="row.key" style="border-top: 1px solid #f0f0f0">
            <th style="text-align: left; padding: 8px 8px 8px 0; vertical-align: top; width: 120px">
              {{ t(row.labelKey) }}
            </th>
            <td style="padding: 8px; vertical-align: top">
              <span v-if="row.kind === 'text'">
                <span
                  v-for="part in row.sides.current"
                  :key="part.id"
                  :style="
                    part.change === 'removed'
                      ? 'background: #fff1f0; text-decoration: line-through'
                      : undefined
                  "
                >
                  {{ part.value }}
                </span>
              </span>
              <Space v-else wrap>
                <Tag
                  v-for="part in row.sides.current"
                  :key="part.id"
                  :color="part.change === 'removed' ? 'red' : undefined"
                >
                  {{ part.value }}
                </Tag>
              </Space>
            </td>
            <td style="padding: 8px; vertical-align: top">
              <span v-if="row.kind === 'text'">
                <span
                  v-for="part in row.sides.proposed"
                  :key="part.id"
                  :style="part.change === 'added' ? 'background: #f6ffed' : undefined"
                >
                  {{ part.value }}
                </span>
              </span>
              <Space v-else wrap>
                <Tag
                  v-for="part in row.sides.proposed"
                  :key="part.id"
                  :color="part.change === 'added' ? 'green' : undefined"
                >
                  {{ part.value }}
                </Tag>
              </Space>
            </td>
          </tr>
        </tbody>
      </table>
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-top: 16px">
        <div>
          <Button
            type="primary"
            data-testid="memory-compare-keep-approved"
            :disabled="!readiness.canReject"
            :loading="resolving === 'reject'"
            @click="handleKeep('reject')"
          >
            {{ t('contextCenter.keepThis') }}
          </Button>
          <Typography.Paragraph type="secondary" style="margin: 8px 0 0">
            {{ t('contextCenter.keepApprovedHint') }}
          </Typography.Paragraph>
        </div>
        <div>
          <Button
            type="primary"
            data-testid="memory-compare-keep-reviewed"
            :disabled="!readiness.canApprove"
            :loading="resolving === 'approve'"
            @click="handleKeep('approve')"
          >
            {{ t('contextCenter.keepThis') }}
          </Button>
          <Typography.Paragraph type="secondary" style="margin: 8px 0 0">
            {{ t('contextCenter.keepReviewedHint') }}
          </Typography.Paragraph>
        </div>
      </div>
      <Typography.Paragraph
        v-if="!readiness.canReject"
        type="secondary"
        style="margin-top: 12px"
      >
        {{ t('contextCenter.resolveNeedsBoth') }}
      </Typography.Paragraph>
    </div>
  </Modal>
</template>
