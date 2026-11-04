<!--
  Copyright 2026 SmartMetadata authors.

  Licensed under the Apache License, Version 2.0 (the "License");
  you may not use this file except in compliance with the License.
  You may obtain a copy of the License at

      http://www.apache.org/licenses/LICENSE-2.0
-->
<script setup lang="ts">
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { RouterLink } from 'vue-router';
import {
  Alert,
  Button,
  Card,
  Collapse,
  Input,
  Select,
  Spin,
  Tag,
  Typography,
} from 'ant-design-vue';
import ForbiddenView from '@/views/shell/ForbiddenView.vue';
import PageHeader from '@/components/shared/PageHeader.vue';
import PageLayout from '@/components/shared/PageLayout.vue';
import { searchAssets } from '@/api/search';
import {
  PERMISSION_DEBUG_OPERATIONS,
  PERMISSION_DEBUG_RESOURCES,
  debugEvaluatePermission,
  debugUserPermissions,
  type DebugPolicyInfo,
  type PermissionDebugInfo,
  type PermissionEvaluationDebugInfo,
} from '@/api/permissions';
import { useAuthStore } from '@/stores/auth';

const { t } = useI18n();
const authStore = useAuthStore();

/**
 * Official AdminPermissionDebugger + AccessControlDebuggerPanel +
 * AccessControlUserPermissions, in product style:
 *
 * Card 1 selects a user (search-as-you-type over the user index, the
 * official SearchIndex.USER call, pageSize 10, label "displayName
 * (name)"); Card 2 evaluates one operation for that user (resource /
 * operation selects from the official curated constants, optional
 * resource FQN-or-id); Card 3 renders the step-by-step evaluation;
 * Card 4 renders the user's debug info (summary, direct roles, team
 * permissions with hierarchy, inherited permissions), each policy as
 * an expandable panel of its rules.
 *
 * Gate: the route lives under /admin, so the router guard already
 * denies non-admins; the view repeats the admin line itself (the
 * R-4 marketplace-detail precedent) so a direct mount still forbids.
 * The server additionally enforces admin for other-user debug info
 * (403), which surfaces as an error, never as empty data.
 *
 * One presentational adaptation, recorded not silent: official picks
 * the user from a combobox dropdown; this page renders the same
 * debounced user-index search as an input plus a clickable results
 * list, which keeps the flow testable without dropdown internals.
 */
const isAdmin = computed(() => authStore.user?.isAdmin === true);

interface UserOption {
  value: string;
  label: string;
}

const searchText = ref('');
const userOptions = ref<UserOption[]>([]);
const searchingUsers = ref(false);
const selectedUsername = ref('');
let searchTimer: ReturnType<typeof setTimeout> | undefined;

function onSearchUser(value: string): void {
  searchText.value = value;
  if (searchTimer !== undefined) {
    clearTimeout(searchTimer);
  }
  if (!value.trim()) {
    userOptions.value = [];
    return;
  }
  searchTimer = setTimeout(() => {
    void runUserSearch(value.trim());
  }, 300);
}

async function runUserSearch(query: string): Promise<void> {
  searchingUsers.value = true;
  try {
    const page = await searchAssets(query, 0, 10, { index: 'user' });
    userOptions.value = page.hits.map((hit) => ({
      value: hit.name,
      label: hit.displayName ? `${hit.displayName} (${hit.name})` : hit.name,
    }));
  } catch {
    userOptions.value = [];
  } finally {
    searchingUsers.value = false;
  }
}

function onSelectUser(username: string): void {
  selectedUsername.value = username;
  evaluationInfo.value = null;
  evaluationError.value = '';
  void loadUserPermissions(username);
}

// --- Card 4: user permissions -------------------------------------------

const userInfo = ref<PermissionDebugInfo | null>(null);
const loadingUserInfo = ref(false);
const userInfoError = ref('');

