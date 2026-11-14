<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import {
  Button,
  Card,
  Dropdown,
  Menu,
  Progress,
  Skeleton,
  Space,
  Tag,
  Tooltip,
  Typography,
} from 'ant-design-vue';
import {
  AlignLeftOutlined,
  CalendarOutlined,
  ClockCircleOutlined,
  CodeOutlined,
  DatabaseOutlined,
  ExclamationCircleOutlined,
  MoreOutlined,
  PlayCircleOutlined,
  WarningOutlined,
} from '@ant-design/icons-vue';
import type { OperationPermissions } from '@/api/permissions';
import {
  agentActionPermissions,
  AGENT_STATUS_PILL,
  canRunAgent,
  fmtNum,
  formatEtaLong,
  getAgentTypeIcon,
  getAgentTypeLabelKey,
  getFinishedSuffix,
  getUnitLabelKey,
  getUnitVerbLabelKey,
  getEtaInfo,
  RUN_META,
  shouldShowLastRunMetric,
  type AgentAction,
} from '@/ingestion/agentsUtils';
import { useScheduleDescriptionTexts } from '@/ingestion/scheduleDescription';
import type { Agent, IngestionPipeline } from '@/types/ingestion';
import PipelineRowActions from '@/views/ingestion/PipelineRowActions.vue';

const props = defineProps<{
  agent: Agent;
  /** The pipeline entity behind the agent; the shared row actions operate on it. */
  pipeline: IngestionPipeline;
  /** Per-pipeline entity permission by FQN; undefined while loading denies (fail-closed). */
  ops?: OperationPermissions;
  isAdminUser: boolean;
  /** P-24: the orchestrator probe says the pipeline service is down or disabled. */
  orchestratorUnavailable: boolean;
  /** The orchestrator status fetch is still pending: actions render as a skeleton. */
  isPending: boolean;
}>();

const emit = defineEmits<{
  action: [action: AgentAction, pipeline: IngestionPipeline];
  logs: [pipeline: IngestionPipeline];
  runDetails: [agent: Agent, runId?: string];
  viewHistory: [agent: Agent];
}>();

const { t } = useI18n();

/**
 * Port of official AgentCard (openmetadata-ui, pin a3012259ca):
 * identity block, live status zone, progress bar or recent-run
 * dots, error/warning alerts, and the action row. The overflow menu
 * is the shared PipelineRowActions in its card variant — no second
 * Run/Deploy/Edit/Delete implementation — and the run-history and
 * log surfaces stay the view's existing modals and detail page.
 */
const permissions = computed(() => agentActionPermissions(props.isAdminUser, props.ops));
const showRunButton = computed(() => canRunAgent(permissions.value, props.agent));
const pill = computed(() => AGENT_STATUS_PILL[props.agent.status]);
const isPaused = computed(() => props.agent.enabled === false);
const isActive = computed(() => props.agent.status === 'running' || props.agent.status === 'queued');
const scheduleTexts = useScheduleDescriptionTexts(() => props.agent.schedule);
const showSchedule = computed(
  () => Boolean(props.agent.schedule) && scheduleTexts.value.descriptionFirstPart !== '',
);
const progressValue = computed(() => Math.max(2, Math.min(100, props.agent.pct)));
const progressColor = computed(() =>
  props.agent.status === 'failed'
    ? 'var(--sm-color-error)'
    : props.agent.status === 'success'
      ? 'var(--sm-color-success)'
      : 'var(--sm-brand)',
);
const etaText = computed(() =>
  formatEtaLong(getEtaInfo(props.agent.eta), (key, params) => t(key, params ?? {})),
);
const showLastRun = computed(() => shouldShowLastRunMetric(props.agent));
const finishedSuffix = computed(() =>
  getFinishedSuffix(props.agent, (key, params) => t(key, params ?? {})),
);
const hasAlerts = computed(() => props.agent.errors > 0 || props.agent.warnings > 0);
const unitIcon = computed(() =>
  props.agent.unit === 'queries' ? CodeOutlined : DatabaseOutlined,
);

function onToggle(pipeline: IngestionPipeline): void {
  emit('action', pipeline.enabled === false ? 'resume' : 'pause', pipeline);
}
</script>

