<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { Button, Empty, Input, Spin, Tag } from 'ant-design-vue';
import { listTestCasesBySearch } from '@/api/testCases';
import { listTestCaseIncidentsFromSearch } from '@/api/testIncidents';
import PermissionPlaceholder from '@/components/shared/PermissionPlaceholder.vue';
import { incidentStatusLabel } from '@/features/crud/incidentStatus';
import type { TestCase, TestIncident } from '@/types/quality';

const props = defineProps<{
  fqn: string;
  /** Pin `DataQualityTab` `hasViewTests`. */
  canView: boolean;
}>();

const { t } = useI18n();
const router = useRouter();

type TestFilter = 'success' | 'failed' | 'aborted';
type IncidentFilter = 'new' | 'ack' | 'assigned' | 'resolved';

// Pin `DataQualityTab.tsx` (a3012259ca): test cases via
// `getListTestCaseBySearch` (entityLink, includeAllTests, limit 50,
// fields `testCaseResult,incidentId`, sort desc by
// `testCaseResult.timestamp`); incidents via
// `getListTestCaseIncidentStatus` (latest, originEntityFQN, last 30
// days, limit 100). The product calls use the same parameters through
// its own list endpoints (entityFQN filter, same server-side scope).
const loading = ref(true);
const incidentsLoading = ref(true);
const testCases = ref<TestCase[]>([]);
const incidents = ref<TestIncident[]>([]);
const counts = ref({ success: 0, failed: 0, aborted: 0, total: 0 });
const incidentCounts = ref({ new: 0, ack: 0, assigned: 0, resolved: 0, total: 0 });
const activeSubTab = ref<'testCases' | 'incidents'>('testCases');
// Pin defaults the test-case filter to `success` and the incident
// filter to `new`.
const activeFilter = ref<TestFilter>('success');
const activeIncidentFilter = ref<IncidentFilter>('new');
const searchText = ref('');

let testGeneration = 0;
let incidentGeneration = 0;
let searchTimer: ReturnType<typeof setTimeout> | undefined;

function statusOf(testCase: TestCase): string {
  return (testCase.testCaseResult?.testCaseStatus ?? testCase.testCaseStatus ?? '').toLowerCase();
}

function countTestCases(cases: TestCase[]): { success: number; failed: number; aborted: number; total: number } {
  const next = { success: 0, failed: 0, aborted: 0, total: 0 };
  for (const testCase of cases) {
    const status = statusOf(testCase);
    if (!status) {
      continue;
    }
    if (status === 'success') {
      next.success++;
    } else if (status === 'failed') {
      next.failed++;
    } else if (status === 'aborted') {
      next.aborted++;
    }
    next.total++;
  }
  return next;
}

async function loadTestCases(query: string): Promise<void> {
  const generation = ++testGeneration;
  loading.value = true;
  try {
    const page = await listTestCasesBySearch({
      entityFQN: props.fqn,
      q: query || undefined,
      includeAllTests: true,
      limit: 50,
      fields: 'testCaseResult,incidentId',
      sortField: 'testCaseResult.timestamp',
      // Pin sends `sortType: 'DESC'`; the product API type is lowercase
      // and passes the value through verbatim.
      sortType: 'desc',
    });
    if (generation !== testGeneration) {
      return;
    }
    testCases.value = page.data ?? [];
    // Pin calculates the status counts only when there is no search
    // query; a search filters the list and leaves the counts alone.
    if (!query) {
      counts.value = countTestCases(testCases.value);
    }
  } catch {
    if (generation === testGeneration) {
      testCases.value = [];
      if (!query) {
        counts.value = { success: 0, failed: 0, aborted: 0, total: 0 };
      }
    }
  } finally {
    if (generation === testGeneration) {
      loading.value = false;
    }
  }
}

const INCIDENT_FILTER_STATUS: Record<IncidentFilter, string> = {
  new: 'New',
  ack: 'Ack',
  assigned: 'Assigned',
  resolved: 'Resolved',
};

async function loadIncidents(): Promise<void> {
  const generation = ++incidentGeneration;
  incidentsLoading.value = true;
  const now = Date.now();
  try {
    const page = await listTestCaseIncidentsFromSearch({
      originEntityFQN: props.fqn,
      latest: true,
      startTs: now - 30 * 24 * 60 * 60 * 1000,
      endTs: now,
      limit: 100,
    });
    if (generation !== incidentGeneration) {
      return;
    }
    const list = page.data ?? [];
    incidents.value = list;
    const next = { new: 0, ack: 0, assigned: 0, resolved: 0, total: list.length };
    for (const incident of list) {
      const status = incident.testCaseResolutionStatusType ?? '';
      if (status === 'New') {
        next.new++;
      } else if (status === 'Ack') {
        next.ack++;
      } else if (status === 'Assigned') {
        next.assigned++;
      } else if (status === 'Resolved') {
        next.resolved++;
      }
    }
    incidentCounts.value = next;
  } catch {
    if (generation === incidentGeneration) {
      incidents.value = [];
      incidentCounts.value = { new: 0, ack: 0, assigned: 0, resolved: 0, total: 0 };
    }
  } finally {
    if (generation === incidentGeneration) {
      incidentsLoading.value = false;
    }
  }
}

