<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { defineComponent, h, ref, watch, type PropType, type VNode } from 'vue';
import { useI18n } from 'vue-i18n';
import { RouterLink, type RouteLocationRaw } from 'vue-router';
import { Card, Collapse, CollapsePanel, message, Spin, Tag, Typography } from 'ant-design-vue';
import {
  debugMyPermissions,
  debugUserPermissions,
  type DebugEntityRef,
  type DebugPolicyInfo,
  type DebugRuleInfo,
  type PermissionDebugInfo,
} from '@/api/permissions';
import { assetLocation, isDetailWired } from '@/catalog/entityRoutes';
import { policyDetailLocation, roleDetailLocation } from './accessPaths';

/**
 * Shared rendering of one user's debug info (summary, direct roles,
 * team permissions with hierarchy, inherited permissions), each policy
 * as an expandable panel of its rules. The panel fetches its own data:
 * debug/me for the logged-in user, debug/user/{username} otherwise.
 *
 * Mount correspondence (03 §10.7, verified against the pin at 392b3efd):
 * the admin permission debugger mount is official
 * AccessControlUserPermissions (AccessControlDebuggerPanel.tsx:529,
 * isLoggedInUser=false); the user detail PERMISSIONS tab mount is
 * official UserPermissions.component (Users.component.tsx:298-304).
 * The isLoggedInUser=true branch of AccessControlUserPermissions has
 * no caller in the pin tree, so the user tab is NOT that shape — an
 * earlier comment claiming it was is corrected here. Both official
 * components share the same render rules (renderRule/renderPolicy,
 * four sections, the same debug endpoints), so this single panel
 * serves both mounts with the AccessControl render rules per 03 §10.6.
 */
const props = defineProps<{ username: string; isLoggedInUser: boolean }>();

const { t } = useI18n();

const info = ref<PermissionDebugInfo | undefined>(undefined);
const loading = ref(true);

// Fetch on mount and whenever the viewed user or the logged-in flag
// changes, mirroring official AccessControlUserPermissions.tsx:159-187:
// loading restarts, stale info is cleared, and a cancelled flag (the
// watch cleanup, which also runs on unmount) suppresses late writes,
// late toasts, and late loading clears from superseded requests.
watch(
  () => [props.username, props.isLoggedInUser] as const,
  async ([username, isLoggedInUser], _previous, onCleanup) => {
    let cancelled = false;
    onCleanup(() => {
      cancelled = true;
    });
    loading.value = true;
    info.value = undefined;
    try {
      const result = isLoggedInUser
        ? await debugMyPermissions()
        : await debugUserPermissions(username);
      if (!cancelled) {
        info.value = result;
      }
    } catch (error) {
      if (!cancelled) {
        message.error(
          error instanceof Error ? error.message : t('permissionDebugger.loadFailed'),
        );
      }
    } finally {
      if (!cancelled) {
        loading.value = false;
      }
    }
  },
  { immediate: true },
);

/** Official getEntityName (EntityNameUtils.ts): displayName wins, else name. */
function getEntityName(ref: DebugEntityRef): string {
  return ref.displayName || ref.name || '';
}

/**
 * Official getEntityLink (AccessControl.utils.ts:180-191; the identical
 * local copy is UserPermissions.component.tsx:69-80): policy/role/team
 * resolve to settings detail paths, every other type to the entity
 * detail path. Keys are FQNs throughout, never ids (03 §2.1).
 *
 * Product translation under the D-11 transition (accessPaths.ts): the
 * router table still carries `:id` segments while the detail views
 * already fetch by name, so the settings links are named locations
 * carrying the FQN in the `:id` param. The team location is spelled
 * out here because accessPaths.ts has no team helper yet; move it
 * there when one lands so the router landing touches one file.
 * The entity detail branch uses the `asset` route, but only for types
 * the product wires (isDetailWired, the SearchView precedent): an
 * unwired type renders as plain text rather than a link onto the
 * asset view's honest unwired error. The one source type the server
 * emits for inherited permissions is `domain`
 * (PermissionDebugService.processOtherInheritedPermissions), which has
 * its own FQN-addressable detail route (`governance-domain`,
 * `:fqn`, fetched by name — B-9), so domain sources link there. A ref
 * without an FQN has no addressable target and likewise renders as
 * plain text.
 */
function entityLinkFor(entityType: string, fqn: string): RouteLocationRaw | null {
  if (!fqn) {
    return null;
  }
  switch (entityType) {
    case 'policy':
      return policyDetailLocation(fqn);
    case 'role':
      return roleDetailLocation(fqn);
    case 'team':
      return { name: 'admin-team', params: { id: fqn } };
    case 'domain':
      return { name: 'governance-domain', params: { fqn } };
    default:
      return isDetailWired(entityType) ? assetLocation(entityType, fqn) : null;
  }
}

