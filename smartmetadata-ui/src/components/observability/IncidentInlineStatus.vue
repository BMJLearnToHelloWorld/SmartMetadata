<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
  Official InlineTestCaseIncidentStatus: audit tooltip, menu, assign/resolve popovers.
-->
<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { Button, Dropdown, Input, Menu, Popover, Spin, Tooltip } from 'ant-design-vue';
import { ArrowLeftOutlined } from '@ant-design/icons-vue';
import { searchUsers } from '@/api/users';
import { incidentStatusLabel } from '@/features/crud/incidentStatus';
import { entityLabel } from '@/features/crud/paging';
import type { StatusChangeAdditionalData } from '@/features/quality/incidentManager';
import { formatMediumDate } from '@/utils/dates';
import type { EntityRef } from '@/types/api';
import type { IncidentStatus, TestIncident } from '@/types/quality';
import IncidentChipTrigger from '@/components/observability/IncidentChipTrigger.vue';
import IncidentFailureReasonChips from '@/components/observability/IncidentFailureReasonChips.vue';
import { INCIDENT_STATUS_CHIP_COLORS } from '@/quality/incidentChipColors';

const props = defineProps<{
  record: TestIncident;
  editable?: boolean;
  loading?: boolean;
  menuOptions: IncidentStatus[];
  testId?: string;
  assigneeCandidates?: EntityRef[];
}>();

const emit = defineEmits<{
  transition: [status: IncidentStatus, additional?: StatusChangeAdditionalData];
}>();

const { t } = useI18n();

const menuOpen = ref(false);
const showAssigneePopover = ref(false);
const showResolvedPopover = ref(false);
const usersLoading = ref(false);
const userOptions = ref<EntityRef[]>([]);
const selectedAssignee = ref<EntityRef | undefined>();
const selectedReason = ref('');
const comment = ref('');
let searchDebounce: ReturnType<typeof setTimeout> | undefined;

const status = computed(() => props.record.testCaseResolutionStatusType as IncidentStatus);

const chipLabel = computed(() => incidentStatusLabel(t, status.value));

const palette = computed(
  () => INCIDENT_STATUS_CHIP_COLORS[status.value] ?? INCIDENT_STATUS_CHIP_COLORS.New,
);

const auditTooltip = computed(() => {
  const updatedAt = props.record.updatedAt ?? props.record.timestamp;
  if (!updatedAt) {
    return '';
  }
  const formatted = formatMediumDate(updatedAt);
  const by = entityLabel(props.record.updatedBy);
  if (by) {
    return `${formatted} ${t('label.by-lowercase')} ${by}`;
  }
  return formatted;
});

const overlayOpen = computed(
  () => menuOpen.value || showAssigneePopover.value || showResolvedPopover.value,
);

const assigneeSubmitDisabled = computed(() => selectedAssignee.value === undefined || props.loading === true);

const resolvedSubmitDisabled = computed(
  () => selectedReason.value === '' || comment.value.trim() === '' || props.loading === true,
);

const initialAssignee = computed(() => props.record.testCaseResolutionStatusDetails?.assignee);

function resetPopovers(): void {
  menuOpen.value = false;
  showAssigneePopover.value = false;
  showResolvedPopover.value = false;
  selectedAssignee.value = initialAssignee.value;
  userOptions.value = [];
  selectedReason.value = '';
  comment.value = '';
}

function mergeUserOptions(remote: EntityRef[]): void {
  const seed = initialAssignee.value;
  const extra = props.assigneeCandidates ?? [];
  const merged: EntityRef[] = [];
  const seen = new Set<string>();
  const push = (item: EntityRef | undefined): void => {
    if (item === undefined) return;
    const key = `${item.type ?? 'user'}:${item.id ?? item.name ?? ''}`;
    if (seen.has(key)) return;
    seen.add(key);
    merged.push(item);
  };
  push(seed);
  for (const item of extra) push(item);
  for (const item of remote) push(item);
  userOptions.value = merged;
}

async function runUserSearch(query: string): Promise<void> {
  usersLoading.value = true;
  try {
    const page = await searchUsers(query, 0, 10);
    const remote = page.data.map((user) => ({
      id: user.id,
      name: user.name,
      displayName: user.displayName,
      fullyQualifiedName: user.fullyQualifiedName ?? user.name,
      type: 'user' as const,
    }));
    mergeUserOptions(remote);
  } finally {
    usersLoading.value = false;
  }
}

