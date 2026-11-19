<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0 (the "License");
  you may not use this file except in compliance with the License.
  You may obtain a copy of the License at

      http://www.apache.org/licenses/LICENSE-2.0
-->
<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import type { RouteLocationRaw } from 'vue-router';
import { Button, Form, Input, Select, message } from 'ant-design-vue';
import { getPolicy, patchPolicy } from '@/api/policies';
import PageHeader from '@/components/shared/PageHeader.vue';
import SmBreadcrumb from '@/components/shared/SmBreadcrumb.vue';
import SmState from '@/components/shared/SmState.vue';
import { entityLabel } from '@/features/crud/paging';
import type { EntityBreadcrumb } from '@/features/crud/types';
import { buildSettingsBreadcrumbCatalog, toSmBreadcrumbItems } from '@/settings/breadcrumbs';
import { resolveSettingsLocation } from '@/settings/locationResolver';
import { SETTINGS_BREADCRUMB_NAMES, type SettingsTranslator } from '@/settings/registry';
import type { AdminPolicy, CreatePolicyRuleRequest } from '@/types/admin';

/**
 * Official standalone rule pages (pages/PoliciesPage/PoliciesDetailPage/
 * AddRulePage.tsx and EditRulePage.tsx): a rule is added or edited on its
 * own page, not inside the policy edit modal, and saved with patchPolicy.
 * Official builds the patch with fast-json-patch compare; this page sends
 * an explicit /rules replace op with the same end state, which keeps the
 * product free of a new patch-diff dependency.
 */
const props = defineProps<{ id: string; ruleName?: string }>();
const { t } = useI18n();
const router = useRouter();

/**
 * CONFLICT-1 (a): pin self-built four-item breadcrumb arrays, with no
 * Access Control level (pin `AddRulePage.tsx:57-80` and
 * `EditRulePage.tsx:57-78`). The default §9.1 builder cannot express
 * this shape — `policies` is an option under Access, not a §9.2 catalog
 * entry — so the array is composed here under the §9.5 exception
 * contract: resolved labels and caller-resolved locations arrive as
 * data, and nothing here reads the registry, the router, or the locale.
 * Edit's first two pin items are hard-coded English; both variants
 * resolve them through i18n keys (multilingual exception), never
 * literals. The last item stays unlinked (pin `url: ''`).
 */
function policyRuleBreadcrumbs(input: {
  /** Resolved `Settings` root label. */
  settingsLabel: string;
  /** Location of the Settings Hub (pin `getSettingPath()`). */
  settingsLocation: RouteLocationRaw;
  /** Resolved `label.policy-plural` (`Policies`). */
  policiesLabel: string;
  /** Location of the policies list (pin `getPath(POLICIES)`). */
  policiesLocation: RouteLocationRaw;
  /** Policy display name (pin `getEntityName(policy)`), empty while loading. */
  policyName: string;
  /** Location of the policy detail page (pin `getPolicyWithFqnPath(fqn)`). */
  policyLocation: RouteLocationRaw;
  /** Last crumb: the add-new-entity template label (Add) or `ruleName` (Edit). */
  lastLabel: string;
}): EntityBreadcrumb[] {
  return [
    { label: input.settingsLabel, to: input.settingsLocation },
    { label: input.policiesLabel, to: input.policiesLocation },
    { label: input.policyName, to: input.policyLocation },
    { label: input.lastLabel },
  ];
}

const settingsTranslator = ((key: string, params?: Record<string, string>) => t(key, params ?? {})) as SettingsTranslator;
const loading = ref(false);
const errorMessage = ref('');
const saving = ref(false);
const policy = ref<AdminPolicy | null>(null);
const isEdit = computed(() => props.ruleName !== undefined);
const breadcrumbItems = computed(() =>
  toSmBreadcrumbItems(
    policyRuleBreadcrumbs({
      settingsLabel: buildSettingsBreadcrumbCatalog(
        'settings.title',
        SETTINGS_BREADCRUMB_NAMES,
        settingsTranslator,
      ).settingsLabel,
      settingsLocation: resolveSettingsLocation(''),
      policiesLabel: t('admin.policies.title'),
      policiesLocation: { name: 'admin-policies' },
      policyName: entityLabel(policy.value),
      policyLocation: { name: 'admin-policy', params: { id: props.id } },
      // Add and Edit share one form; the variant is the existing
      // `ruleName` prop, the same source `isEdit` derives from: absent
      // on Add, the rule name itself on Edit (pin EditRulePage).
      lastLabel:
        props.ruleName ?? t('label.addNewEntity', { entity: t('label.rule') }),
    }),
  ),
);
const form = reactive<CreatePolicyRuleRequest>({
  name: '',
  effect: 'allow',
  operations: [],
  resources: [],
  description: '',
  condition: '',
});

