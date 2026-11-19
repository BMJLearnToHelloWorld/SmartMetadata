<!--
Copyright 2026 SmartMetadata authors.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0
-->
<script setup lang="ts">
import {
  BellOutlined,
  CheckOutlined,
  ClockCircleOutlined,
  ExclamationCircleOutlined,
  FileTextOutlined,
  FilterOutlined,
} from '@ant-design/icons-vue';
import {
  Button,
  Col,
  Collapse,
  Dropdown,
  Menu,
  Row,
  Skeleton,
  Tooltip,
  Typography,
} from 'ant-design-vue';
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { getAlertEventsFromId } from '@/api/eventSubscriptions';
import NextPrevious from '@/components/shared/NextPrevious.vue';
import NoDataPlaceholder from '@/components/shared/NoDataPlaceholder.vue';
import NoFilteredResultsPlaceholder from '@/components/shared/NoFilteredResultsPlaceholder.vue';
import SmCodeEditor from '@/components/shared/SmCodeEditor.vue';
import { useAuthStore } from '@/stores/auth';
import type { EventSubscription } from '@/types/quality';
import {
  ALERT_RECENT_EVENT_FILTERS,
  type AlertRecentEventFilter,
  type TypedEvent,
} from '@/types/notifications';
import { formatAlertDateTime } from '@/utils/notifications/alertDates';
import {
  getAlertEventsFilterLabels,
  getChangeEventDataFromTypedEvent,
  getEntityName,
  getLabelsForEventDetails,
  startCase,
  type AlertEventDetailsToDisplay,
  type TranslateFn,
} from '@/utils/notifications/alertUtils';
import { reportErrorToast, type AlertSearchHooks } from '@/utils/notifications/alertSourceSearch';
import {
  DEFAULT_GLOBAL_PAGE_SIZE,
  PERSISTABLE_PAGE_SIZES,
  readGlobalPageSize,
  writeGlobalPageSize,
} from '@/utils/userPageSizePreference';

/**
 * Pin `AlertRecentEventsTab` (AlertRecentEventsTab.tsx:68-436): offset paging
 * over `getAlertEventsFromId` by alert id, All / Successful / Failed filter
 * (selecting a filter resets to page 1, the status param is omitted for
 * All), a stale guard so only the latest request writes state or toasts,
 * and an out-of-range empty page bouncing back to page 1. Loading shows
 * five skeleton accordions; the two empty states differ by filter; each
 * event is an accordion row with a status icon, an entity icon, the event
 * id (or the unreadable-event label), and the timestamp, expanding to the
 * detail grid plus a read-only JSON view of the change description.
 *
 * The entity icon is a generic glyph: the product has no per-entity-type
 * icon utility, so only the tooltip (the startCase entity type) is ported
 * verbatim.
 */
const props = defineProps<{
  alertDetails: EventSubscription | undefined;
  hooks: AlertSearchHooks;
}>();

const { t, locale } = useI18n();
const translate = t as unknown as TranslateFn;
const authStore = useAuthStore();

const filter = ref<AlertRecentEventFilter>('all');
const alertRecentEvents = ref<TypedEvent[] | undefined>(undefined);
const loading = ref(false);
const currentPage = ref(1);
const pageSize = ref(readGlobalPageSize(localStorage, authStore.user?.name));
const total = ref(0);
const runId = ref(0);

const alertName = computed(() => getEntityName(props.alertDetails));
const alertId = computed(() => props.alertDetails?.id ?? '');

const filterOptions = computed(() =>
  ALERT_RECENT_EVENT_FILTERS.map((status) => ({
    key: status,
    label: getAlertEventsFilterLabels(status, translate),
  })),
);

const appliedFilterText = computed(() =>
  filter.value === 'all' ? '' : ` : ${getAlertEventsFilterLabels(filter.value, translate)}`,
);

// usePaging's showPagination, offset-paging form: no cursors exist, so only
// the total and the non-default page size can show the pager.
const showPagination = computed(
  () => total.value > pageSize.value || pageSize.value !== DEFAULT_GLOBAL_PAGE_SIZE,
);