/** Official ruleEffectColor (AccessControlUserPermissions.tsx:51-52). */
function ruleEffectColor(effect: string): 'success' | 'error' {
  return effect === 'ALLOW' ? 'success' : 'error';
}

/** Official policy color (AccessControlUserPermissions.tsx:102-103). */
function policyEffectColor(effect: string): 'success' | 'error' | 'warning' {
  return effect === 'ALLOW' ? 'success' : effect === 'DENY' ? 'error' : 'warning';
}

function policyPanelKey(policy: DebugPolicyInfo, index: number): string {
  return `${policy.policy.fullyQualifiedName ?? policy.policy.name}-${index}`;
}

/**
 * Shared rule rendering, the pin's renderRule
 * (AccessControlUserPermissions.tsx:54-99): name + effect badge,
 * operations badges, resources badges, `<code>` condition. One
 * function serves all four policy contexts; no context drops fields.
 * Rendered with `h()` because this single-file panel cannot share
 * template markup across its four sites without a separate component
 * file, and the pin's shared functions are render functions too.
 */
function renderRule(rule: DebugRuleInfo, index: number): VNode {
  const blocks: VNode[] = [
    h(
      'div',
      { style: 'display: flex; align-items: center; gap: 8px; flex-wrap: wrap' },
      [
        h(Typography.Text, { strong: true }, () => rule.name),
        h(Tag, { color: ruleEffectColor(rule.effect) }, () => rule.effect),
      ],
    ),
  ];
  if (rule.operations.length > 0) {
    blocks.push(
      h('div', null, [
        h(Typography.Text, { type: 'secondary' }, () => `${t('permissionDebugger.operations')}:`),
        ...rule.operations.map((op) => h(Tag, { key: op }, () => op)),
      ]),
    );
  }
  if (rule.resources.length > 0) {
    blocks.push(
      h('div', null, [
        h(Typography.Text, { type: 'secondary' }, () => `${t('permissionDebugger.resources')}:`),
        ...rule.resources.map((res) => h(Tag, { key: res }, () => res)),
      ]),
    );
  }
  if (rule.condition) {
    blocks.push(
      h('div', null, [
        h(Typography.Text, { type: 'secondary' }, () => `${t('permissionDebugger.condition')}:`),
        h(Typography.Text, { code: true }, () => rule.condition),
      ]),
    );
  }
  return h('div', { key: index, style: 'margin-top: 8px' }, blocks);
}

/**
 * Shared policy rendering, the pin's renderPolicy
 * (AccessControlUserPermissions.tsx:101-131): one accordion panel per
 * policy whose header holds the policy link, the effect badge, and the
 * rule count, with renderRule for every rule in the body. One
 * component serves all four policy contexts. The header link's click
 * must not toggle the accordion (pin: onClick stopPropagation): the
 * stop lives on the wrapper span, which cuts the same bubble before
 * it reaches the collapse header, while the link itself still
 * navigates. A policy without an FQN renders its name as plain text.
 */
const PolicyCollapse = defineComponent({
  name: 'PolicyCollapse',
  props: {
    policies: { type: Array as PropType<DebugPolicyInfo[]>, required: true },
  },
  setup(props) {
    return () =>
      h(Collapse, null, {
        default: () =>
          props.policies.map((policy, policyIndex) => {
            const link = entityLinkFor('policy', policy.policy.fullyQualifiedName ?? '');
            return h(
              CollapsePanel,
              { key: policyPanelKey(policy, policyIndex) },
              {
                header: () => [
                  h(
                    'span',
                    {
                      style:
                        'display: inline-flex; align-items: center; gap: 8px; flex-wrap: wrap',
                    },
                    [
                      link
                        ? h(
                            'span',
                            {
                              onClick: (event: MouseEvent) => event.stopPropagation(),
                            },
                            [h(RouterLink, { to: link }, () => getEntityName(policy.policy))],
                          )
                        : h('span', null, getEntityName(policy.policy)),
                      h(Tag, { color: policyEffectColor(policy.effect) }, () => policy.effect),
                      h(
                        Typography.Text,
                        { type: 'secondary' },
                        () => `${policy.rules.length} ${t('permissionDebugger.rules')}`,
                      ),
                    ],
                  ),
                ],
                default: () => policy.rules.map((rule, ruleIndex) => renderRule(rule, ruleIndex)),
              },
            );
          }),
      });
  },
});
</script>