function queueUserSearch(query: string): void {
  if (searchDebounce !== undefined) clearTimeout(searchDebounce);
  searchDebounce = setTimeout(() => {
    void runUserSearch(query);
  }, 300);
}

function openAssigneePopover(): void {
  menuOpen.value = false;
  showResolvedPopover.value = false;
  showAssigneePopover.value = true;
  selectedAssignee.value = initialAssignee.value;
  void runUserSearch('');
}

function openResolvedPopover(): void {
  menuOpen.value = false;
  showAssigneePopover.value = false;
  showResolvedPopover.value = true;
  selectedReason.value = props.record.testCaseResolutionStatusDetails?.testCaseFailureReason ?? '';
  comment.value = props.record.testCaseResolutionStatusDetails?.testCaseFailureComment ?? '';
}

function onMenuOpenChange(open: boolean): void {
  if (!open) {
    if (!showAssigneePopover.value && !showResolvedPopover.value) {
      menuOpen.value = false;
    }
    return;
  }
  if (status.value === 'Assigned') {
    openAssigneePopover();
    return;
  }
  if (status.value === 'Resolved') {
    openResolvedPopover();
    return;
  }
  menuOpen.value = true;
}

function onAssigneePopoverChange(open: boolean): void {
  if (!open) {
    resetPopovers();
    return;
  }
  openAssigneePopover();
}

function onResolvedPopoverChange(open: boolean): void {
  if (!open) {
    resetPopovers();
    return;
  }
  openResolvedPopover();
}

function onMenuClick({ key }: { key: string }): void {
  const target = key as IncidentStatus;
  menuOpen.value = false;
  if (target === 'Assigned') {
    openAssigneePopover();
    return;
  }
  if (target === 'Resolved') {
    showResolvedPopover.value = true;
    selectedReason.value = '';
    comment.value = '';
    return;
  }
  resetPopovers();
  emit('transition', target);
}

function backToMenu(): void {
  showAssigneePopover.value = false;
  showResolvedPopover.value = false;
  selectedAssignee.value = initialAssignee.value;
  userOptions.value = [];
  selectedReason.value = '';
  comment.value = '';
  menuOpen.value = true;
}

function submitAssignee(): void {
  const assignee = selectedAssignee.value;
  if (assignee === undefined) return;
  resetPopovers();
  emit('transition', 'Assigned', { assignee });
}

function submitResolved(): void {
  if (selectedReason.value === '' || comment.value.trim() === '') return;
  const payload = { reason: selectedReason.value, comment: comment.value.trim() };
  resetPopovers();
  emit('transition', 'Resolved', payload);
}

watch(
  () => props.record.id,
  () => resetPopovers(),
);
</script>

