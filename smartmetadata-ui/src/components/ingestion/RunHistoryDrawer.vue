<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { AlignLeftOutlined, PlayCircleOutlined } from '@ant-design/icons-vue';
import { Button, Drawer, message, Tooltip } from 'ant-design-vue';
import { computed, nextTick, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { listPipelineStatuses } from '@/api/ingestionPipelines';
import SmState from '@/components/shared/SmState.vue';
import { mapPipelineStatusToRun, type AgentRun } from '@/ingestion/agentsDataMapper';
import { canRunAgent, fmtNum, getAgentTypeIcon, RUN_META } from '@/ingestion/agentsUtils';
import type { Agent, AgentActionPermissions } from '@/types/ingestion';
import RunGlyph from './RunGlyph.vue';
import RunStepRow from './RunStepRow.vue';

/**
 * Run history drawer, ported from official
 * components/ServiceAgents/components/RunHistoryDrawer.component.tsx
 * + hooks/useAgentRuns.ts + utils/agentsDataMapper.ts (pin
 * a3012259ca). Runs load only while the drawer is open (limit 10),
 * raw statuses sort oldest-first, and the newest run (or the
 * initialRunId match) is selected by default. The live agent is
 * resolved from the `agents` list by FQN (design §5.12), falling
 * back to the `agent` snapshot when the list has no match yet, so
 * the Run now gate sees current state rather than the click-time
 * snapshot. The host owns the logs modal overlay: `open-logs` does
 * not close the drawer. No `fetchRuns` / `agentLinkProps` /
 * `renderRunAction` ports: the product has no second run source,
 * no agent link, and no run action.
 */
const props = withDefaults(
  defineProps<{
    agent: Agent;
    agents: Agent[];
    open: boolean;
    initialRunId?: string;
    permissions?: AgentActionPermissions;
    actionsPending?: boolean;
    actionsUnavailable?: boolean;
  }>(),
  {
    initialRunId: undefined,
    permissions: undefined,
    actionsPending: false,
    actionsUnavailable: false,
  },
);

const emit = defineEmits<{
  close: [];
  'open-logs': [agent: Agent];
  run: [agent: Agent];
}>();

const { t } = useI18n();

const RUN_HISTORY_LIMIT = 10;

/** Pin `getUtcOffsetLabel` (luxon `DateTime.local().toFormat("'UTC'ZZ")`). */
function getUtcOffsetLabel(): string {
  const offsetMinutes = -new Date().getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? '+' : '-';
  const absolute = Math.abs(offsetMinutes);
  const pad = (value: number): string => String(value).padStart(2, '0');
  return `UTC${sign}${pad(Math.floor(absolute / 60))}:${pad(absolute % 60)}`;
}

const liveAgent = computed(() => props.agents.find((a) => a.fqn === props.agent.fqn) ?? props.agent);
const agentIcon = computed(() => getAgentTypeIcon(liveAgent.value.type));
const actionsDisabled = computed(() => props.actionsPending || props.actionsUnavailable);
const showRunNow = computed(
  () => props.permissions !== undefined && canRunAgent(props.permissions, liveAgent.value),
);

const runs = ref<AgentRun[]>([]);
const isLoading = ref(false);
const selId = ref<string | undefined>(undefined);
let fetchSeq = 0;

async function fetchRuns(): Promise<void> {
  const seq = ++fetchSeq;
  isLoading.value = true;
  try {
    const response = await listPipelineStatuses(props.agent.fqn, { limit: RUN_HISTORY_LIMIT });
    if (seq !== fetchSeq) {
      return;
    }
    runs.value = [...response.data]
      .sort((a, b) => (a.timestamp ?? 0) - (b.timestamp ?? 0))
      .map(mapPipelineStatusToRun);
  } catch (error) {
    if (seq !== fetchSeq) {
      return;
    }
    message.error(error instanceof Error ? error.message : t('shared.loadFailed'));
  } finally {
    if (seq === fetchSeq) {
      isLoading.value = false;
    }
  }
}

watch(
  () => props.open,
  (open) => {
    if (open) {
      void fetchRuns();
    }
  },
  { immediate: true },
);
watch(
  () => props.agent.fqn,
  () => {
    if (props.open) {
      void fetchRuns();
    }
  },
);

watch([runs, () => props.initialRunId], () => {
  const latestRun = runs.value.at(-1);
  if (latestRun && !runs.value.some((run) => run.id === selId.value)) {
    const initialRun = props.initialRunId
      ? runs.value.find((run) => run.id === props.initialRunId)
      : undefined;
    selId.value = (initialRun ?? latestRun).id;
  }
});

const selectedRun = computed(
  () => runs.value.find((run) => run.id === selId.value) ?? runs.value.at(-1),
);
const selectedMeta = computed(() =>
  selectedRun.value ? RUN_META[selectedRun.value.status] : undefined,
);

const railRef = ref<HTMLElement | null>(null);

watch([runs, selId], async () => {
  // The rail only fits four or five of the ten cards, and the default
  // selection is the newest run — the rightmost card, outside the
  // initial scroll window. Drive `scrollLeft` directly instead of
  // `scrollIntoView`: the drawer body scrolls vertically, so
  // `scrollIntoView` would also move it vertically (pin comment).
  await nextTick();
  const rail = railRef.value;
  const card = rail?.querySelector<HTMLElement>('.run-history-drawer__card--selected');
  if (!rail || !card) {
    return;
  }
  rail.scrollLeft = card.offsetLeft - (rail.clientWidth - card.clientWidth) / 2;
});

function splitStartedAt(startedAt: string): { startDate: string; startTime?: string } {
  const [startDate, startTime] = startedAt.split(' · ');
  return { startDate, startTime };
}
</script>

<template>
  <div data-testid="run-history-drawer">
    <Drawer
      :open="open"
      :width="720"
      placement="right"
      destroy-on-close
      :closable="true"
      @close="emit('close')"
    >
      <template #title>
        <div class="run-history-drawer__header">
          <span class="run-history-drawer__icon-box">
            <component :is="agentIcon" />
          </span>
          <div class="run-history-drawer__title-block">
            <Tooltip :title="liveAgent.name">
              <div class="run-history-drawer__name">{{ liveAgent.name }}</div>
            </Tooltip>
            <div class="run-history-drawer__subtitle">
              {{ t('serviceDetail.drawer.runHistoryDetails') }}
            </div>
          </div>
          <Button
            size="small"
            :danger="liveAgent.status === 'failed'"
            :disabled="actionsDisabled"
            data-testid="raw-logs-button"
            @click="emit('open-logs', liveAgent)"
          >
            <AlignLeftOutlined />
            {{ t('serviceDetail.drawer.rawLogs') }}
          </Button>
          <Button
            v-if="showRunNow"
            type="primary"
            size="small"
            :disabled="actionsDisabled"
            data-testid="drawer-run-now-button"
            @click="emit('run', liveAgent)"
          >
            <PlayCircleOutlined />
            {{ t('serviceDetail.drawer.runNow') }}
          </Button>
        </div>
      </template>

      <div class="run-history-drawer__rail-title">
        {{ t('serviceDetail.drawer.recentRuns') }}
      </div>
      <div ref="railRef" class="run-history-drawer__rail">
        <button
          v-for="run in runs"
          :key="run.id"
          type="button"
          class="run-history-drawer__card"
          :class="{ 'run-history-drawer__card--selected': run.id === selId }"
          :style="{ '--run-color': `var(${RUN_META[run.status].colorVar})` }"
          data-testid="run-history-item"
          @click="selId = run.id"
        >
          <span class="run-history-drawer__card-bar" />
          <span class="run-history-drawer__card-status">
            <RunGlyph :size="14" :status="run.status" />
            <span class="run-history-drawer__card-status-label">
              {{ t(RUN_META[run.status].labelKey) }}
            </span>
          </span>
          <span class="run-history-drawer__card-date">
            {{ splitStartedAt(run.startedAt).startDate }}
          </span>
          <span class="run-history-drawer__card-time">
            <template v-if="splitStartedAt(run.startedAt).startTime">
              {{ splitStartedAt(run.startedAt).startTime }} ·
            </template>
            {{ t('serviceDetail.drawer.durationInMinute', { duration: run.duration }) }}
          </span>
        </button>
      </div>

      <div v-if="!selectedRun || !selectedMeta" class="run-history-drawer__no-run">
        {{
          isLoading
            ? `${t('shared.loading')}...`
            : t('serviceDetail.drawer.noRecentRuns')
        }}
      </div>
      <template v-else>
        <div class="run-history-drawer__selected-header">
          <RunGlyph :size="20" :status="selectedRun.status" />
          <div class="run-history-drawer__selected-title-block">
            <div class="run-history-drawer__selected-label">
              {{ t(selectedMeta.labelKey) }}
            </div>
            <div class="run-history-drawer__selected-sub">
              {{ selectedRun.startedAt }} ({{ getUtcOffsetLabel() }}) &middot;
              {{ t('serviceDetail.drawer.ranForDuration', { duration: selectedRun.duration }) }}
            </div>
          </div>
          <span
            class="run-history-drawer__status-pill"
            :style="{ '--run-color': `var(${selectedMeta.colorVar})` }"
            data-testid="selected-run-status"
          >
            {{ t(selectedMeta.labelKey) }}
          </span>
        </div>

        <div class="run-history-drawer__stats">
          <div class="run-history-drawer__stat" data-testid="run-stat-processed">
            <div class="run-history-drawer__stat-value">{{ fmtNum(selectedRun.totals.records) }}</div>
            <div class="run-history-drawer__stat-label">{{ t('serviceDetail.drawer.processed') }}</div>
          </div>
          <div class="run-history-drawer__stat" data-testid="run-stat-filtered">
            <div class="run-history-drawer__stat-value">{{ fmtNum(selectedRun.totals.filtered) }}</div>
            <div class="run-history-drawer__stat-label">{{ t('serviceDetail.drawer.filteredLowercase') }}</div>
          </div>
          <div class="run-history-drawer__stat" data-testid="run-stat-updated">
            <div class="run-history-drawer__stat-value">{{ fmtNum(selectedRun.totals.updated) }}</div>
            <div class="run-history-drawer__stat-label">{{ t('serviceDetail.drawer.updatedLowercase') }}</div>
          </div>
          <div class="run-history-drawer__stat" data-testid="run-stat-warnings">
            <div
              class="run-history-drawer__stat-value"
              :class="{ 'run-history-drawer__stat-value--warn': selectedRun.totals.warnings > 0 }"
            >
              {{ fmtNum(selectedRun.totals.warnings) }}
            </div>
            <div class="run-history-drawer__stat-label">{{ t('serviceDetail.drawer.warningsLowercase') }}</div>
          </div>
          <div class="run-history-drawer__stat" data-testid="run-stat-errors">
            <div
              class="run-history-drawer__stat-value"
              :class="{ 'run-history-drawer__stat-value--error': selectedRun.totals.errors > 0 }"
            >
              {{ fmtNum(selectedRun.totals.errors) }}
            </div>
            <div class="run-history-drawer__stat-label">{{ t('serviceDetail.drawer.errorsLowercase') }}</div>
          </div>
        </div>

        <div class="run-history-drawer__steps-card" data-testid="run-steps-card">
          <div
            class="run-history-drawer__steps-header"
            :class="{ 'run-history-drawer__steps-header--divided': selectedRun.steps.length > 0 }"
          >
            <span class="run-history-drawer__steps-title">{{ t('serviceDetail.drawer.steps') }}</span>
            <span class="run-history-drawer__steps-count">
              {{ selectedRun.steps.length }} {{ t('serviceDetail.drawer.stepsLowercase') }}
            </span>
          </div>
          <div v-if="selectedRun.steps.length === 0" data-testid="run-steps-empty">
            <SmState state="empty" :empty-text="t('serviceDetail.drawer.noStepsAvailable')" test-id="run-steps-empty-state" />
          </div>
          <RunStepRow
            v-for="(step, index) in selectedRun.steps"
            :key="step.name"
            :step="step"
            :is-last="index === selectedRun.steps.length - 1"
          />
        </div>
      </template>
    </Drawer>
  </div>
</template>

<style scoped>
.run-history-drawer__header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-right: 32px;
}