async function fetchEvents(offset: number, run: number): Promise<void> {
  if (!alertId.value) {
    return;
  }
  loading.value = true;
  try {
    const { data, total: fetchedTotal } = await getAlertEventsFromId({
      id: alertId.value,
      params:
        filter.value === 'all'
          ? { limit: pageSize.value, paginationOffset: offset }
          : { status: filter.value, limit: pageSize.value, paginationOffset: offset },
    });
    if (run !== runId.value) {
      return;
    }
    // A page restored from the URL can lie past the end, where the empty
    // state hides the paginator.
    if (data.length === 0 && offset > 0) {
      currentPage.value = 1;
      return;
    }
    alertRecentEvents.value = data;
    total.value = fetchedTotal ?? 0;
  } catch (error) {
    if (run === runId.value) {
      reportErrorToast(error, props.hooks);
    }
  } finally {
    if (run === runId.value) {
      loading.value = false;
    }
  }
}

watch(
  [currentPage, pageSize, filter, alertId],
  () => {
    const run = ++runId.value;
    void fetchEvents((currentPage.value - 1) * pageSize.value, run);
  },
  { immediate: true },
);

function handleFilterSelect(key: string): void {
  filter.value = key as AlertRecentEventFilter;
  currentPage.value = 1;
}

function handlePageSizeChange(size: number): void {
  if ((PERSISTABLE_PAGE_SIZES as readonly number[]).includes(size)) {
    writeGlobalPageSize(localStorage, authStore.user?.name, size);
  }
  pageSize.value = size;
  currentPage.value = 1;
}

/**
 * One rendered row per event, computed once: the change-event payload, the
 * display entries in pin order, the unreadable flag (pin `isEmpty(data)`,
 * where data is the change-event array), and the change-description flag
 * (pin `isEmpty(changeDescription)`).
 */
const renderedEvents = computed(() =>
  (alertRecentEvents.value ?? []).map((event) => {
    const { changeEventData, changeEventDataToDisplay } = getChangeEventDataFromTypedEvent(event);
    const changeDescription = changeEventData.changeDescription;
    return {
      event,
      changeEventData,
      displayEntries: Object.entries(changeEventDataToDisplay) as [
        keyof AlertEventDetailsToDisplay,
        unknown,
      ][],
      isUnreadable: !event.data || event.data.length === 0,
      hasChangeDescription:
        changeDescription != null &&
        (Array.isArray(changeDescription)
          ? changeDescription.length > 0
          : typeof changeDescription === 'object'
            ? Object.keys(changeDescription).length > 0
            : typeof changeDescription === 'string'
              ? changeDescription.length > 0
              : false),
    };
  }),
);

function statusIcon(status: string) {
  switch (status) {
    case 'successful':
      return CheckOutlined;
    case 'failed':
      return ExclamationCircleOutlined;
    case 'unprocessed':
      return ClockCircleOutlined;
    default:
      return null;
  }
}
</script>

