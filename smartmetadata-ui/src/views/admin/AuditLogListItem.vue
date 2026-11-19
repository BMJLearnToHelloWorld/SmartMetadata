<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<!--
  Port of AuditLogListItem (components/AuditLog/AuditLogList.component.tsx):
  32px avatar, header (actor – event type – impersonated-by), description
  nodes (one div each, `; ` after non-last nodes), meta line. All value
  semantics live in auditLogFeed.ts; this component only renders them.
-->
<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { RouterLink } from 'vue-router';
import SmProfilePicture from '@/components/shared/SmProfilePicture.vue';
import type { AuditLogEntry } from '@/api/auditLogs';
import { getRelativeTime } from '@/utils/relativeTime';
import AuditLogDetailValue from './AuditLogDetailValue.vue';
import {
  getAuditLogDisplayInfo,
  getAuditLogEntityLink,
  getAuditLogHeaderUserLink,
  getChangeDetails,
  type AuditLogChangeDetail,
} from './auditLogFeed';
import { startCase } from '@/utils/text';

const props = defineProps<{ log: AuditLogEntry }>();
const { t } = useI18n();

const info = computed(() => getAuditLogDisplayInfo(props.log, t('label.system')));
const entityLink = computed(() => getAuditLogEntityLink(props.log, info.value));
const userLink = computed(() => getAuditLogHeaderUserLink(props.log, info.value));

const descriptionNodes = computed<AuditLogChangeDetail[] | 'summary' | 'empty'>(() => {
  if (props.log.summary) {
    return 'summary';
  }
  const changeDescription = props.log.changeEvent?.changeDescription;
  if (changeDescription) {
    return getChangeDetails(changeDescription, (key, params) =>
      params === undefined ? t(key) : t(key, params),
    );
  }
  return 'empty';
});

function hasDetailValue(detail: AuditLogChangeDetail): boolean {
  return Boolean(detail.oldValue ?? detail.newValue);
}
</script>

<template>
  <div data-testid="audit-log-list-item" class="audit-log-list-item">
    <div data-testid="item-avatar" class="audit-log-list-item__avatar">
      <SmProfilePicture
        :name="log.userName || 'system'"
        :display-name="info.userName"
        size="sm"
      />
    </div>
    <div class="audit-log-list-item__content">
      <div data-testid="item-header" class="audit-log-list-item__header">
        <RouterLink v-if="userLink.kind === 'link'" :to="userLink.to" class="audit-log-list-item__actor">
          {{ userLink.label }}
        </RouterLink>
        <strong v-else>{{ userLink.label }}</strong>
        <span class="audit-log-list-item__dash">–</span>
        <span data-testid="event-type" class="audit-log-list-item__event-type">{{ info.eventType }}</span>
        <template v-if="log.impersonatedBy">
          <span class="audit-log-list-item__dash">–</span>
          <span data-testid="impersonated-by">{{ t('label.impersonated-by-with-colon') }}</span>
          <RouterLink
            :to="{ name: 'admin-user', params: { id: log.impersonatedBy } }"
            class="audit-log-list-item__actor"
          >
            {{ log.impersonatedBy }}
          </RouterLink>
        </template>
      </div>
      <div data-testid="description-content">
        <template v-if="descriptionNodes === 'summary'">
          <div>
            <span>{{ log.summary }}</span>
          </div>
        </template>
        <template v-else-if="descriptionNodes !== 'empty'">
          <div v-for="(detail, index) in descriptionNodes" :key="detail.key">
            <span>
              <span class="audit-log-list-item__action">{{ detail.actionLabel }}</span>
              {{ ' ' }}
              <strong>{{ detail.fieldLabel }}</strong>
              <template v-if="hasDetailValue(detail)">
                :
                <template v-if="detail.oldValue">
                  <AuditLogDetailValue :value="detail.oldValue" />
                </template>
                <template v-if="detail.oldValue && detail.newValue"> → </template>
                <template v-if="detail.newValue">
                  <AuditLogDetailValue :value="detail.newValue" />
                </template>
              </template>
            </span>
            <span v-if="index < descriptionNodes.length - 1" class="audit-log-list-item__separator">; </span>
          </div>
        </template>
        <div v-else class="audit-log-list-item__fallback">
          <span class="audit-log-list-item__event-type">{{ info.eventType }}</span>
          <RouterLink v-if="entityLink.kind === 'link'" :to="entityLink.to">
            {{ entityLink.label }}
          </RouterLink>
          <span v-else>{{ entityLink.label }}</span>
        </div>
      </div>
      <div data-testid="item-meta" class="audit-log-list-item__meta">
        <span v-if="info.entityType" data-testid="entity-type-badge">
          {{ startCase(info.entityType) }}
        </span>
        <span v-if="info.entityType && info.timestamp">|</span>
        <span v-if="info.timestamp" data-testid="timestamp">{{ getRelativeTime(info.timestamp) }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.audit-log-list-item {
  display: flex;
  gap: 8px;
  padding: 16px;
  border-bottom: 1px solid var(--sm-border-secondary);
}

.audit-log-list-item:last-child {
  border-bottom: 0;
}

.audit-log-list-item__avatar {
  flex-shrink: 0;
}

.audit-log-list-item__content {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
  align-items: flex-start;
}

.audit-log-list-item__header {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px;
}

.audit-log-list-item__dash,
.audit-log-list-item__separator,
.audit-log-list-item__action {
  color: var(--sm-text-secondary);
}

.audit-log-list-item__event-type {
  font-weight: 500;
}

.audit-log-list-item__fallback {
  display: flex;
  align-items: center;
  gap: 4px;
}

.audit-log-list-item__meta {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 4px;
  font-size: 12px;
  color: var(--sm-text-secondary);
}
</style>