function loadAll(): void {
  void loadTestCases('');
  void loadIncidents();
}

onMounted(() => {
  if (props.canView) {
    loadAll();
  }
});

watch(
  () => props.fqn,
  () => {
    if (props.canView) {
      loadAll();
    }
  },
);

// Pin `SearchBarComponent` typingInterval 350: the test-case search
// goes server-side (the `q` param); the incident list is filtered
// client-side on the test-case name below.
watch(searchText, () => {
  if (searchTimer !== undefined) {
    clearTimeout(searchTimer);
  }
  searchTimer = setTimeout(() => {
    void loadTestCases(searchText.value.trim());
  }, 350);
});

onUnmounted(() => {
  if (searchTimer !== undefined) {
    clearTimeout(searchTimer);
  }
});

const filteredTestCases = computed(() =>
  testCases.value.filter((testCase) => statusOf(testCase) === activeFilter.value),
);

const filteredIncidents = computed(() => {
  const query = searchText.value.trim().toLowerCase();
  return incidents.value.filter((incident) => {
    if ((incident.testCaseResolutionStatusType ?? '') !== INCIDENT_FILTER_STATUS[activeIncidentFilter.value]) {
      return false;
    }
    if (!query) {
      return true;
    }
    const name = incident.testCaseReference?.displayName || incident.testCaseReference?.name || '';
    return name.toLowerCase().includes(query);
  });
});

function testCaseTagColor(status: string): string {
  if (status === 'success') {
    return 'success';
  }
  if (status === 'failed') {
    return 'error';
  }
  if (status === 'aborted') {
    return 'warning';
  }
  return 'default';
}

/** Pin `getColumnNameFromEntityLink`: `::columns::<name>` in the link. */
function columnNameOf(entityLink: string | undefined): string | undefined {
  if (!entityLink || !entityLink.includes('::columns::')) {
    return undefined;
  }
  const after = entityLink.split('::columns::')[1] ?? '';
  const name = after.split('::')[0] ?? '';
  return name || undefined;
}

function testCaseDetailLocation(id: string | undefined) {
  if (!id || !router.hasRoute('quality-test-case')) {
    return null;
  }
  return { name: 'quality-test-case', params: { id } };
}
</script>

