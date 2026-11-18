<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { Alert, Button, Modal, Spin, Timeline } from 'ant-design-vue';
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import {
  isTestLoginSettled,
  STAGE_LABEL_KEYS,
  toConnectionStepState,
  type ConnectionStepState,
} from '@/admin/ssoTestLogin';
import type { TestLoginResult } from '@/api/system';
import type { ConfigurationCheckState } from '@/composables/useSsoTestLogin';
import SsoTestLoginCredentialsForm from './SsoTestLoginCredentialsForm.vue';

const props = defineProps<{
  open: boolean;
  isTesting: boolean;
  isAwaitingCredentials: boolean;
  configurationCheck?: ConfigurationCheckState;
  result?: TestLoginResult;
  error?: string;
  onSubmitCredentials: (email: string, password: string) => Promise<void>;
}>();

const emit = defineEmits<{
  close: [];
}>();

const { t } = useI18n();

const isWaiting = computed(() => props.isTesting && !props.isAwaitingCredentials);
const isCheckingConfiguration = computed(() => props.configurationCheck?.status === 'running');
const isSettled = computed(() => isTestLoginSettled(props.result));

const outcome = computed(() => {
  if (!isSettled.value || !props.result) {
    return null;
  }
  const isSuccess = props.result.status === 'success';
  const description = isSuccess
    ? t('sso.testLogin.success', { email: props.result.resolvedEmail ?? '' })
    : (props.result.errors ?? []).length > 0
      ? (props.result.errors ?? []).join(' ')
      : t('sso.testLogin.failed');
  return { isSuccess, description };
});

interface TimelineRow {
  key: string;
  testId: string;
  labelKey: string;
  messages: string[];
  state: ConnectionStepState;
}

const timelineRows = computed<TimelineRow[]>(() => {
  const rows: TimelineRow[] = [];
  if (props.configurationCheck) {
    rows.push({
      key: 'configuration',
      testId: 'sso-test-login-stage-configuration',
      labelKey: 'sso.testLogin.stages.configurationChecked',
      messages: props.configurationCheck.problems,
      state: toConnectionStepState(props.configurationCheck.status, true),
    });
  }
  // A skipped stage does not apply to this protocol at all, so it is not shown.
  for (const stage of props.result?.stages ?? []) {
    if (stage.status === 'skipped') {
      continue;
    }
    rows.push({
      key: stage.stage,
      testId: `sso-test-login-stage-${stage.stage}`,
      labelKey: STAGE_LABEL_KEYS[stage.stage],
      messages: stage.message ? [stage.message] : [],
      state: toConnectionStepState(stage.status, isSettled.value),
    });
  }
  return rows;
});

const DOT_COLORS: Record<ConnectionStepState, string> = {
  queued: 'gray',
  running: 'blue',
  passed: 'green',
  failed: 'red',
  skipped: 'gray',
};

const showDomain = computed(() => {
  const domainCheck = props.result?.domainCheck;
  // The domain line matters whenever the rules are on, or whenever they rejected the identity.
  return !!domainCheck && (domainCheck.enforced || domainCheck.passed === false);
});

const domainText = computed(() => {
  const domainCheck = props.result?.domainCheck;
  const passed = domainCheck?.passed
    ? t('sso.testLogin.successHeading')
    : t('sso.testLogin.failedHeading');
  return `${domainCheck?.resolvedDomain ?? '-'} (${passed})`;
});

function onClose(): void {
  emit('close');
}

function onSubmitCredentials(email: string, password: string): void {
  void props.onSubmitCredentials(email, password);
}
</script>

<template>
  <Modal :open="props.open" :width="560" @cancel="onClose">
    <div data-testid="sso-test-login-modal">
      <div data-testid="sso-test-login-content">
        <h2>{{ t('sso.testLogin.title') }}</h2>
        <p>{{ t('sso.testLogin.description') }}</p>
        <Alert
          v-if="props.error"
          type="error"
          show-icon
          data-testid="sso-test-login-error"
          :message="t('sso.testLogin.failedHeading')"
          :description="props.error"
        />
        <Alert
          v-if="outcome"
          :type="outcome.isSuccess ? 'success' : 'error'"
          show-icon
          :data-testid="outcome.isSuccess ? 'sso-test-login-success' : 'sso-test-login-failed'"
          :message="
            outcome.isSuccess ? t('sso.testLogin.successHeading') : t('sso.testLogin.failedHeading')
          "
          :description="outcome.description"
        />
        <div v-if="isWaiting" data-testid="sso-test-login-loading">
          <Spin size="small" />
          <span>
            {{
              isCheckingConfiguration
                ? t('sso.testLogin.checkingConfiguration')
                : t('sso.testLogin.waiting')
            }}
          </span>
        </div>
        <SsoTestLoginCredentialsForm
          v-if="props.isAwaitingCredentials"
          :is-submitting="props.isTesting"
          @submit="onSubmitCredentials"
        />
        <Timeline v-if="props.result || props.configurationCheck" data-testid="sso-test-login-stages">
          <Timeline.Item
            v-for="row in timelineRows"
            :key="row.key"
            :color="DOT_COLORS[row.state]"
          >
            <div :data-testid="row.testId">
              <div>{{ t(row.labelKey) }}</div>
              <div v-for="message in row.messages" :key="message">{{ message }}</div>
              <div>{{ t(`sso.testLogin.stepState.${row.state}`) }}</div>
            </div>
          </Timeline.Item>
        </Timeline>
        <dl
          v-if="isSettled && props.result"
          class="sso-test-login__facts"
          data-testid="sso-test-login-details"
        >
          <div v-if="props.result.resolvedPrincipal">
            <dt>{{ t('sso.testLogin.identity.user') }}</dt>
            <dd>{{ props.result.resolvedPrincipal }}</dd>
          </div>
          <div v-if="props.result.resolvedEmail">
            <dt>{{ t('sso.testLogin.identity.email') }}</dt>
            <dd>{{ props.result.resolvedEmail }}</dd>
          </div>
          <div v-if="(props.result.mappedRoles ?? []).length > 0">
            <dt>{{ t('sso.testLogin.identity.roles') }}</dt>
            <dd>{{ props.result.mappedRoles?.join(', ') }}</dd>
          </div>
          <div v-if="(props.result.mappedTeams ?? []).length > 0">
            <dt>{{ t('sso.testLogin.identity.teams') }}</dt>
            <dd>{{ props.result.mappedTeams?.join(', ') }}</dd>
          </div>
          <div v-if="showDomain">
            <dt>{{ t('sso.testLogin.identity.domain') }}</dt>
            <dd>{{ domainText }}</dd>
          </div>
        </dl>
      </div>
    </div>
    <template #footer>
      <Button data-testid="sso-test-login-close" @click="onClose">
        {{ t('sso.testLogin.close') }}
      </Button>
    </template>
  </Modal>
</template>

<style scoped>
.sso-test-login__facts {
  display: grid;
  gap: 4px;
  margin-block: 12px;
}

.sso-test-login__facts div {
  display: flex;
  gap: 12px;
}

.sso-test-login__facts dt {
  min-width: 160px;
  color: var(--sm-text-secondary);
}
</style>
