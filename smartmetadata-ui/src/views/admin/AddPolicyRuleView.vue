<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<!--
  Port of pages/PoliciesPage/PoliciesDetailPage/AddRulePage.tsx (03 §8.1):
  a centered 800px card with the breadcrumb inside, the shared rule form,
  and Cancel/Create. The policy is fetched by name; a fetch failure toasts
  and leaves the form usable, but submit is a no-op without a loaded
  policy (the pin would throw spreading undefined rules — a crash guard,
  not a behaviour change for any reachable state). Conflicts are judged
  by HTTP status, unlike the create pages' message match. No success toast.
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
import { serializeRuleFormValue, type RuleFormValue } from './accessRuleForm';
import { toRulePatchValue } from './accessRefs';

type RuleFormHandle = {
  validate: () => Promise<boolean>;
  getRule: () => RuleFormValue;
  setRule: (rule: RuleFormValue) => void;
};

const props = defineProps<{ fqn?: string }>();
const { t } = useI18n();
const router = useRouter();

const fqn = computed(() => resolveDetailFqn(props));
const policy = ref<AdminPolicy | null>(null);
const loading = ref(false);
const ruleFormRef = ref<RuleFormHandle | null>(null);

const breadcrumbItems = computed<SmBreadcrumbItem[]>(() => [
  { label: t('label.setting-plural'), routeName: 'admin-settings' },
  { label: t('label.policy-plural'), routeName: 'admin-policies' },
  {
    label: getEntityName(policy.value ?? { name: '' }),
    routeName: 'admin-policy',
    routeParams: { fqn: fqn.value },
  },
  { label: t('label.add-new-entity', { entity: t('label.rule') }) },
]);

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
  try {
    const updated = await patchPolicy(
      current.id,
      setFieldPatch('/rules', current.rules, [
        ...current.rules.map(toRulePatchValue),
        serialized,
      ]),
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
          t('server.create-entity-error', { entity: t('label.rule-lowercase') }),
        ),
      );
    }
  }
}
</script>

<template>
  <div v-if="loading" class="add-rule-view__loading"><Spin /></div>
  <Card v-else class="add-rule-view__card">
    <SmBreadcrumb :items="breadcrumbItems" />
    <Typography.Paragraph data-testid="add-rule-title">
      {{ t('label.add-new-entity', { entity: t('label.rule') }) }}
    </Typography.Paragraph>
    <div data-testid="rule-form">
      <AccessControlRuleForm ref="ruleFormRef" />
      <Space style="display: flex; justify-content: flex-end; width: 100%">
        <Button data-testid="cancel-btn" @click="handleBack">{{ t('label.cancel') }}</Button>
        <Button type="primary" data-testid="submit-btn" @click="handleSubmit">
          {{ t('label.create') }}
        </Button>
      </Space>
    </div>
  </Card>
</template>

<style scoped>
.add-rule-view__loading {
  display: flex;
  justify-content: center;
  padding: 48px 0;
}

.add-rule-view__card {
  width: 800px;
  max-width: 100%;
  margin: 0 auto;
}
</style>
