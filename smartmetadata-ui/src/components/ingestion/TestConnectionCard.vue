<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue';
import { Alert, Button, Modal, Progress, Spin, Tooltip } from 'ant-design-vue';
import { useI18n } from 'vue-i18n';
import {
  createTestConnectionWorkflow,
  deleteTestConnectionWorkflow,
  getTestConnectionDefinition,
  getTestConnectionWorkflow,
  isTestConnectionComplete,
  triggerTestConnectionWorkflow,
  type TestConnectionDefinitionStep,
} from '@/api/testConnections';
import {
  computeConnectionTestFlags,
  resolveCompletionStatus,
  shouldTestConnection,
  TEST_CONNECTION_POLL_MS,
  TEST_CONNECTION_PROGRESS,
  TEST_CONNECTION_TIMEOUT_MS,
  type TestConnectionStatus,
} from '@/ingestion/connectionTest';
import type { ServiceKind, TestConnectionStepResult } from '@/types/ingestion';

/**
 * Port of official TestConnection (pin a3012259ca), wired to the
 * fork's existing testConnections API (definition fetch, workflow
 * create/trigger/poll/delete). Usable from both the edit view and
 * the create wizard: the parent supplies the connection through
 * getConnection (the stored-shape `connection` object,
 * `{config: {...}}`, as ServiceDetailView passes it) and the
 * orchestrator availability as a boolean.
 *
 * State machine, verbatim from pin: the card title/description
 * follow testing/ready/verified/failed states; the button reads
 * Test Connection until a run completes, then Re-test Connection;
 * View opens the details dialog; a stale result is discarded once
 * the form data changes after a run; the workflow is deleted on
 * completion, trigger failure, error, and unmount; polling runs
 * every 2s with a 3-minute timeout that leaves the workflow in
 * place and says so. Warning runs (required steps pass, optional
 * steps fail) report success to the parent.
 */
const props = withDefaults(
  defineProps<{
    connectionType: string;
    kind: ServiceKind;
    serviceName: string;
    getConnection: () => Record<string, unknown> | undefined;
    /** Orchestrator availability (pin useAirflowStatus); the view computes it. */
    airflowAvailable: boolean;
    isTestingDisabled?: boolean;
    showDetails?: boolean;
    missingRequiredFieldsCount?: number;
    isFormValidationPending?: boolean;
    shouldValidateForm?: boolean;
    onValidateFormRequiredFields?: () => boolean;
    hostIp?: string;
    pollIntervalMs?: number;
    timeoutMs?: number;
    testId?: string;
  }>(),
  {
    isTestingDisabled: false,
    showDetails: true,
    missingRequiredFieldsCount: 0,
    isFormValidationPending: false,
    shouldValidateForm: true,
    onValidateFormRequiredFields: undefined,
    hostIp: undefined,
    pollIntervalMs: TEST_CONNECTION_POLL_MS,
    timeoutMs: TEST_CONNECTION_TIMEOUT_MS,
    testId: 'test-connection',
  },
);

const emit = defineEmits<{
  /** Pin onTestConnectionStatusChange: true for Successful and Warning runs. */
  'status-change': [successful: boolean];
}>();

const { t } = useI18n();

const isTestingConnection = ref(false);
const dialogOpen = ref(false);
const message = ref(t('forms.testConnection.testBeforeCreating'));
const errorMessage = ref('');
const definitionSteps = ref<TestConnectionDefinitionStep[]>([]);
const stepResults = ref<TestConnectionStepResult[]>([]);
const currentWorkflowId = ref<string | undefined>(undefined);
const testStatus = ref<TestConnectionStatus>(undefined);
const progress = ref<number>(TEST_CONNECTION_PROGRESS.zero);
const isConnectionTimeout = ref(false);

let runId = 0;
let intervalId: ReturnType<typeof setInterval> | undefined;
let timeoutId: ReturnType<typeof setTimeout> | undefined;
let resolvePoll: (() => void) | undefined;
let lastTestedSnapshot: string | undefined;

const allowTestConn = computed(() => shouldTestConnection(props.connectionType));
const flags = computed(() =>
  computeConnectionTestFlags(
    isTestingConnection.value,
    props.isTestingDisabled,
    props.isFormValidationPending,
    allowTestConn.value,
    props.airflowAvailable,
    testStatus.value,
    props.missingRequiredFieldsCount,
  ),
);