<template>
  <div
    v-if="loading"
    data-testid="user-permissions-loading"
    style="display: flex; justify-content: center; padding: 32px 0"
  >
    <Spin />
  </div>
  <template v-else-if="info">
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
      <div
        v-for="direct in info.directRoles"
        :key="direct.role.fullyQualifiedName ?? direct.role.name"
      >
        <Typography.Paragraph>
          {{ t('permissionDebugger.role') }}:
          <RouterLink
            v-if="entityLinkFor('role', direct.role.fullyQualifiedName ?? '')"
            :to="entityLinkFor('role', direct.role.fullyQualifiedName ?? '')!"
          >
            {{ getEntityName(direct.role) }}
          </RouterLink>
          <span v-else>{{ getEntityName(direct.role) }}</span>
        </Typography.Paragraph>
        <PolicyCollapse v-if="direct.policies.length > 0" :policies="direct.policies" />
      </div>
    </Card>

    <Card
      v-if="info.teamPermissions.length > 0"
      size="small"
      :title="t('permissionDebugger.teamPermissions')"
      style="margin-top: 16px"
    >
      <div
        v-for="teamPerm in info.teamPermissions"
        :key="teamPerm.team.fullyQualifiedName ?? teamPerm.team.name"
      >
        <Typography.Paragraph>
          {{ t('permissionDebugger.team') }}:
          <RouterLink
            v-if="entityLinkFor('team', teamPerm.team.fullyQualifiedName ?? '')"
            :to="entityLinkFor('team', teamPerm.team.fullyQualifiedName ?? '')!"
          >
            {{ getEntityName(teamPerm.team) }}
          </RouterLink>
          <span v-else>{{ getEntityName(teamPerm.team) }}</span>
          <Tag style="margin-left: 8px">{{ teamPerm.teamType }}</Tag>
          <Tag v-if="teamPerm.hierarchyLevel > 0" color="warning">
            {{ t('permissionDebugger.level') }} {{ teamPerm.hierarchyLevel }} {{ t('permissionDebugger.inherited') }}
          </Tag>
        </Typography.Paragraph>
        <Typography.Paragraph v-if="teamPerm.teamHierarchy.length > 1" type="secondary">
          {{ t('permissionDebugger.hierarchy') }}:
          <span
            v-for="(team, teamIndex) in teamPerm.teamHierarchy"
            :key="team.fullyQualifiedName ?? team.name"
          >
            <RouterLink
              v-if="entityLinkFor('team', team.fullyQualifiedName ?? '')"
              :to="entityLinkFor('team', team.fullyQualifiedName ?? '')!"
            >
              {{ getEntityName(team) }}
            </RouterLink>
            <span v-else>{{ getEntityName(team) }}</span>
            <span v-if="teamIndex < teamPerm.teamHierarchy.length - 1"> → </span>
          </span>
        </Typography.Paragraph>
        <div v-if="teamPerm.rolePermissions.length > 0">
          <Typography.Text strong>{{ t('permissionDebugger.teamRoles') }}:</Typography.Text>
          <div v-for="(rolePerm, roleIndex) in teamPerm.rolePermissions" :key="roleIndex">
            <Typography.Text type="secondary">{{ t('permissionDebugger.role') }}:</Typography.Text>
            <RouterLink
              v-if="entityLinkFor('role', rolePerm.role.fullyQualifiedName ?? '')"
              :to="entityLinkFor('role', rolePerm.role.fullyQualifiedName ?? '')!"
            >
              {{ getEntityName(rolePerm.role) }}
            </RouterLink>
            <span v-else>{{ getEntityName(rolePerm.role) }}</span>
            <Tag v-if="rolePerm.isDefaultRole" color="blue" style="margin-left: 8px">
              {{ t('permissionDebugger.defaultRole') }}
            </Tag>
            <Typography.Paragraph type="secondary">
              {{ t('permissionDebugger.inheritedFrom') }}: {{ rolePerm.inheritedFrom }}
            </Typography.Paragraph>
            <PolicyCollapse v-if="rolePerm.policies.length > 0" :policies="rolePerm.policies" />
          </div>
        </div>
        <div v-if="teamPerm.directPolicies.length > 0">
          <Typography.Text strong>{{ t('permissionDebugger.directTeamPolicies') }}:</Typography.Text>
          <PolicyCollapse :policies="teamPerm.directPolicies" />
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
            v-if="entityLinkFor(inherited.source.type ?? '', inherited.source.fullyQualifiedName ?? '')"
            :to="entityLinkFor(inherited.source.type ?? '', inherited.source.fullyQualifiedName ?? '')!"
          >
            {{ getEntityName(inherited.source) }}
          </RouterLink>
          <span v-else>{{ getEntityName(inherited.source) }}</span>
        </Typography.Paragraph>
        <PolicyCollapse v-if="inherited.policies.length > 0" :policies="inherited.policies" />
      </div>
    </Card>
  </template>
</template>