.run-history-drawer__icon-box {
  display: grid;
  flex-shrink: 0;
  width: 38px;
  height: 38px;
  place-items: center;
  border-radius: 12px;
  background: var(--sm-bg-secondary);
  color: var(--sm-text-secondary);
  font-size: 18px;
}

.run-history-drawer__title-block {
  flex: 1;
  min-width: 0;
}

.run-history-drawer__name {
  overflow: hidden;
  font-size: 16px;
  font-weight: 700;
  line-height: 1.2;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.run-history-drawer__subtitle {
  font-size: 12px;
  color: var(--sm-text-quaternary);
}

.run-history-drawer__rail-title {
  margin-bottom: 10px;
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--sm-text-quaternary);
}

.run-history-drawer__rail {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  padding-bottom: 4px;
}

.run-history-drawer__card {
  position: relative;
  flex-shrink: 0;
  width: 132px;
  overflow: hidden;
  padding: 10px 12px;
  border: 2px solid var(--sm-border-secondary);
  border-radius: 12px;
  background: var(--sm-bg-secondary);
  text-align: left;
  cursor: pointer;
}

.run-history-drawer__card--selected {
  border-color: var(--sm-brand);
  background: var(--sm-bg-primary);
}

.run-history-drawer__card-bar {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  width: 4px;
  background: var(--run-color);
}