<template>
  <Row :gutter="[16, 16]">
    <Col :span="24">
      <div class="recent-events__header">
        <div class="recent-events__heading">
          <Typography.Text strong>{{ `${t('label.description')}:` }}</Typography.Text>
          <Typography.Text type="secondary">
            {{ t('message.alert-recent-events-description', { alertName }) }}
          </Typography.Text>
        </div>
        <Dropdown>
          <Button
            :aria-label="`${t('label.filter-plural')}${appliedFilterText}`"
            data-testid="filter-button"
            size="small"
          >
            <FilterOutlined />
            <Typography.Text
              v-if="appliedFilterText"
              data-testid="applied-filter-text"
              strong
            >
              {{ appliedFilterText }}
            </Typography.Text>
          </Button>
          <template #overlay>
            <Menu
              :selected-keys="[filter]"
              :aria-label="t('label.filter-plural')"
              @click="({ key }) => handleFilterSelect(String(key))"
            >
              <Menu.Item v-for="item in filterOptions" :key="item.key">
                {{ item.label }}
              </Menu.Item>
            </Menu>
          </template>
        </Dropdown>
      </div>
    </Col>
    <Col :span="24">
      <template v-if="loading">
        <Collapse>
          <Collapse.Panel
            v-for="index in 5"
            :key="`alert-event-skeleton-${index}`"
            disabled
            data-testid="skeleton-loading-panel"
          >
            <template #header>
              <Skeleton active :paragraph="false" :title="{ width: '100%' }" />
            </template>
          </Collapse.Panel>
        </Collapse>
      </template>
      <template v-else-if="!alertRecentEvents || alertRecentEvents.length === 0">
        <div class="recent-events__empty">
          <NoFilteredResultsPlaceholder
            v-if="filter !== 'all'"
            :icon="FilterOutlined"
            :title="t('message.no-results-for-filters')"
            :description="t('message.no-data-available-for-selected-filter')"
          />
          <NoDataPlaceholder
            v-else
            :icon="BellOutlined"
            :title="t('message.no-recent-events')"
            :description="t('message.no-recent-events-description')"
          />
        </div>
      </template>
      <template v-else>
        <div data-testid="recent-events-list">
          <Collapse destroy-inactive-panel>
            <Collapse.Panel
              v-for="row in renderedEvents"
              :key="`${row.changeEventData.id}-${row.changeEventData.timestamp}`"
            >
              <template #header>
                <div
                  class="recent-events__row-head"
                  :data-testid="`event-collapse-${row.changeEventData.id}`"
                >
                  <span class="recent-events__row-title">
                    <Tooltip placement="bottom" :title="startCase(row.event.status)">
                      <component
                        :is="statusIcon(row.event.status)"
                        v-if="statusIcon(row.event.status)"
                      />
                    </Tooltip>
                    <Tooltip
                      placement="bottom"
                      :title="startCase(row.changeEventData.entityType ?? '')"
                    >
                      <FileTextOutlined />
                    </Tooltip>
                    <Typography.Text>
                      {{ row.isUnreadable ? t('label.unreadable-event') : row.changeEventData.id }}
                    </Typography.Text>
                  </span>
                  <Typography.Text type="secondary">
                    {{ formatAlertDateTime(row.event.timestamp, locale) }}
                  </Typography.Text>
                </div>
              </template>
              <div :data-testid="`event-details-${row.changeEventData.id}`">
                <Row :gutter="[16, 16]">
                  <template
                    v-for="[key, value] in row.displayEntries"
                    :key="key"
                  >
                    <Col v-if="value !== undefined" :span="key === 'reason' ? 24 : 8">
                      <div :data-testid="`event-data-${key}`">
                        <div>
                          <Typography.Text
                            type="secondary"
                            data-testid="event-data-key"
                          >
                            {{ `${getLabelsForEventDetails(key, translate)}:` }}
                          </Typography.Text>
                        </div>
                        <div>
                          <Typography.Text strong data-testid="event-data-value">
                            {{ value }}
                          </Typography.Text>
                        </div>
                      </div>
                    </Col>
                  </template>
                </Row>
                <template v-if="row.hasChangeDescription">
                  <div>
                    <Typography.Text strong>
                      {{ `${t('label.change-entity', { entity: t('label.description') })}:` }}
                    </Typography.Text>
                  </div>
                  <SmCodeEditor
                    :value="JSON.stringify(row.changeEventData.changeDescription)"
                    :read-only="true"
                    :show-copy-button="false"
                  />
                </template>
              </div>
            </Collapse.Panel>
          </Collapse>
        </div>
        <NextPrevious
          v-if="showPagination"
          :paging="{ total }"
          :page-size="pageSize"
          :current-page="currentPage"
          :is-number-based="true"
          :is-loading="loading"
          :paging-handler="({ currentPage: page }) => (currentPage = page)"
          :on-show-size-change="handlePageSizeChange"
        />
      </template>
    </Col>
  </Row>
</template>

<style scoped>
.recent-events__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}

.recent-events__heading {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.recent-events__empty {
  position: relative;
  min-height: 320px;
  width: 100%;
}

.recent-events__row-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 16px;
  width: 100%;
}

.recent-events__row-title {
  display: flex;
  align-items: center;
  gap: 16px;
}
</style>