async function loadUserPermissions(username: string): Promise<void> {
  loadingUserInfo.value = true;
  userInfoError.value = '';
  try {
    const info = await debugUserPermissions(username);
    if (selectedUsername.value === username) {
      userInfo.value = info;
    }
  } catch (error) {
    if (selectedUsername.value === username) {
      userInfoError.value =
        error instanceof Error ? error.message : t('permissionDebugger.loadFailed');
      userInfo.value = null;
    }
  } finally {
    if (selectedUsername.value === username) {
      loadingUserInfo.value = false;
    }
  }
}

// --- Cards 2-3: evaluation ----------------------------------------------

const formResource = ref<string | undefined>(undefined);
const formOperation = ref<string | undefined>(undefined);
const formResourceId = ref('');
const formErrors = ref<{ resource?: string; operation?: string }>({});
const evaluating = ref(false);
const evaluationInfo = ref<PermissionEvaluationDebugInfo | null>(null);
const evaluationError = ref('');
let evaluationRequestId = 0;

const resourceOptions = PERMISSION_DEBUG_RESOURCES.map((value) => ({
  value,
  label: value,
}));
const operationOptions = PERMISSION_DEBUG_OPERATIONS.map((value) => ({
  value,
  label: value,
}));

async function handleEvaluate(): Promise<void> {
  if (!selectedUsername.value) {
    return;
  }
  const errors: { resource?: string; operation?: string } = {};
  if (!formResource.value) {
    errors.resource = t('permissionDebugger.fieldRequired', {
      field: t('permissionDebugger.resource'),
    });
  }
  if (!formOperation.value) {
    errors.operation = t('permissionDebugger.fieldRequired', {
      field: t('permissionDebugger.operation'),
    });
  }
  formErrors.value = errors;
  if (errors.resource || errors.operation) {
    return;
  }
  const requestId = ++evaluationRequestId;
  evaluating.value = true;
  evaluationError.value = '';
  try {
    const info = await debugEvaluatePermission({
      user: selectedUsername.value,
      resource: formResource.value ?? '',
      resourceId: formResourceId.value.trim() || undefined,
      operation: formOperation.value ?? '',
    });
    if (requestId === evaluationRequestId) {
      evaluationInfo.value = info;
    }
  } catch (error) {
    if (requestId === evaluationRequestId) {
      evaluationError.value =
        error instanceof Error ? error.message : t('permissionDebugger.evaluateFailed');
      evaluationInfo.value = null;
    }
  } finally {
    if (requestId === evaluationRequestId) {
      evaluating.value = false;
    }
  }
}

function detailRouteFor(source: {
  type?: string;
  id?: string;
}): { name: string; params: { id: string } } | null {
  if (!source.id) {
    return null;
  }
  if (source.type === 'team') {
    return { name: 'admin-team', params: { id: source.id } };
  }
  if (source.type === 'role') {
    return { name: 'admin-role', params: { id: source.id } };
  }
  if (source.type === 'policy') {
    return { name: 'admin-policy', params: { id: source.id } };
  }
  return null;
}

function policyPanelKey(policy: DebugPolicyInfo, index: number): string {
  return `${policy.policy.id ?? policy.policy.name}-${index}`;
}
</script>