<template>
  <Card
    :class="{
      'agent-card': true,
      'agent-card--failed': agent.status === 'failed',
      'agent-card--running': agent.status === 'running',
    }"
    :data-testid="`agent-card-${agent.fqn}`"
  >
    <Space direction="vertical" :size="8" style="width: 100%">
      <div class="agent-card__identity">
        <component :is="getAgentTypeIcon(agent.type)" class="agent-card__type-icon" />
        <div>
          <div data-testid="pipeline-name">
            <Typography.Text strong>{{ agent.name }}</Typography.Text>
          </div>
          <Typography.Text type="secondary" data-testid="pipeline-type">
            {{ t(getAgentTypeLabelKey(agent.type)) }}
          </Typography.Text>
          <div v-if="showSchedule" data-testid="agent-schedule">
            <Typography.Text type="secondary">
              {{ scheduleTexts.descriptionFirstPart }}<template v-if="scheduleTexts.descriptionSecondPart">, {{ scheduleTexts.descriptionSecondPart }}</template>
            </Typography.Text>
          </div>
        </div>
      </div>

      <div v-if="isPaused">
        <Tag data-testid="paused-pipeline-badge">{{ t('ingestion.pipelines.statusPaused') }}</Tag>
      </div>
      <div v-else class="agent-card__status">
        <Tag :color="pill.color" data-testid="pipeline-status">{{ t(pill.labelKey) }}</Tag>
        <span v-if="agent.status === 'running'" class="agent-card__metric">
          <component :is="unitIcon" />
          {{ fmtNum(agent.assets) }} {{ t(getUnitVerbLabelKey(agent.verb)) }}
        </span>
        <span v-if="agent.status === 'running' && etaText" class="agent-card__metric">
          <ClockCircleOutlined />
          {{ etaText }}
        </span>
        <span v-if="showLastRun" class="agent-card__metric">
          <component :is="unitIcon" />
          {{ fmtNum(agent.assets) }} {{ t(getUnitLabelKey(agent.unit)) }}{{ finishedSuffix }}
        </span>
        <span v-if="agent.status === 'queued' && agent.after" class="agent-card__metric">
          <CalendarOutlined />
          {{ t('ingestion.agents.startsAfter') }} {{ agent.after }}
        </span>
      </div>

      <Progress
        v-if="agent.status === 'running'"
        :percent="progressValue"
        :show-info="false"
        :stroke-color="progressColor"
        data-testid="agent-progress-bar"
      />
      <div v-else class="agent-card__runs">
        <span v-if="agent.recentRuns.length" class="agent-card__dots">
          <Tooltip
            v-for="(run, index) in agent.recentRuns"
            :key="run.id"
            :title="
              t('ingestion.agents.runStatusClickDetails', {
                status: t(RUN_META[run.status].labelKey),
              })
            "
          >
            <button
              type="button"
              class="agent-card__dot"
              :style="{
                backgroundColor: `var(${RUN_META[run.status].colorVar})`,
                opacity: index === agent.recentRuns.length - 1 ? 1 : 0.55,
              }"
              data-testid="agent-run-dot"
              @click="emit('runDetails', agent, run.id)"
            />
          </Tooltip>
        </span>
        <Button
          type="link"
          size="small"
          data-testid="view-run-history-button"
          @click="emit('viewHistory', agent)"
        >
          {{ t('ingestion.agents.viewRunHistory') }}
        </Button>
      </div>

      <div v-if="hasAlerts" class="agent-card__alerts">
        <span v-if="agent.errors > 0" data-testid="agent-errors-metric" class="agent-card__metric--error">
          <ExclamationCircleOutlined />
          {{ fmtNum(agent.errors) }} {{ t('ingestion.agents.errorPluralLowercase') }}
        </span>
        <span v-if="agent.warnings > 0" data-testid="agent-warnings-metric" class="agent-card__metric--warning">
          <WarningOutlined />
          {{ fmtNum(agent.warnings) }} {{ t('ingestion.agents.warningPluralLowercase') }}
        </span>
      </div>

      <div v-if="isPending" data-testid="agent-card-actions-skeleton">
        <Skeleton.Button active size="small" />
      </div>
      <div v-else class="agent-card__actions">
        <Button
          v-if="agent.status === 'failed'"
          data-testid="diagnose-button"
          @click="emit('runDetails', agent, undefined)"
        >
          {{ t('ingestion.agents.diagnose') }}
        </Button>
        <Button
          v-if="agent.status !== 'failed'"
          data-testid="logs-button"
          :disabled="orchestratorUnavailable"
          @click="emit('logs', pipeline)"
        >
          <AlignLeftOutlined />
          {{ t('ingestion.pipelines.logs') }}
        </Button>
        <Button
          v-if="showRunButton"
          type="primary"
          data-testid="run-agent-button"
          :disabled="orchestratorUnavailable"
          @click="emit('action', 'run', pipeline)"
        >
          <PlayCircleOutlined />
          {{ t('ingestion.pipelines.run') }}
        </Button>
        <Dropdown :trigger="['click']">
          <template #overlay>
            <Menu data-testid="actions-dropdown">
              <PipelineRowActions
                variant="card"
                :active="isActive"
                :pipeline="pipeline"
                :ops="ops"
                :is-admin-user="isAdminUser"
                :orchestrator-unavailable="orchestratorUnavailable"
                @toggle="onToggle"
                @deploy="(p) => emit('action', 'redeploy', p)"
                @edit="(p) => emit('action', 'edit', p)"
                @kill="(p) => emit('action', 'kill', p)"
                @delete="(p) => emit('action', 'delete', p)"
              />
            </Menu>
          </template>
          <Button data-testid="more-actions" :aria-label="t('ingestion.agents.moreActions')">
            <MoreOutlined />
          </Button>
        </Dropdown>
      </div>
    </Space>
  </Card>
</template>

<style scoped>
.agent-card--failed {
  border-color: var(--sm-color-error);
}

.agent-card--running {
  border-left: 3px solid var(--sm-brand);
}

.agent-card__identity {
  display: flex;
  gap: 12px;
  align-items: flex-start;
}

.agent-card__type-icon {
  font-size: 20px;
  margin-top: 2px;
}

.agent-card__status,
.agent-card__runs,
.agent-card__alerts,
.agent-card__actions {
  display: flex;
  gap: 12px;
  align-items: center;
  flex-wrap: wrap;
}

.agent-card__metric--error {
  color: var(--sm-color-error);
}

.agent-card__metric--warning {
  color: var(--sm-color-warning);
}

.agent-card__dots {
  display: inline-flex;
  gap: 6px;
}

.agent-card__dot {
  width: 10px;
  height: 10px;
  padding: 0;
  border: none;
  border-radius: 50%;
  cursor: pointer;
}
</style>