<template>
  <div data-testid="explore-preview-data-quality">
    <!-- Pin `DataQualityTab` renders a PermissionPlaceholder without
         `hasViewTests`; the tab itself still mounts (same pattern as
         the Custom Properties tab). -->
    <PermissionPlaceholder
      v-if="!canView"
      :permission-value="t('label.view-entity', { entity: t('asset.tabs.testCases') })"
    />
    <template v-else>
      <div class="preview-dq__subtabs">
        <Button
          type="text"
          size="small"
          :class="{ 'preview-dq__subtab--active': activeSubTab === 'testCases' }"
          data-testid="preview-dq-subtab-test-cases"
          @click="activeSubTab = 'testCases'"
        >
          {{ t('asset.tabs.testCases') }} ({{ counts.total }})
        </Button>
        <Button
          type="text"
          size="small"
          :class="{ 'preview-dq__subtab--active': activeSubTab === 'incidents' }"
          data-testid="preview-dq-subtab-incidents"
          @click="activeSubTab = 'incidents'"
        >
          {{ t('asset.tabs.incidents') }} ({{ incidentCounts.total }})
        </Button>
      </div>
      <template v-if="activeSubTab === 'testCases'">
        <Spin v-if="loading" data-testid="preview-dq-loading" />
        <template v-else>
          <!-- Pin `DataQualitySection` (isDataQualityTab): the status
               counts double as the filter. -->
          <div class="preview-dq__filters">
            <Button
              v-for="filter in (['success', 'failed', 'aborted'] as const)"
              :key="filter"
              type="text"
              size="small"
              :class="{ 'preview-dq__filter--active': activeFilter === filter }"
              :data-testid="`preview-dq-filter-${filter}`"
              @click="activeFilter = filter"
            >
              {{ t(`label.${filter}`) }} ({{ counts[filter] }})
            </Button>
          </div>
          <Input
            v-model:value="searchText"
            :placeholder="t('label.search-for-type', { type: t('asset.tabs.testCases') })"
            data-testid="searchbar"
          />
          <Empty
            v-if="filteredTestCases.length === 0"
            data-testid="preview-dq-empty"
            :description="t('label.no-data-found')"
          />
          <ul v-else class="preview-dq__list">
            <li
              v-for="testCase in filteredTestCases"
              :key="testCase.id"
              class="preview-dq__card"
              :data-testid="`preview-test-case-${testCase.id}`"
            >
              <div class="preview-dq__card-head">
                <router-link
                  v-if="testCaseDetailLocation(testCase.id)"
                  :to="testCaseDetailLocation(testCase.id)!"
                >
                  {{ testCase.displayName || testCase.name }}
                </router-link>
                <span v-else>{{ testCase.displayName || testCase.name }}</span>
                <Tag :color="testCaseTagColor(statusOf(testCase))">
                  {{ testCase.testCaseResult?.testCaseStatus ?? testCase.testCaseStatus ?? '—' }}
                </Tag>
              </div>
              <dl class="preview-dq__details">
                <div v-if="columnNameOf(testCase.entityLink)" class="preview-dq__detail">
                  <dt>{{ t('label.column') }}</dt>
                  <dd>{{ columnNameOf(testCase.entityLink) }}</dd>
                </div>
                <div v-if="testCase.incidentId" class="preview-dq__detail">
                  <dt>{{ t('asset.tabs.incidents') }}</dt>
                  <dd>
                    <Tag color="warning">{{ incidentStatusLabel(t, 'Assigned') }}</Tag>
                  </dd>
                </div>
              </dl>
            </li>
          </ul>
        </template>
      </template>
      <template v-else>
        <Spin v-if="incidentsLoading" data-testid="preview-dq-incidents-loading" />
        <template v-else>
          <div class="preview-dq__filters">
            <Button
              v-for="filter in (['new', 'ack', 'assigned', 'resolved'] as const)"
              :key="filter"
              type="text"
              size="small"
              :class="{ 'preview-dq__filter--active': activeIncidentFilter === filter }"
              :data-testid="`preview-dq-incident-filter-${filter}`"
              @click="activeIncidentFilter = filter"
            >
              {{ incidentStatusLabel(t, INCIDENT_FILTER_STATUS[filter]) }} ({{ incidentCounts[filter] }})
            </Button>
          </div>
          <Input
            v-model:value="searchText"
            :placeholder="t('label.search-for-type', { type: t('asset.tabs.testCases') })"
            data-testid="searchbar"
          />
          <Empty
            v-if="filteredIncidents.length === 0"
            data-testid="preview-dq-incidents-empty"
            :description="t('label.no-data-found')"
          />
          <ul v-else class="preview-dq__list">
            <li
              v-for="incident in filteredIncidents"
              :key="incident.id"
              class="preview-dq__card"
              :data-testid="`preview-incident-${incident.id}`"
            >
              <div class="preview-dq__card-head">
                <router-link
                  v-if="testCaseDetailLocation(incident.testCaseReference?.id)"
                  :to="testCaseDetailLocation(incident.testCaseReference?.id)!"
                >
                  {{
                    incident.testCaseReference?.displayName || incident.testCaseReference?.name || '—'
                  }}
                </router-link>
                <span v-else>{{
                  incident.testCaseReference?.displayName || incident.testCaseReference?.name || '—'
                }}</span>
                <Tag color="warning">
                  {{ incidentStatusLabel(t, incident.testCaseResolutionStatusType) }}
                </Tag>
              </div>
              <dl class="preview-dq__details">
                <div class="preview-dq__detail">
                  <dt>{{ t('observability.incidents.severity') }}</dt>
                  <dd>{{ incident.severity || t('observability.incidents.noSeverity') }}</dd>
                </div>
                <div class="preview-dq__detail">
                  <dt>{{ t('observability.incidents.assignee') }}</dt>
                  <dd>
                    {{
                      incident.testCaseResolutionStatusDetails?.assignee?.displayName ||
                      incident.testCaseResolutionStatusDetails?.assignee?.name ||
                      t('observability.incidents.noAssignee')
                    }}
                  </dd>
                </div>
              </dl>
            </li>
          </ul>
        </template>
      </template>
    </template>
  </div>
</template>

<style scoped>
.preview-dq__subtabs,
.preview-dq__filters {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-bottom: 8px;
}
.preview-dq__subtab--active,
.preview-dq__filter--active {
  color: var(--sm-color-primary);
  font-weight: 500;
}
.preview-dq__list {
  margin: 8px 0 0;
  padding: 0;
  list-style: none;
}
.preview-dq__card {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-bottom: 8px;
  padding: 8px;
  border: 1px solid var(--sm-border-secondary);
  border-radius: var(--sm-border-radius);
}
.preview-dq__card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  font-size: 13px;
}
.preview-dq__details {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin: 0;
}
.preview-dq__detail {
  display: flex;
  gap: 8px;
  font-size: 12px;
}
.preview-dq__detail dt {
  color: var(--sm-text-tertiary);
}
.preview-dq__detail dd {
  margin: 0;
}
</style>
