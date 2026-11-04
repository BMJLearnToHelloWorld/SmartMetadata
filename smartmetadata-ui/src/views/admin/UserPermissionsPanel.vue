<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { RouterLink } from 'vue-router';
import { Card, Collapse, Tag, Typography } from 'ant-design-vue';
import type { DebugPolicyInfo, PermissionDebugInfo } from '@/api/permissions';

const { t } = useI18n();

defineProps<{ info: PermissionDebugInfo }>();

/**
 * Shared rendering of one user's debug info (summary, direct roles,
 * team permissions with hierarchy, inherited permissions), each policy
 * as an expandable panel of its rules. Used by the admin permission
 * debugger (card 4) and by the own-profile "my permissions" tab, which
 * is the official AccessControlUserPermissions shape with
 * isLoggedInUser=true (debug/me) instead of another user's debug info.
 */
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
        <Card size="small" :title="t('permissionDebugger.permissionSummary')">
          <div style="display: flex; gap: 32px; flex-wrap: wrap">
            <div>
              <Typography.Text type="secondary">{{ t('permissionDebugger.totalRoles') }}</Typography.Text>
              <Typography.Title :level="3" style="margin: 0">{{ info.summary.totalRoles }}</Typography.Title>
              <Typography.Text type="secondary">
                {{ info.summary.directRoles }} {{ t('permissionDebugger.direct') }},
                {{ info.summary.inheritedRoles }} {{ t('permissionDebugger.inherited') }}
              </Typography.Text>
            </div>
            <div>
              <Typography.Text type="secondary">{{ t('permissionDebugger.policies') }}</Typography.Text>
              <Typography.Title :level="3" style="margin: 0">{{ info.summary.totalPolicies }}</Typography.Title>
              <Typography.Text type="secondary">
                {{ info.summary.totalRules }} {{ t('permissionDebugger.rules') }}
              </Typography.Text>
            </div>
            <div>
              <Typography.Text type="secondary">{{ t('permissionDebugger.teams') }}</Typography.Text>
              <Typography.Title :level="3" style="margin: 0">{{ info.summary.teamCount }}</Typography.Title>
              <Typography.Text type="secondary">
                {{ t('permissionDebugger.maxHierarchyDepth') }}: {{ info.summary.maxHierarchyDepth }}
              </Typography.Text>
            </div>
          </div>
          <div v-if="info.summary.effectiveOperations.length > 0" style="margin-top: 12px">
            <Typography.Text strong>{{ t('permissionDebugger.allowedOperations') }}:</Typography.Text>
            <div>
              <Tag v-for="op in info.summary.effectiveOperations" :key="op" color="success">{{ op }}</Tag>
            </div>
          </div>
          <div v-if="info.summary.deniedOperations.length > 0" style="margin-top: 12px">
            <Typography.Text strong>{{ t('permissionDebugger.deniedOperations') }}:</Typography.Text>
            <div>
              <Tag v-for="op in info.summary.deniedOperations" :key="op" color="error">{{ op }}</Tag>
            </div>
          </div>
        </Card>

        <Card
          v-if="info.directRoles.length > 0"
          size="small"
          :title="t('permissionDebugger.directRoles')"
          style="margin-top: 16px"
        >
          <div v-for="direct in info.directRoles" :key="direct.role.id ?? direct.role.name">
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
          v-if="info.teamPermissions.length > 0"
          size="small"
          :title="t('permissionDebugger.teamPermissions')"
          style="margin-top: 16px"
        >
          <div v-for="teamPerm in info.teamPermissions" :key="teamPerm.team.id ?? teamPerm.team.name">
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
          v-if="info.inheritedPermissions.length > 0"
          size="small"
          :title="t('permissionDebugger.inheritedPermissions')"
          style="margin-top: 16px"
        >
          <div
            v-for="inherited in info.inheritedPermissions"
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