.run-history-drawer__card-status {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 6px;
}

.run-history-drawer__card-status-label {
  color: var(--run-color);
  font-size: 12px;
  font-weight: 600;
  line-height: 1;
  white-space: nowrap;
}

.run-history-drawer__card-date {
  display: block;
  overflow: hidden;
  font-size: 12px;
  font-weight: 500;
  line-height: 1.3;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--sm-text-secondary);
}

.run-history-drawer__card-time {
  display: block;
  margin-top: 1px;
  font-size: 12px;
  line-height: 1.3;
  color: var(--sm-text-quaternary);
}

.run-history-drawer__no-run {
  padding: 40px 4px;
  text-align: center;
  font-size: 14px;
  color: var(--sm-text-quaternary);
}

.run-history-drawer__selected-header {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 22px;
  margin-bottom: 14px;
}

.run-history-drawer__selected-title-block {
  flex: 1;
}

.run-history-drawer__selected-label {
  font-size: 16px;
  font-weight: 700;
  line-height: 1;
}

.run-history-drawer__selected-sub {
  font-size: 12px;
  color: var(--sm-text-tertiary);
}

.run-history-drawer__status-pill {
  padding: 2px 10px;
  border-radius: var(--sm-radius-full);
  background: color-mix(in srgb, var(--run-color) 12%, transparent);
  color: var(--run-color);
  font-size: 12px;
  font-weight: 600;
}