const buttonTooltipTitle = computed(() =>
  props.airflowAvailable
    ? t('forms.testConnection.test')
    : t('forms.testConnection.clientUnavailable'),
);

const cardTitle = computed(() => {
  if (!props.airflowAvailable) {
    return t('forms.testConnection.clientUnavailable');
  }
  if (isTestingConnection.value) {
    return t('forms.testConnection.testing');
  }
  if (flags.value.isReadyToTestCard) {
    return t('forms.testConnection.readyToTest');
  }
  if (testStatus.value === 'Successful') {
    return t('forms.testConnection.verified');
  }
  if (testStatus.value) {
    return message.value;
  }
  return t('forms.testConnection.testToContinue');
});

const cardDescription = computed(() => {
  if (!props.airflowAvailable) {
    return t('forms.testConnection.configureAirflow');
  }
  if (isTestingConnection.value) {
    return t('forms.testConnection.testingMayTakeTwoMinutes');
  }
  if (testStatus.value === 'Successful') {
    return t('forms.testConnection.readyCount', {
      count: stepResults.value.filter((step) => step.passed).length,
    });
  }
  if (testStatus.value) {
    return t('forms.testConnection.viewDetails');
  }
  if (props.missingRequiredFieldsCount > 0) {
    return props.missingRequiredFieldsCount === 1
      ? t('forms.testConnection.fillOneRequired')
      : t('forms.testConnection.fillRequired', { count: props.missingRequiredFieldsCount });
  }
  return t('forms.testConnection.unlocksNextStep');
});

const buttonLabel = computed(() =>
  testStatus.value && !isTestingConnection.value
    ? t('forms.testConnection.retest')
    : t('forms.testConnection.test'),
);

const alertType = computed<'success' | 'error' | 'warning' | 'info'>(() => {
  if (testStatus.value === 'Successful') {
    return 'success';
  }
  if (testStatus.value === 'Failed') {
    return 'error';
  }
  if (testStatus.value === 'Warning') {
    return 'warning';
  }
  return 'info';
});

function stableSnapshot(value: unknown): string {
  return JSON.stringify(value, (_key, item) => {
    if (item && typeof item === 'object' && !Array.isArray(item)) {
      return Object.fromEntries(
        Object.keys(item as Record<string, unknown>)
          .sort()
          .map((key) => [key, (item as Record<string, unknown>)[key]]),
      );
    }
    return item;
  });
}

function clearTimers(): void {
  clearInterval(intervalId);
  clearTimeout(timeoutId);
  intervalId = undefined;
  timeoutId = undefined;
}

function resetState(): void {
  currentWorkflowId.value = undefined;
  stepResults.value = [];
  testStatus.value = undefined;
  isConnectionTimeout.value = false;
  progress.value = TEST_CONNECTION_PROGRESS.zero;
  emit('status-change', false);
}

async function deleteWorkflow(workflowId: string | undefined): Promise<void> {
  if (!workflowId) {
    return;
  }
  try {
    await deleteTestConnectionWorkflow(workflowId);
  } catch {
    // Pin swallows delete failures; the workflow is best-effort cleanup.
  }
  if (currentWorkflowId.value === workflowId) {
    currentWorkflowId.value = undefined;
  }
}

function snapshotConnection(): string | undefined {
  const data = props.getConnection();
  return data === undefined ? undefined : stableSnapshot(data);
}

// Discard a stale test result once the form data has changed since
// the last test run (pin's every-render comparison, as a watcher on
// the connection snapshot the parent's getter reads).
watch(snapshotConnection, (snapshot) => {
  if (!testStatus.value || isTestingConnection.value) {
    return;
  }
  if (snapshot !== lastTestedSnapshot) {
    resetState();
  }
});

// An edit made DURING a run is invisible to the snapshot watcher
// (it skips while testing), so re-check when the run settles — pin's
// effect discards the result on the first render after testing ends.
watch(isTestingConnection, (testing) => {
  if (!testing && testStatus.value && snapshotConnection() !== lastTestedSnapshot) {
    resetState();
  }
});

