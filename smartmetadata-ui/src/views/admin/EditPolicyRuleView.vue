<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<!--
  Port of pages/PoliciesPage/PoliciesDetailPage/EditRulePage.tsx (03 §8.2).
  The breadcrumb's first two segments follow the §6A ruling (N-2 /
  CONFLICT-1): they go through the i18n keys, like the Add page
  (AddPolicyRuleView.vue), even though the pin Edit page hardcodes the
  English literals 'Settings'/'Policies' (EditRulePage.tsx:57-66). The
  form is reset with the selected rule merged over INITIAL_RULE; a
  missing rule yields the empty form with no error state, and submit
  still PATCHes (the map finds no match, so the rules array is
  unchanged). Replacement matches the OLD rule name, so renaming works.
  Conflicts are judged by HTTP status. No success toast.
-->
<script setup lang="ts">
import { Button, Card, Space, Spin, Typography, message } from 'ant-design-vue';
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import SmBreadcrumb, { type SmBreadcrumbItem } from '@/components/shared/SmBreadcrumb.vue';
import { ApiError } from '@/api/client';
import { getPolicyByName, patchPolicy } from '@/api/policies';
import { setFieldPatch } from '@/admin/jsonPatch';
import { getEntityName } from '@/components/shared/profilePictureUtils';
import type { AdminPolicy } from '@/types/admin';
import AccessControlRuleForm from './AccessControlRuleForm.vue';
import { getErrorText } from './accessApiErrors';
import { policyDetailLocation, resolveDetailFqn } from './accessPaths';
import { INITIAL_RULE, serializeRuleFormValue, type RuleFormValue } from './accessRuleForm';
import { toRulePatchValue } from './accessRefs';

type RuleFormHandle = {
  validate: () => Promise<boolean>;
  getRule: () => RuleFormValue;
  setRule: (rule: RuleFormValue) => void;
};

const props = defineProps<{ fqn?: string; ruleName: string }>();
const { t } = useI18n();
const router = useRouter();

const fqn = computed(() => resolveDetailFqn(props));
const policy = ref<AdminPolicy | null>(null);
const loading = ref(false);
const ruleFormRef = ref<RuleFormHandle | null>(null);

const breadcrumbItems = computed<SmBreadcrumbItem[]>(() => [
  // N-2 (§6A ruling): i18n keys, like the Add page — not the pin Edit
  // page's hardcoded 'Settings'/'Policies' literals.
  { label: t('label.setting-plural'), routeName: 'admin-settings' },
  { label: t('label.policy-plural'), routeName: 'admin-policies' },
  {
    label: getEntityName(policy.value ?? { name: '' }),
    routeName: 'admin-policy',
    routeParams: { fqn: fqn.value },
  },
  { label: props.ruleName },
]);

// The form mounts only after loading, so its first mount already carries
// the selected rule merged over INITIAL_RULE (pin reset semantics); a
// missing rule yields the empty form with no error state.
const initialRule = computed<RuleFormValue>(() => {
  const selectedRule = policy.value?.rules.find((rule) => rule.name === props.ruleName);
  return {
    ...INITIAL_RULE,
    ...selectedRule,
    description: selectedRule?.description ?? '',
    effect: selectedRule?.effect ?? 'allow',
    condition: selectedRule?.condition ?? '',
  };
});

async function fetchPolicy(): Promise<void> {
  loading.value = true;
  try {
    policy.value = await getPolicyByName(fqn.value, 'owners,location,teams,roles');
  } catch (error) {
    policy.value = null;
    message.error(getErrorText(error, t('crud.loadFailed')));
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  void fetchPolicy();
});

function handleBack(): void {
  void router.push(policyDetailLocation(fqn.value));
}

async function handleSubmit(): Promise<void> {
  const valid = await ruleFormRef.value?.validate();
  if (!valid) {
    return;
  }
  const current = policy.value;
  const ruleValue = ruleFormRef.value?.getRule();
  if (!current || !ruleValue) {
    return;
  }
  const serialized = serializeRuleFormValue(ruleValue);
  const updatedRules = current.rules.map((rule) =>
    rule.name === props.ruleName ? serialized : toRulePatchValue(rule),
  );
  try {
    const updated = await patchPolicy(
      current.id,
      setFieldPatch('/rules', current.rules, updatedRules),
    );
    if (updated) {
      handleBack();
    }
  } catch (error) {
    if (error instanceof ApiError && error.status === 409) {
      message.error(
        t('server.entity-already-exist', {
          entity: t('label.rule'),
          entityPlural: t('label.rule-lowercase-plural'),
          name: ruleValue.name,
        }),
      );
    } else {
      message.error(
        getErrorText(
          error,
          t('server.entity-updating-error', { entity: t('label.rule-lowercase') }),
        ),
      );
    }
  }
}
</script>

<template>
  <div v-if="loading" class="edit-rule-view__loading"><Spin /></div>
  <Card v-else class="edit-rule-view__card">
    <SmBreadcrumb :items="breadcrumbItems" />
    <Typography.Paragraph data-testid="edit-rule-title">
      {{ t('label.edit-entity', { entity: t('label.rule') }) }} "{{ ruleName }}"
    </Typography.Paragraph>
    <div data-testid="rule-form">
      <AccessControlRuleForm ref="ruleFormRef" :initial-rule="initialRule" />
      <Space style="display: flex; justify-content: flex-end; width: 100%">
        <Button data-testid="cancel-btn" @click="handleBack">{{ t('label.cancel') }}</Button>
        <Button type="primary" data-testid="submit-btn" @click="handleSubmit">
          {{ t('label.save') }}
        </Button>
      </Space>
    </div>
  </Card>
</template>

<style scoped>
.edit-rule-view__loading {
  display: flex;
  justify-content: center;
  padding: 48px 0;
}

.edit-rule-view__card {
  width: 800px;
  max-width: 100%;
  margin: 0 auto;
}
</style>