function backToPolicy(): void {
  void router.push({ name: 'admin-policy', params: { id: props.id } });
}

async function load(): Promise<void> {
  loading.value = true;
  errorMessage.value = '';
  try {
    policy.value = await getPolicy(props.id);
    if (isEdit.value) {
      const rule = policy.value.rules.find((item) => item.name === props.ruleName);
      if (!rule) {
        errorMessage.value = t('admin.policies.ruleNotFound');
        return;
      }
      form.name = rule.name;
      form.effect = (rule.effect === 'deny' ? 'deny' : 'allow') as 'allow' | 'deny';
      form.operations = [...rule.operations];
      form.resources = [...rule.resources];
      form.description = rule.description ?? '';
      form.condition = rule.condition ?? '';
      form.fullyQualifiedName = rule.fullyQualifiedName;
    } else if (policy.value) {
      form.name = `${policy.value.name}Rule`;
      form.operations = ['ViewAll'];
      form.resources = ['All'];
    }
  } catch (error) {
    policy.value = null;
    errorMessage.value = error instanceof Error ? error.message : t('crud.loadFailed');
  } finally {
    loading.value = false;
  }
}

async function onSave(): Promise<void> {
  if (!policy.value) {
    return;
  }
  if (!form.name.trim() || !form.operations.length || !form.resources.length) {
    message.error(t('admin.policies.createInvalid'));
    return;
  }
  const next: CreatePolicyRuleRequest = {
    name: form.name.trim(),
    effect: form.effect,
    operations: [...form.operations],
    resources: [...form.resources],
    description: form.description?.trim() || undefined,
    condition: form.condition?.trim() || undefined,
    fullyQualifiedName: isEdit.value ? form.fullyQualifiedName : undefined,
  };
  const rules = isEdit.value
    ? policy.value.rules.map((rule) => (rule.name === props.ruleName ? next : rule))
    : [...policy.value.rules, next];
  saving.value = true;
  try {
    await patchPolicy(policy.value.id, [{ op: 'replace', path: '/rules', value: rules }]);
    message.success(
      isEdit.value
        ? t('admin.policies.ruleUpdated', { name: next.name })
        : t('admin.policies.ruleAdded', { name: next.name }),
    );
    backToPolicy();
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('crud.updateFailed'));
  } finally {
    saving.value = false;
  }
}

onMounted(() => {
  void load();
});
</script>

<template>
  <SmBreadcrumb :items="breadcrumbItems" />
  <PageHeader
    :header="isEdit ? t('admin.policies.editRuleTitle') : t('admin.policies.addRuleTitle')"
    :sub-header="t('admin.policies.ruleLead')"
    :test-id="isEdit ? 'edit-rule-title' : 'add-rule-title'"
  />
  <SmState
    v-if="loading || errorMessage"
    :state="loading ? 'loading' : 'error'"
    :error-text="errorMessage || undefined"
    show-retry
    @retry="load"
  />
  <Form v-else layout="vertical" style="max-width: 720px">
    <Form.Item :label="t('admin.policies.ruleName')">
      <Input v-model:value="form.name" data-testid="policy-rule-name" :disabled="isEdit" />
    </Form.Item>
    <Form.Item :label="t('admin.policies.effect')">
      <Select
        v-model:value="form.effect"
        data-testid="policy-rule-effect"
        :options="[
          { value: 'allow', label: t('admin.policies.effectAllow') },
          { value: 'deny', label: t('admin.policies.effectDeny') },
        ]"
      />
    </Form.Item>
    <Form.Item :label="t('admin.policies.operations')">
      <Select
        v-model:value="form.operations"
        mode="tags"
        :token-separators="[',']"
        data-testid="policy-rule-operations"
        style="width: 100%"
      />
    </Form.Item>
    <Form.Item :label="t('admin.policies.resources')">
      <Select
        v-model:value="form.resources"
        mode="tags"
        :token-separators="[',']"
        data-testid="policy-rule-resources"
        style="width: 100%"
      />
    </Form.Item>
    <Form.Item :label="t('crud.description')">
      <Input.TextArea v-model:value="form.description" data-testid="policy-rule-description" :rows="2" />
    </Form.Item>
    <Form.Item :label="t('admin.policies.condition')">
      <Input v-model:value="form.condition" data-testid="policy-rule-condition" />
    </Form.Item>
    <Button type="primary" :loading="saving" data-testid="policy-rule-save" @click="onSave">
      {{ t('crud.save') }}
    </Button>
    <Button data-testid="policy-rule-cancel" style="margin-left: 8px" @click="backToPolicy">
      {{ t('crud.cancel') }}
    </Button>
  </Form>
</template>