.run-history-drawer__stats {
  display: flex;
  gap: 10px;
  margin-bottom: 22px;
}

.run-history-drawer__stat {
  flex: 1;
  padding: 12px 14px;
  border: 1px solid var(--sm-border-secondary);
  border-radius: 12px;
  background: var(--sm-bg-primary);
}

.run-history-drawer__stat-value {
  font-size: 20px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  line-height: 1.2;
  letter-spacing: -0.01em;
}

.run-history-drawer__stat-value--warn {
  color: var(--sm-color-warning-text);
}

.run-history-drawer__stat-value--error {
  color: var(--sm-color-error-text);
}

.run-history-drawer__stat-label {
  margin-top: 2px;
  font-size: 12px;
  line-height: 1.3;
  color: var(--sm-text-tertiary);
}

.run-history-drawer__steps-card {
  padding: 0 18px 4px;
  border: 1px solid var(--sm-border-secondary);
  border-radius: 16px;
  background: var(--sm-bg-primary);
}

.run-history-drawer__steps-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-top: 14px;
  padding-bottom: 10px;
}

.run-history-drawer__steps-header--divided {
  border-bottom: 1px solid var(--sm-border-secondary);
}

.run-history-drawer__steps-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--sm-text-secondary);
}

.run-history-drawer__steps-count {
  font-size: 12px;
  color: var(--sm-text-quaternary);
}
</style>