async function runTest(): Promise<void> {
  isTestingConnection.value = true;
  emit('status-change', false);
  message.value = t('forms.testConnection.testingMayTakeTwoMinutes');
  resetState();
  clearTimers();
  const thisRun = ++runId;
  const rawFormData = props.getConnection();
  lastTestedSnapshot = rawFormData === undefined ? undefined : stableSnapshot(rawFormData);

  try {
    // Pin converts ANY definition-fetch failure to the
    // cannot-be-triggered message; the raw error never surfaces.
    let steps: TestConnectionDefinitionStep[];
    try {
      steps = await getTestConnectionDefinition(props.connectionType);
    } catch {
      throw new Error(t('forms.testConnection.cannotBeTriggered'));
    }
    if (steps.length === 0) {
      throw new Error(t('forms.testConnection.cannotBeTriggered'));
    }
    definitionSteps.value = steps;
    dialogOpen.value = true;
    progress.value = TEST_CONNECTION_PROGRESS.ten;

    const workflow = await createTestConnectionWorkflow({
      serviceName: props.serviceName,
      kind: props.kind,
      connectionType: props.connectionType,
      connection: (rawFormData ?? {}) as Record<string, unknown>,
    });
    currentWorkflowId.value = workflow.id;
    progress.value = TEST_CONNECTION_PROGRESS.twenty;

    try {
      await triggerTestConnectionWorkflow(workflow.id);
    } catch (error) {
      await deleteWorkflow(workflow.id);
      throw error;
    }
    progress.value = TEST_CONNECTION_PROGRESS.forty;

    timeoutId = setTimeout(() => {
      if (thisRun !== runId) {
        return;
      }
      clearInterval(intervalId);
      intervalId = undefined;
      let timeoutMessage = t('forms.testConnection.takingTooLong', {
        serviceType: props.connectionType,
      });
      if (props.hostIp) {
        timeoutMessage += t('forms.testConnection.takingTooLongWithIp', { ip: props.hostIp });
      }
      message.value = timeoutMessage;
      isConnectionTimeout.value = true;
      isTestingConnection.value = false;
      progress.value = TEST_CONNECTION_PROGRESS.hundred;
      emit('status-change', false);
      resolvePoll?.();
      resolvePoll = undefined;
    }, props.timeoutMs);

    await new Promise<void>((resolve, reject) => {
      resolvePoll = resolve;
      intervalId = setInterval(async () => {
        if (thisRun !== runId) {
          resolve();
          return;
        }
        progress.value += TEST_CONNECTION_PROGRESS.one;
        try {
          const current = await getTestConnectionWorkflow(workflow.id);
          if (thisRun !== runId) {
            resolve();
            return;
          }
          stepResults.value = current.response?.steps ?? [];
          if (!isTestConnectionComplete(current.status)) {
            return;
          }
          const outcome = resolveCompletionStatus(
            current.response?.status === 'Successful',
            current.response?.steps ?? [],
            definitionSteps.value,
          );
          testStatus.value = outcome.status;
          message.value = t(outcome.messageKey);
          emit('status-change', outcome.successful);
          progress.value = TEST_CONNECTION_PROGRESS.hundred;
          clearTimers();
          isTestingConnection.value = false;
          await deleteWorkflow(workflow.id);
          resolvePoll = undefined;
          resolve();
        } catch (error) {
          if (thisRun !== runId) {
            resolve();
            return;
          }
          reject(error as Error);
        }
      }, props.pollIntervalMs);
    });
    resolvePoll = undefined;
  } catch (error) {
    if (thisRun !== runId) {
      return;
    }
    progress.value = TEST_CONNECTION_PROGRESS.hundred;
    clearTimers();
    isTestingConnection.value = false;
    message.value = t('forms.testConnection.failed');
    testStatus.value = 'Failed';
    emit('status-change', false);
    errorMessage.value =
      error instanceof Error ? error.message : t('forms.testConnection.failed');
    await deleteWorkflow(currentWorkflowId.value);
  }
}

function handleTestConnection(): void {
  if (props.shouldValidateForm) {
    errorMessage.value = '';
    if (props.onValidateFormRequiredFields?.()) {
      void runTest();
    }
  } else {
    void runTest();
  }
}

onUnmounted(() => {
  clearTimers();
  runId += 1;
  resolvePoll?.();
  resolvePoll = undefined;
  void deleteWorkflow(currentWorkflowId.value);
});
</script>

