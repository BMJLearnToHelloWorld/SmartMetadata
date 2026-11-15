<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { Descriptions, Tag, Typography } from 'ant-design-vue';
import { assetLocation } from '@/catalog/entityRoutes';
import { feedbackTypeLabel } from '@/catalog/recognizerFeedback';
import SmMarkdown from '@/components/shared/SmMarkdown.vue';
import { parseEntityLink } from '@/quality/entityLink';
import type { CollaborationTask } from '@/types/collaboration';

/**
 * Official FeedbackApprovalTask (pages/TasksPage/shared/
 * FeedbackApprovalTask.tsx), rendered in the detail view INSTEAD OF
 * the generic suggestion section. Exactly the pin's six rows with the
 * pin's conditionals: Recognizer (only when the sibling recognizer
 * name is present), Feedback type (always, when feedback exists),
 * Comments (only when present), Submitted by (only when present),
 * Submitted on (only when present), Entity link (only when the link
 * parses to an entity type and FQN). tagFQN, scores, samples and
 * reason are never rendered — the pin shows none of them.
 *
 * No feedback → renders nothing, as the pin's empty div. No status
 * gate: the detail renders for open AND closed tasks identically.
 *
 * The pin passes maxLength={100} to its markdown previewer, but that
 * prop is declared and never read by the previewer (a dead prop), so
 * comments render in full here through the shared SmMarkdown renderer.
 */
const props = defineProps<{ task: CollaborationTask }>();
const { t } = useI18n();

const data = computed(() => props.task.feedbackPayload);
const feedback = computed(() => data.value?.feedback);
const recognizerName = computed(() => data.value?.recognizerName);

/** Official EntityLink.getEntityColumnFqn: FQN, plus `.column` when the link names one. */
const entityLink = computed(() => {
  const link = feedback.value?.entityLink;
  if (!link) {
    return null;
  }
  const parsed = parseEntityLink(link);
  if (!parsed || !parsed.entityType || !parsed.fqn) {
    return null;
  }
  return {
    location: assetLocation(parsed.entityType, parsed.fqn),
    text: parsed.column ? `${parsed.fqn}.${parsed.column}` : parsed.fqn,
  };
});

const submittedBy = computed(() => {
  const author = feedback.value?.createdBy;
  if (!author) {
    return '';
  }
  return author.displayName || author.name || '-';
});

const submittedOn = computed(() =>
  feedback.value?.createdAt ? new Date(feedback.value.createdAt).toLocaleString() : '',
);
</script>

<template>
  <div v-if="feedback" data-testid="feedback-approval-task">
    <Typography.Title :level="5" class="collab-section" data-testid="feedback-approval-task-title">
      {{ t('collaboration.task.typeLabels.recognizerFeedback') }}
    </Typography.Title>
    <Descriptions bordered :column="1" size="small">
      <Descriptions.Item v-if="recognizerName" :label="t('collaboration.task.recognizer')">
        <span data-testid="feedback-recognizer">{{ recognizerName }}</span>
      </Descriptions.Item>
      <Descriptions.Item :label="t('collaboration.task.feedbackType')">
        <Tag color="error" data-testid="feedback-type">
          {{ feedbackTypeLabel(feedback.feedbackType, t) }}
        </Tag>
      </Descriptions.Item>
      <Descriptions.Item v-if="feedback.userComments" :label="t('collaboration.task.comments')">
        <SmMarkdown :markdown="feedback.userComments" test-id="feedback-comments" />
      </Descriptions.Item>
      <Descriptions.Item v-if="feedback.createdBy" :label="t('collaboration.task.submittedBy')">
        <span data-testid="feedback-submitted-by">{{ submittedBy }}</span>
      </Descriptions.Item>
      <Descriptions.Item v-if="feedback.createdAt" :label="t('collaboration.task.submittedOn')">
        <span data-testid="feedback-submitted-on">{{ submittedOn }}</span>
      </Descriptions.Item>
      <Descriptions.Item v-if="entityLink" :label="t('collaboration.task.entityLink')">
        <router-link :to="entityLink.location" data-testid="feedback-entity-link">
          {{ entityLink.text }}
        </router-link>
      </Descriptions.Item>
    </Descriptions>
  </div>
</template>

<style scoped>
.collab-section {
  margin-top: 24px;
}
</style>
