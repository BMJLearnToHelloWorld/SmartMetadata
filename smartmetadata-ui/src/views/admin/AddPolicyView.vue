<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<!--
  Port of pages/PoliciesPage/AddPolicyPage/AddPolicyPage.tsx (03 §5): a
  standalone page with two forms validated together — the rule form first,
  then the name form — so every invalid field shows its error at once, and
  the save spinner only starts after both pass. No displayName/enabled
  fields, no success toast. Layout mirrors ResizablePanels 0.7/0.3 with
  min widths 700/400; resizable behaviour is a shell residual.
-->
<script setup lang="ts">
import { Button, Divider, Form, Input, Space, Typography, message } from 'ant-design-vue';
import type { FormInstance } from 'ant-design-vue';
import { computed, reactive, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import SmBreadcrumb, { type SmBreadcrumbItem } from '@/components/shared/SmBreadcrumb.vue';
import SmRichTextEditor from '@/components/shared/SmRichTextEditor.vue';
import { createPolicy } from '@/api/policies';
import type { CreatePolicyRuleRequest } from '@/types/admin';
import AccessControlRuleForm from './AccessControlRuleForm.vue';
import { getErrorText, isAlreadyExistsError } from './accessApiErrors';
import { policiesListLocation, policyDetailLocation } from './accessPaths';
import { serializeRuleFormValue, type RuleFormValue } from './accessRuleForm';
import { nameFieldRules } from './accessValidation';

type RuleFormHandle = {
  validate: () => Promise<boolean>;
  getRule: () => RuleFormValue;
  setRule: (rule: RuleFormValue) => void;
};

const { t } = useI18n();
const router = useRouter();

const breadcrumbItems = computed<SmBreadcrumbItem[]>(() => [
  { label: t('label.setting-plural'), routeName: 'admin-settings' },
  { label: t('label.policy-plural'), routeName: 'admin-policies' },
  { label: t('label.add-new-entity', { entity: t('label.policy') }) },
]);

const formState = reactive({ name: '' });
const description = ref('');
const saving = ref(false);
const nameFormRef = ref<FormInstance | null>(null);
const ruleFormRef = ref<RuleFormHandle | null>(null);

const nameRules = computed(() => nameFieldRules(t, t('label.name')));

async function handleSubmit(): Promise<void> {
  // Validate both forms so every invalid field shows its error at once.
  const ruleValid = await ruleFormRef.value?.validate();
  let nameValid = false;
  try {
    await nameFormRef.value?.validate();
    nameValid = true;
  } catch {
    nameValid = false;
  }
  if (!ruleValid || !nameValid) {
    return;
  }
  const ruleValue = ruleFormRef.value?.getRule();
  if (!ruleValue) {
    return;
  }
  const serialized = serializeRuleFormValue(ruleValue);
  const rule: CreatePolicyRuleRequest = {
    name: serialized.name,
    // The rule form effect select only offers allow/deny.
    effect: serialized.effect as 'allow' | 'deny',
    operations: serialized.operations,
    resources: serialized.resources,
    description: serialized.description,
    condition: serialized.condition,
  };
  const data = {
    name: formState.name.trim(),
    description: description.value,
    rules: [rule],
  };
  saving.value = true;
  try {
    const response = await createPolicy(data);
    if (response) {
      await router.push(policyDetailLocation(response.fullyQualifiedName ?? ''));
    }
  } catch (error) {
    if (isAlreadyExistsError(error)) {
      message.error(
        t('server.entity-already-exist', {
          entity: t('label.policy'),
          entityPlural: t('label.policy-lowercase-plural'),
          name: data.name,
        }),
      );
    } else {
      message.error(
        getErrorText(error, error instanceof Error ? error.message : t('crud.loadFailed')),
      );
    }
  } finally {
    saving.value = false;
  }
}

function handleCancel(): void {
  void router.push(policiesListLocation());
}
</script>

<template>
  <div class="add-policy-view">
    <div class="add-policy-view__main">
      <div data-testid="add-policy-container">
        <SmBreadcrumb :items="breadcrumbItems" />
        <div class="add-policy-view__form-wrap">
          <Typography.Paragraph data-testid="form-title">
            {{ t('label.add-new-entity', { entity: t('label.policy') }) }}
          </Typography.Paragraph>
          <div data-testid="policy-form">
            <Form ref="nameFormRef" layout="vertical" :model="formState">
              <Form.Item :label="t('label.name')" name="name" :rules="nameRules" required>
                <Input
                  v-model:value="formState.name"
                  data-testid="policy-name"
                  :placeholder="t('label.policy-name')"
                />
              </Form.Item>
            </Form>
            <div class="add-policy-view__field">
              <Typography.Text>{{ t('label.description') }}</Typography.Text>
              <div data-testid="description">
                <SmRichTextEditor
                  :initial-value="''"
                  :place-holder="t('message.write-your-description')"
                  @text-change="description = $event"
                />
              </div>
            </div>
            <Divider data-testid="add-rule-divider">
              {{ t('label.add-entity', { entity: t('label.rule') }) }}
            </Divider>
            <AccessControlRuleForm ref="ruleFormRef" />
            <Space style="display: flex; justify-content: flex-end; width: 100%">
              <Button data-testid="cancel-btn" @click="handleCancel">{{ t('label.cancel') }}</Button>
              <Button type="primary" data-testid="submit-btn" :loading="saving" @click="handleSubmit">
                {{ t('label.create') }}
              </Button>
            </Space>
          </div>
        </div>
      </div>
    </div>
    <div class="add-policy-view__side">
      <Typography.Paragraph strong>
        {{ t('label.add-entity', { entity: t('label.policy') }) }}
      </Typography.Paragraph>
      <Typography.Paragraph>{{ t('message.add-policy-message') }}</Typography.Paragraph>
    </div>
  </div>
</template>

<style scoped>
.add-policy-view {
  display: flex;
}

.add-policy-view__main {
  flex: 0.7;
  min-width: 700px;
}

.add-policy-view__side {
  flex: 0.3;
  min-width: 400px;
  padding: 0 24px;
}

.add-policy-view__form-wrap {
  margin-top: 16px;
}

.add-policy-view__field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-bottom: 24px;
}
</style>