<template>
  <div :data-testid="testId">
    <Alert
      v-if="showDetails"
      :type="alertType"
      show-icon
      :data-testid="`test-connection-card-${testStatus ?? 'ready-to-test'}`"
    >
      <template #message>{{ cardTitle }}</template>
      <template #description>
        <div class="test-connection-description" data-testid="message-container">
          <span>{{ cardDescription }}</span>
          <Button
            v-if="testStatus || isTestingConnection"
            type="link"
            size="small"
            data-testid="test-connection-details-btn"
            @click="dialogOpen = true"
          >
            {{ t('crud.view') }}
          </Button>
        </div>
      </template>
      <template #action>
        <Tooltip :title="buttonTooltipTitle">
          <Button
            :type="flags.isReadyToTestCard ? 'primary' : 'default'"
            :disabled="flags.isTestConnectionDisabled"
            :loading="isTestingConnection"
            data-testid="test-connection-btn"
            @click="handleTestConnection"
          >
            {{ buttonLabel }}
          </Button>
        </Tooltip>
      </template>
    </Alert>
    <Tooltip v-else :title="buttonTooltipTitle">
      <Button
        type="primary"
        size="small"
        :disabled="flags.isTestConnectionDisabled"
        :loading="isTestingConnection"
        data-testid="test-connection-button"
        @click="handleTestConnection"
      >
        {{ t('forms.testConnection.test') }}
      </Button>
    </Tooltip>

    <Modal
      :open="dialogOpen"
      :title="t('forms.testConnection.connectionStatus')"
      :footer="null"
      :destroy-on-close="true"
      :data-testid="`${testId}-details-modal`"
      @cancel="dialogOpen = false"
    >
      <div v-if="isTestingConnection" class="test-connection-modal-testing">
        <Spin />
        <Progress :percent="Math.min(progress, 100)" />
      </div>
      <Alert
        v-if="isConnectionTimeout"
        type="warning"
        show-icon
        :message="t('forms.testConnection.connectionTimeout')"
        :description="message"
        style="margin-bottom: 12px"
      />
      <Alert
        v-if="errorMessage"
        type="error"
        show-icon
        :message="errorMessage"
        style="margin-bottom: 12px"
      />
      <div v-if="stepResults.length > 0" class="test-connection-steps">
        <div
          v-for="step in stepResults"
          :key="step.name"
          class="test-connection-step"
          :data-testid="`${testId}-step-${step.name}`"
        >
          <span
            :class="[
              'test-connection-step-status',
              step.passed ? 'passed' : 'failed',
            ]"
          >
            {{ step.passed ? '✓' : '✗' }}
          </span>
          <div class="test-connection-step-text">
            <div>{{ step.name }}</div>
            <div v-if="step.message" class="test-connection-step-message">{{ step.message }}</div>
            <pre v-if="step.errorLog" class="test-connection-step-log">{{ step.errorLog }}</pre>
          </div>
        </div>
      </div>
      <div class="test-connection-modal-footer">
        <Button
          v-if="isConnectionTimeout || testStatus === 'Failed'"
          type="primary"
          @click="handleTestConnection"
        >
          {{ t('forms.testConnection.tryAgain') }}
        </Button>
        <Button @click="dialogOpen = false">{{ t('crud.close') }}</Button>
      </div>
    </Modal>
  </div>
</template>

<style scoped>
.test-connection-description {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
}

.test-connection-modal-testing {
  display: flex;
  flex-direction: column;
  gap: 12px;
  align-items: center;
  margin-bottom: 12px;
}

.test-connection-steps {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.test-connection-step {
  display: flex;
  gap: 8px;
  align-items: flex-start;
}

.test-connection-step-status {
  font-weight: 700;
}

.test-connection-step-status.passed {
  color: var(--sm-color-success);
}

.test-connection-step-status.failed {
  color: var(--sm-color-error);
}

.test-connection-step-text {
  min-width: 0;
  flex: 1;
}

.test-connection-step-message {
  font-size: 12px;
  color: var(--sm-text-tertiary);
}

.test-connection-step-log {
  margin: 4px 0 0;
  padding: 8px;
  overflow: auto;
  border-radius: 4px;
  background: var(--sm-bg-elevated);
  font-size: 12px;
  white-space: pre-wrap;
}

.test-connection-modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 16px;
}
</style>
