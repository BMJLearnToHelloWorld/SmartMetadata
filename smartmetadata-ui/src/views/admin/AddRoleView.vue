<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<!--
  Port of pages/RolesPage/AddRolePage/AddRolePage.tsx (03 §5): a standalone
  page, never a modal. Layout mirrors ResizablePanels 0.7/0.3 with min
  widths 700/400; the resizable behaviour has no product component and is
  a shell residual. The description lives in page state behind the shared
  editor, not in the form. Policies are FQN strings (U6). No success toast.
-->
<script setup lang="ts">
import { Button, Form, Input, Select, Space, Typography, message } from 'ant-design-vue';
import { computed, onMounted, reactive, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import SmBreadcrumb, { type SmBreadcrumbItem } from '@/components/shared/SmBreadcrumb.vue';
import SmRichTextEditor from '@/components/shared/SmRichTextEditor.vue';
import { listPolicies } from '@/api/policies';
import { createRole } from '@/api/roles';
import { getErrorText, isAlreadyExistsError } from './accessApiErrors';
import { roleDetailLocation, rolesListLocation } from './accessPaths';
import { nameFieldRules } from './accessValidation';

const { t } = useI18n();
const router = useRouter();

const breadcrumbItems = computed<SmBreadcrumbItem[]>(() => [
  { label: t('label.setting-plural'), routeName: 'admin-settings' },
  { label: t('label.role-plural'), routeName: 'admin-roles' },
  { label: t('label.add-new-entity', { entity: t('label.role') }) },
]);

const formState = reactive({ name: '', policies: [] as string[] });
const description = ref('');
const saving = ref(false);
const policyOptions = ref<Array<{ value: string; label: string }>>([]);

const nameRules = computed(() => nameFieldRules(t, t('label.name')));
const policiesRules = computed(() => [
  {
    validator: (_rule: unknown, value: string[]) => {
      if (value.length > 0) {
        return Promise.resolve();
      }
      return Promise.reject(t('message.at-least-one-policy'));
    },
  },
]);

async function fetchPolicies(): Promise<void> {
  try {
    const page = await listPolicies({ limit: 100 });
    policyOptions.value = page.data.map((policy) => ({
      value: policy.fullyQualifiedName ?? policy.name,
      label: policy.displayName || policy.name,
    }));
  } catch (error) {
    message.error(getErrorText(error, t('crud.loadFailed')));
  }
}

onMounted(() => {
  void fetchPolicies();
});

async function handleSubmit(): Promise<void> {
  // Reached through the form finish event, which only fires after the
  // name and policies rules pass.
  saving.value = true;
  const data = {
    name: formState.name.trim(),
    description: description.value,
    policies: formState.policies,
  };
  try {
    const response = await createRole(data);
    if (response) {
      await router.push(roleDetailLocation(response.fullyQualifiedName ?? ''));
    }
  } catch (error) {
    if (isAlreadyExistsError(error)) {
      message.error(
        t('server.entity-already-exist', {
          entity: t('label.role'),
          entityPlural: t('label.role-lowercase-plural'),
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
  void router.push(rolesListLocation());
}
</script>

<template>
  <div class="add-role-view">
    <div class="add-role-view__main">
      <div data-testid="add-role-container">
        <SmBreadcrumb :items="breadcrumbItems" />
        <div class="add-role-view__form-wrap">
          <Typography.Paragraph data-testid="form-title">
            {{ t('label.add-new-entity', { entity: t('label.role') }) }}
          </Typography.Paragraph>
          <Form
            data-testid="role-form"
            layout="vertical"
            :model="formState"
            @finish="handleSubmit"
          >
            <Form.Item :label="t('label.name')" name="name" :rules="nameRules" required>
              <Input
                v-model:value="formState.name"
                data-testid="name"
                :placeholder="t('label.role-name')"
              />
            </Form.Item>
            <div class="add-role-view__field">
              <Typography.Text>{{ t('label.description') }}</Typography.Text>
              <div data-testid="description">
                <SmRichTextEditor
                  :initial-value="''"
                  :place-holder="t('message.write-your-description')"
                  @text-change="description = $event"
                />
              </div>
            </div>
            <Form.Item
              :label="t('label.select-a-policy')"
              name="policies"
              :rules="policiesRules"
              required
            >
              <Select
                v-model:value="formState.policies"
                mode="multiple"
                data-testid="policies"
                :options="policyOptions"
                :placeholder="t('label.select-a-policy')"
              />
            </Form.Item>
            <Space style="display: flex; justify-content: flex-end; width: 100%">
              <Button data-testid="cancel-btn" @click="handleCancel">{{ t('label.cancel') }}</Button>
              <Button type="primary" data-testid="submit-btn" :loading="saving" html-type="submit">
                {{ t('label.create') }}
              </Button>
            </Space>
          </Form>
        </div>
      </div>
    </div>
    <div class="add-role-view__side">
      <Typography.Paragraph strong>
        {{ t('label.add-entity', { entity: t('label.role') }) }}
      </Typography.Paragraph>
      <Typography.Paragraph>{{ t('message.add-role-message') }}</Typography.Paragraph>
    </div>
  </div>
</template>

<style scoped>
.add-role-view {
  display: flex;
}

.add-role-view__main {
  flex: 0.7;
  min-width: 700px;
}

.add-role-view__side {
  flex: 0.3;
  min-width: 400px;
  padding: 0 24px;
}

.add-role-view__form-wrap {
  margin-top: 16px;
}

.add-role-view__field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-bottom: 24px;
}
</style>