<template>
  <ForbiddenView v-if="!isAdmin" />
  <PageLayout v-else test-id="permission-debugger">
    <PageHeader
      :header="t('permissionDebugger.title')"
      :sub-header="t('permissionDebugger.lead')"
      test-id="permission-debugger-title"
    />

    <Card data-testid="permission-debugger-user-card">
      <Typography.Title :level="5">{{ t('permissionDebugger.selectUser') }}</Typography.Title>
      <Input
        v-model:value="searchText"
        :placeholder="t('permissionDebugger.searchUsersPlaceholder')"
        data-testid="permission-debugger-user-search"
        style="width: 100%; max-width: 480px"
        @update:value="onSearchUser"
      />
      <Spin v-if="searchingUsers" size="small" style="margin-left: 8px" />
      <div v-if="userOptions.length > 0" style="margin-top: 8px">
        <Button
          v-for="option in userOptions"
          :key="option.value"
          type="text"
          :data-testid="`permission-debugger-user-option-${option.value}`"
          @click="onSelectUser(option.value)"
        >
          {{ option.label }}
        </Button>
      </div>
      <Typography.Paragraph v-if="selectedUsername" type="secondary">
        {{ t('permissionDebugger.selectedUser') }}: <strong>{{ selectedUsername }}</strong>
      </Typography.Paragraph>
    </Card>

    <Card data-testid="permission-debugger-evaluate-card" style="margin-top: 16px">
      <Typography.Title :level="5">{{ t('permissionDebugger.evaluatePermission') }}</Typography.Title>
      <Typography.Paragraph v-if="!selectedUsername" type="secondary">
        {{ t('permissionDebugger.selectUserFirst') }}
      </Typography.Paragraph>
      <div v-else style="display: flex; flex-wrap: wrap; gap: 16px; align-items: flex-start">
        <div style="min-width: 200px">
          <Typography.Text type="secondary">{{ t('permissionDebugger.resource') }} *</Typography.Text>
          <Select
            v-model:value="formResource"
            :options="resourceOptions"
            :placeholder="t('permissionDebugger.selectResource')"
            data-testid="permission-debugger-resource"
            style="width: 100%"
            @change="formErrors = { ...formErrors, resource: undefined }"
          />
          <Typography.Text v-if="formErrors.resource" type="danger">
            {{ formErrors.resource }}
          </Typography.Text>
        </div>
        <div style="min-width: 200px">
          <Typography.Text type="secondary">{{ t('permissionDebugger.operation') }} *</Typography.Text>
          <Select
            v-model:value="formOperation"
            :options="operationOptions"
            :placeholder="t('permissionDebugger.selectOperation')"
            data-testid="permission-debugger-operation"
            style="width: 100%"
            @change="formErrors = { ...formErrors, operation: undefined }"
          />
          <Typography.Text v-if="formErrors.operation" type="danger">
            {{ formErrors.operation }}
          </Typography.Text>
        </div>
        <div style="min-width: 260px">
          <Typography.Text type="secondary">
            {{ t('permissionDebugger.resourceId') }} ({{ t('permissionDebugger.optional') }})
          </Typography.Text>
          <Input
            v-model:value="formResourceId"
            :placeholder="t('permissionDebugger.resourceIdPlaceholder')"
            data-testid="permission-debugger-resource-id"
          />
        </div>
      </div>
      <Button
        v-if="selectedUsername"
        type="primary"
        :loading="evaluating"
        :disabled="!formResource || !formOperation"
        data-testid="permission-debugger-evaluate"
        style="margin-top: 16px"
        @click="handleEvaluate"
      >
        {{ t('permissionDebugger.evaluate') }}
      </Button>
      <Alert
        v-if="evaluationError"
        type="error"
        :message="evaluationError"
        data-testid="permission-debugger-evaluate-error"
        style="margin-top: 16px"
      />
    </Card>

    <Card
      v-if="evaluationInfo"
      data-testid="permission-debugger-evaluation-result"
      style="margin-top: 16px"
    >
      <Alert
        :type="evaluationInfo.allowed ? 'success' : 'error'"
        :message="t('permissionDebugger.decision')"
        :description="`${t('permissionDebugger.user')} ${evaluationInfo.user.name} ${t('permissionDebugger.is')} ${evaluationInfo.allowed ? t('permissionDebugger.allowed') : t('permissionDebugger.denied')} ${t('permissionDebugger.toPerform')} ${evaluationInfo.operation} ${t('permissionDebugger.on')} ${evaluationInfo.resource}${evaluationInfo.resourceId ? ` (${evaluationInfo.resourceId})` : ''}`"
      />
      <Typography.Paragraph type="secondary" style="margin-top: 12px">
        {{ t('permissionDebugger.policiesEvaluated') }}: {{ evaluationInfo.summary.totalPoliciesEvaluated }}
        · {{ t('permissionDebugger.rulesEvaluated') }}: {{ evaluationInfo.summary.totalRulesEvaluated }}
        · {{ t('permissionDebugger.matchingRules') }}: {{ evaluationInfo.summary.matchingRules }}
        · {{ t('permissionDebugger.allowRules') }}: {{ evaluationInfo.summary.allowRules }}
        · {{ t('permissionDebugger.denyRules') }}: {{ evaluationInfo.summary.denyRules }}
        · {{ t('permissionDebugger.timeMs', { milliseconds: evaluationInfo.summary.evaluationTimeMs }) }}
      </Typography.Paragraph>
      <Typography.Title :level="5">{{ t('permissionDebugger.evaluationSteps') }}:</Typography.Title>
      <Card
        v-for="step in evaluationInfo.evaluationSteps"
        :key="step.stepNumber"
        size="small"
        style="margin-bottom: 8px"
      >
        <Typography.Paragraph>
          {{ t('permissionDebugger.step') }} {{ step.stepNumber }}:
          <strong>{{ step.policy.name }}</strong>
          - {{ t('permissionDebugger.rule') }}: {{ step.rule }}
        </Typography.Paragraph>
        <Typography.Paragraph type="secondary">
          {{ t('permissionDebugger.source') }}: {{ step.source }} ({{ step.sourceEntity.name }})
        </Typography.Paragraph>
        <Typography.Paragraph type="secondary">
          {{ t('permissionDebugger.effect') }}:
          <Tag :color="step.effect.toUpperCase() === 'ALLOW' ? 'success' : 'error'">{{ step.effect }}</Tag>
        </Typography.Paragraph>
        <Typography.Paragraph type="secondary">
          {{ t('permissionDebugger.matched') }}:
          <strong>{{ step.matched ? t('permissionDebugger.yes') : t('permissionDebugger.no') }}</strong>
        </Typography.Paragraph>
        <Typography.Paragraph type="secondary">{{ step.matchReason }}</Typography.Paragraph>
        <div v-if="step.conditionEvaluations.length > 0">
          <Typography.Text type="secondary">{{ t('permissionDebugger.conditions') }}:</Typography.Text>
          <div v-for="cond in step.conditionEvaluations" :key="cond.condition">
            <Typography.Text code>{{ cond.condition }}</Typography.Text>
            <Typography.Text type="secondary">
              → {{ cond.result ? t('permissionDebugger.trueValue') : t('permissionDebugger.falseValue') }}
              ({{ cond.evaluationDetails }})
            </Typography.Text>
          </div>
        </div>
      </Card>
      <div v-if="evaluationInfo.summary.reasonsForDecision.length > 0">
        <Typography.Title :level="5">{{ t('permissionDebugger.reasonsForDecision') }}:</Typography.Title>
        <Typography.Paragraph
          v-for="reason in evaluationInfo.summary.reasonsForDecision"
          :key="reason"
          type="secondary"
        >
          • {{ reason }}
        </Typography.Paragraph>
      </div>
    </Card>

    <Card
      v-if="selectedUsername"
      data-testid="permission-debugger-user-permissions"
      style="margin-top: 16px"
    >
      <Typography.Title :level="5">
        {{ t('permissionDebugger.permissionsFor') }} {{ selectedUsername }}
      </Typography.Title>
      <Spin v-if="loadingUserInfo" data-testid="permission-debugger-user-loading" />
      <Alert
        v-else-if="userInfoError"
        type="error"
        :message="userInfoError"
        data-testid="permission-debugger-user-error"
      />
      <template v-else-if="userInfo">
        <Card size="small" :title="t('permissionDebugger.permissionSummary')">
          <div style="display: flex; gap: 32px; flex-wrap: wrap">
            <div>
              <Typography.Text type="secondary">{{ t('permissionDebugger.totalRoles') }}</Typography.Text>
              <Typography.Title :level="3" style="margin: 0">{{ userInfo.summary.totalRoles }}</Typography.Title>
              <Typography.Text type="secondary">
                {{ userInfo.summary.directRoles }} {{ t('permissionDebugger.direct') }},
                {{ userInfo.summary.inheritedRoles }} {{ t('permissionDebugger.inherited') }}
              </Typography.Text>
            </div>
            <div>
              <Typography.Text type="secondary">{{ t('permissionDebugger.policies') }}</Typography.Text>
              <Typography.Title :level="3" style="margin: 0">{{ userInfo.summary.totalPolicies }}</Typography.Title>
              <Typography.Text type="secondary">
                {{ userInfo.summary.totalRules }} {{ t('permissionDebugger.rules') }}
              </Typography.Text>
            </div>
            <div>
              <Typography.Text type="secondary">{{ t('permissionDebugger.teams') }}</Typography.Text>
              <Typography.Title :level="3" style="margin: 0">{{ userInfo.summary.teamCount }}</Typography.Title>
              <Typography.Text type="secondary">
                {{ t('permissionDebugger.maxHierarchyDepth') }}: {{ userInfo.summary.maxHierarchyDepth }}
              </Typography.Text>
            </div>
          </div>
          <div v-if="userInfo.summary.effectiveOperations.length > 0" style="margin-top: 12px">
            <Typography.Text strong>{{ t('permissionDebugger.allowedOperations') }}:</Typography.Text>
            <div>
              <Tag v-for="op in userInfo.summary.effectiveOperations" :key="op" color="success">{{ op }}</Tag>
            </div>
          </div>
          <div v-if="userInfo.summary.deniedOperations.length > 0" style="margin-top: 12px">
            <Typography.Text strong>{{ t('permissionDebugger.deniedOperations') }}:</Typography.Text>
            <div>
              <Tag v-for="op in userInfo.summary.deniedOperations" :key="op" color="error">{{ op }}</Tag>
            </div>
          </div>
        </Card>

        <Card
          v-if="userInfo.directRoles.length > 0"
          size="small"
          :title="t('permissionDebugger.directRoles')"
          style="margin-top: 16px"
        >
          <div v-for="direct in userInfo.directRoles" :key="direct.role.id ?? direct.role.name">
            <Typography.Paragraph>
              {{ t('permissionDebugger.role') }}:
              <RouterLink
                v-if="detailRouteFor(direct.role)"
                :to="detailRouteFor(direct.role)!"
              >
                {{ direct.role.displayName || direct.role.name }}
              </RouterLink>
              <span v-else>{{ direct.role.displayName || direct.role.name }}</span>
            </Typography.Paragraph>
            <Collapse v-if="direct.policies.length > 0">
              <Collapse.Panel
                v-for="(policy, policyIndex) in direct.policies"
                :key="policyPanelKey(policy, policyIndex)"
                :header="`${policy.policy.displayName || policy.policy.name} (${policy.rules.length} ${t('permissionDebugger.rules')})`"
              >
                <Tag :color="policy.effect === 'ALLOW' ? 'success' : policy.effect === 'DENY' ? 'error' : 'warning'">
                  {{ policy.effect }}
                </Tag>
                <div v-for="(rule, ruleIndex) in policy.rules" :key="ruleIndex" style="margin-top: 8px">
                  <Typography.Text strong>{{ rule.name }}</Typography.Text>
                  <Tag :color="rule.effect === 'ALLOW' ? 'success' : 'error'" style="margin-left: 8px">
                    {{ rule.effect }}
                  </Tag>
                  <div v-if="rule.operations.length > 0">
                    <Typography.Text type="secondary">{{ t('permissionDebugger.operations') }}:</Typography.Text>
                    <Tag v-for="op in rule.operations" :key="op">{{ op }}</Tag>
                  </div>
                  <div v-if="rule.resources.length > 0">
                    <Typography.Text type="secondary">{{ t('permissionDebugger.resources') }}:</Typography.Text>
                    <Tag v-for="res in rule.resources" :key="res">{{ res }}</Tag>
                  </div>
                  <div v-if="rule.condition">
                    <Typography.Text type="secondary">{{ t('permissionDebugger.condition') }}:</Typography.Text>
                    <Typography.Text code>{{ rule.condition }}</Typography.Text>
                  </div>
                </div>
              </Collapse.Panel>
            </Collapse>
          </div>
        </Card>

        <Card
          v-if="userInfo.teamPermissions.length > 0"
          size="small"
          :title="t('permissionDebugger.teamPermissions')"
          style="margin-top: 16px"
        >
          <div v-for="teamPerm in userInfo.teamPermissions" :key="teamPerm.team.id ?? teamPerm.team.name">
            <Typography.Paragraph>
              {{ t('permissionDebugger.team') }}:
              <RouterLink
                v-if="detailRouteFor(teamPerm.team)"
                :to="detailRouteFor(teamPerm.team)!"
              >
                {{ teamPerm.team.displayName || teamPerm.team.name }}
              </RouterLink>
              <span v-else>{{ teamPerm.team.displayName || teamPerm.team.name }}</span>
              <Tag style="margin-left: 8px">{{ teamPerm.teamType }}</Tag>
              <Tag v-if="teamPerm.hierarchyLevel > 0" color="warning">
                {{ t('permissionDebugger.level') }} {{ teamPerm.hierarchyLevel }} {{ t('permissionDebugger.inherited') }}
              </Tag>
            </Typography.Paragraph>
            <Typography.Paragraph v-if="teamPerm.teamHierarchy.length > 1" type="secondary">
              {{ t('permissionDebugger.hierarchy') }}:
              <span v-for="(team, teamIndex) in teamPerm.teamHierarchy" :key="team.id ?? team.name">
                {{ team.displayName || team.name }}
                <span v-if="teamIndex < teamPerm.teamHierarchy.length - 1"> → </span>
              </span>
            </Typography.Paragraph>
            <div v-if="teamPerm.rolePermissions.length > 0">
              <Typography.Text strong>{{ t('permissionDebugger.teamRoles') }}:</Typography.Text>
              <div v-for="(rolePerm, roleIndex) in teamPerm.rolePermissions" :key="roleIndex">
                <Typography.Text type="secondary">{{ t('permissionDebugger.role') }}:</Typography.Text>
                <RouterLink
                  v-if="detailRouteFor(rolePerm.role)"
                  :to="detailRouteFor(rolePerm.role)!"
                >
                  {{ rolePerm.role.displayName || rolePerm.role.name }}
                </RouterLink>
                <span v-else>{{ rolePerm.role.displayName || rolePerm.role.name }}</span>
                <Tag v-if="rolePerm.isDefaultRole" color="blue" style="margin-left: 8px">
                  {{ t('permissionDebugger.defaultRole') }}
                </Tag>
                <Typography.Paragraph type="secondary">
                  {{ t('permissionDebugger.inheritedFrom') }}: {{ rolePerm.inheritedFrom }}
                </Typography.Paragraph>
                <Collapse v-if="rolePerm.policies.length > 0">
                  <Collapse.Panel
                    v-for="(policy, policyIndex) in rolePerm.policies"
                    :key="policyPanelKey(policy, policyIndex)"
                    :header="`${policy.policy.displayName || policy.policy.name} (${policy.rules.length} ${t('permissionDebugger.rules')})`"
                  >
                    <Tag :color="policy.effect === 'ALLOW' ? 'success' : policy.effect === 'DENY' ? 'error' : 'warning'">
                      {{ policy.effect }}
                    </Tag>
                    <div v-for="(rule, ruleIndex) in policy.rules" :key="ruleIndex" style="margin-top: 8px">
                      <Typography.Text strong>{{ rule.name }}</Typography.Text>
                      <Tag :color="rule.effect === 'ALLOW' ? 'success' : 'error'" style="margin-left: 8px">
                        {{ rule.effect }}
                      </Tag>
                      <div v-if="rule.operations.length > 0">
                        <Typography.Text type="secondary">{{ t('permissionDebugger.operations') }}:</Typography.Text>
                        <Tag v-for="op in rule.operations" :key="op">{{ op }}</Tag>
                      </div>
                      <div v-if="rule.resources.length > 0">
                        <Typography.Text type="secondary">{{ t('permissionDebugger.resources') }}:</Typography.Text>
                        <Tag v-for="res in rule.resources" :key="res">{{ res }}</Tag>
                      </div>
                      <div v-if="rule.condition">
                        <Typography.Text type="secondary">{{ t('permissionDebugger.condition') }}:</Typography.Text>
                        <Typography.Text code>{{ rule.condition }}</Typography.Text>
                      </div>
                    </div>
                  </Collapse.Panel>
                </Collapse>
              </div>
            </div>
            <div v-if="teamPerm.directPolicies.length > 0">
              <Typography.Text strong>{{ t('permissionDebugger.directTeamPolicies') }}:</Typography.Text>
              <Collapse>
                <Collapse.Panel
                  v-for="(policy, policyIndex) in teamPerm.directPolicies"
                  :key="policyPanelKey(policy, policyIndex)"
                  :header="`${policy.policy.displayName || policy.policy.name} (${policy.rules.length} ${t('permissionDebugger.rules')})`"
                >
                  <Tag :color="policy.effect === 'ALLOW' ? 'success' : policy.effect === 'DENY' ? 'error' : 'warning'">
                    {{ policy.effect }}
                  </Tag>
                  <div v-for="(rule, ruleIndex) in policy.rules" :key="ruleIndex" style="margin-top: 8px">
                    <Typography.Text strong>{{ rule.name }}</Typography.Text>
                    <Tag :color="rule.effect === 'ALLOW' ? 'success' : 'error'" style="margin-left: 8px">
                      {{ rule.effect }}
                    </Tag>
                  </div>
                </Collapse.Panel>
              </Collapse>
            </div>
          </div>
        </Card>

        <Card
          v-if="userInfo.inheritedPermissions.length > 0"
          size="small"
          :title="t('permissionDebugger.inheritedPermissions')"
          style="margin-top: 16px"
        >
          <div
            v-for="inherited in userInfo.inheritedPermissions"
            :key="`${inherited.permissionType}-${inherited.source?.id ?? 'none'}`"
          >
            <Typography.Paragraph>
              {{ t('permissionDebugger.type') }}:
              <Tag>{{ inherited.permissionType }}</Tag>
            </Typography.Paragraph>
            <Typography.Paragraph>{{ inherited.description }}</Typography.Paragraph>
            <Typography.Paragraph v-if="inherited.source" type="secondary">
              {{ t('permissionDebugger.source') }}:
              <RouterLink
                v-if="detailRouteFor(inherited.source)"
                :to="detailRouteFor(inherited.source)!"
              >
                {{ inherited.source.displayName || inherited.source.name }}
              </RouterLink>
              <span v-else>{{ inherited.source.displayName || inherited.source.name }}</span>
            </Typography.Paragraph>
            <Collapse v-if="inherited.policies.length > 0">
              <Collapse.Panel
                v-for="(policy, policyIndex) in inherited.policies"
                :key="policyPanelKey(policy, policyIndex)"
                :header="`${policy.policy.displayName || policy.policy.name} (${policy.rules.length} ${t('permissionDebugger.rules')})`"
              >
                <Tag :color="policy.effect === 'ALLOW' ? 'success' : policy.effect === 'DENY' ? 'error' : 'warning'">
                  {{ policy.effect }}
                </Tag>
                <div v-for="(rule, ruleIndex) in policy.rules" :key="ruleIndex" style="margin-top: 8px">
                  <Typography.Text strong>{{ rule.name }}</Typography.Text>
                  <Tag :color="rule.effect === 'ALLOW' ? 'success' : 'error'" style="margin-left: 8px">
                    {{ rule.effect }}
                  </Tag>
                </div>
              </Collapse.Panel>
            </Collapse>
          </div>
        </Card>
      </template>
    </Card>
  </PageLayout>
</template>