<template>
  <Tooltip :title="auditTooltip || undefined" placement="bottom">
    <Popover
      v-if="editable && showAssigneePopover"
      :open="showAssigneePopover"
      trigger="click"
      placement="top"
      :overlay-inner-style="{ padding: 0, minWidth: '280px', maxWidth: '360px' }"
      @update:open="onAssigneePopoverChange"
    >
      <IncidentChipTrigger
        :label="chipLabel"
        :palette="palette"
        :editable="!loading"
        :loading="loading"
        :overlay-open="overlayOpen"
        :test-id="testId"
      />
      <template #content>
        <div :data-testid="testId ? `${testId}-assignee-popover` : undefined">
          <div class="incident-status-popover__header">
            <Button type="text" size="small" @click="backToMenu">
              <ArrowLeftOutlined />
            </Button>
            <span class="incident-status-popover__title">{{ t('label.assigned') }}</span>
            <div class="incident-status-popover__actions">
              <Button
                type="text"
                size="small"
                data-testid="cancel-assignee-popover-button"
                @click="resetPopovers"
              >
                {{ t('label.cancel') }}
              </Button>
              <Button
                type="primary"
                size="small"
                :disabled="assigneeSubmitDisabled"
                data-testid="submit-assignee-popover-button"
                @click="submitAssignee"
              >
                {{ t('label.submit') }}
              </Button>
            </div>
          </div>
          <div class="incident-status-popover__body">
            <Input
              data-testid="assignee-search-input"
              :placeholder="t('label.search')"
              allow-clear
              @update:value="(value) => queueUserSearch(String(value ?? ''))"
            />
            <div class="incident-status-popover__scroll">
              <Spin v-if="usersLoading" size="small" />
              <template v-else-if="userOptions.length === 0">
                <div class="incident-status-popover__empty">
                  {{ t('label.no-entity-found', { entity: t('label.user-plural') }) }}
                </div>
              </template>
              <button
                v-for="user in userOptions"
                :key="`${user.type ?? 'user'}:${user.id ?? user.name}`"
                type="button"
                class="incident-status-popover__user"
                :class="{
                  'incident-status-popover__user--selected':
                    selectedAssignee?.id === user.id && selectedAssignee?.name === user.name,
                }"
                :data-testid="user.name"
                @click="selectedAssignee = user"
              >
                {{ user.displayName || user.name }}
              </button>
            </div>
          </div>
        </div>
      </template>
    </Popover>
    <Popover
      v-else-if="editable && showResolvedPopover"
      :open="showResolvedPopover"
      trigger="click"
      placement="top"
      :overlay-inner-style="{ padding: 0, minWidth: '280px', maxWidth: '360px' }"
      @update:open="onResolvedPopoverChange"
    >
      <IncidentChipTrigger
        :label="chipLabel"
        :palette="palette"
        :editable="!loading"
        :loading="loading"
        :overlay-open="overlayOpen"
        :test-id="testId"
      />
      <template #content>
        <div :data-testid="testId ? `${testId}-resolved-popover` : undefined">
          <div class="incident-status-popover__header">
            <Button type="text" size="small" @click="backToMenu">
              <ArrowLeftOutlined />
            </Button>
            <span class="incident-status-popover__title">{{ t('label.resolved') }}</span>
            <div class="incident-status-popover__actions">
              <Button
                type="text"
                size="small"
                data-testid="cancel-resolved-popover-button"
                @click="resetPopovers"
              >
                {{ t('label.cancel') }}
              </Button>
              <Button
                type="primary"
                size="small"
                :disabled="resolvedSubmitDisabled"
                data-testid="submit-resolved-popover-button"
                @click="submitResolved"
              >
                {{ t('label.submit') }}
              </Button>
            </div>
          </div>
          <div class="incident-status-popover__body incident-status-popover__body--resolved">
            <div class="incident-status-popover__label">
              {{ t('label.reason') }}
            </div>
            <IncidentFailureReasonChips v-model="selectedReason" />
            <div class="incident-status-popover__label">
              {{ t('label.comment') }}
            </div>
            <Input.TextArea
              v-model:value="comment"
              data-testid="resolved-comment-textarea"
              :placeholder="t('message.enter-a-field', { field: t('label.comment-lowercase') })"
              :rows="4"
            />
          </div>
        </div>
      </template>
    </Popover>
    <Dropdown
      v-else-if="editable"
      :open="menuOpen"
      :trigger="['click']"
      @update:open="onMenuOpenChange"
    >
      <IncidentChipTrigger
        :label="chipLabel"
        :palette="palette"
        :editable="!loading"
        :loading="loading"
        :overlay-open="overlayOpen"
        :test-id="testId"
      />
      <template #overlay>
        <Menu :selected-keys="[status]" @click="onMenuClick">
          <Menu.Item
            v-for="option in menuOptions"
            :key="option"
            :data-testid="`incident-status-option-${option}`"
          >
            {{ incidentStatusLabel(t, option) }}
          </Menu.Item>
        </Menu>
      </template>
    </Dropdown>
    <IncidentChipTrigger
      v-else
      :label="chipLabel"
      :palette="palette"
      :test-id="testId"
    />
  </Tooltip>
</template>

<style scoped>
.incident-status-popover__header {
  align-items: center;
  border-bottom: 1px solid #f0f0f0;
  display: flex;
  gap: 0.25rem;
  padding: 0.5rem 0.75rem;
}

.incident-status-popover__title {
  flex: 1;
  font-weight: 500;
}

.incident-status-popover__actions {
  display: flex;
  gap: 0.25rem;
}

.incident-status-popover__body {
  padding: 0.75rem;
}

.incident-status-popover__body--resolved {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.incident-status-popover__label {
  font-size: 12px;
  font-weight: 500;
}

.incident-status-popover__scroll {
  margin-top: 0.5rem;
  max-height: 240px;
  overflow-y: auto;
}

.incident-status-popover__user {
  background: transparent;
  border: none;
  cursor: pointer;
  display: block;
  padding: 0.375rem 0.5rem;
  text-align: left;
  width: 100%;
}

.incident-status-popover__user--selected,
.incident-status-popover__user:hover {
  background: #f5f5f5;
}

.incident-status-popover__empty {
  color: #8c8c8c;
  font-size: 12px;
  padding: 0.5rem;
  text-align: center;
}
</style>