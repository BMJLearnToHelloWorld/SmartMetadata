<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0 (the "License");
  you may not use this file except in compliance with the License.
  You may obtain a copy of the License at

      http://www.apache.org/licenses/LICENSE-2.0
-->
<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { Button, Form, Input, Select } from 'ant-design-vue';
import PageHeader from '@/components/shared/PageHeader.vue';
import SmState from '@/components/shared/SmState.vue';
import { fetchLoggedInUser } from '@/api/auth';
import { getResourcePermission, toOperationPermissions } from '@/api/permissions';
import { postQuery } from '@/api/queries';
import { searchAssets } from '@/api/search';
import type { SearchHit } from '@/types/api';

/**
 * Official AddQueryPage (ADD_QUERY): SQL query (required), description,
 * queryUsedIn (multi-select of other tables via table search, excluding
 * the current table). Submit payload (CreateQuery): query, description
 * if non-empty, owners [{id: currentUser.id, type: USER}], queryUsedIn
 * [{id: table.id, type: TABLE}...], queryDate now, service = first FQN
 * segment. Save is disabled without query Create permission.
 */
const props = defineProps<{ fqn: string }>();
const router = useRouter();
const { t } = useI18n();

const sql = ref('');
const description = ref('');
const selectedTables = ref<string[]>([]);
const tableOptions = ref<SearchHit[]>([]);
const saving = ref(false);
const errorMessage = ref('');
const canCreate = ref(false);
const permissionChecked = ref(false);
const userId = ref<string | undefined>(undefined);

const service = props.fqn.split('.')[0] ?? props.fqn;

async function loadPermissions(): Promise<void> {
  try {
    const [permissions, user] = await Promise.all([
      getResourcePermission('query'),
      fetchLoggedInUser().catch(() => undefined),
    ]);
    canCreate.value = toOperationPermissions(permissions).Create === true;
    userId.value = user?.id;
  } catch {
    canCreate.value = false;
  } finally {
    permissionChecked.value = true;
  }
}

async function onSearchTables(text: string): Promise<void> {
  try {
    const page = await searchAssets(text, 0, 20, { index: 'table' });
    tableOptions.value = page.hits.filter((hit) => hit.fullyQualifiedName !== props.fqn);
  } catch {
    tableOptions.value = [];
  }
}

async function onSave(): Promise<void> {
  if (!sql.value.trim()) {
    errorMessage.value = t('query.queryRequired');
    return;
  }
  saving.value = true;
  errorMessage.value = '';
  try {
    const usedIn = tableOptions.value.filter((hit) => hit.id && selectedTables.value.includes(hit.id));
    const created = await postQuery({
      query: sql.value,
      service,
      description: description.value.trim() || undefined,
      owners: userId.value ? [{ id: userId.value, type: 'user' }] : undefined,
      queryUsedIn: usedIn.map((hit) => ({ id: hit.id as string, type: 'table' })),
      queryDate: Date.now(),
    });
    await router.push({ name: 'query-full-screen', params: { fqn: props.fqn, queryId: created.id } });
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : t('crud.createFailed');
  } finally {
    saving.value = false;
  }
}

onMounted(() => {
  void loadPermissions();
});
</script>

<template>
  <div class="entity-detail">
    <PageHeader :header="t('query.addTitle')" :sub-header="t('query.addLead')" />
    <div style="margin-bottom: 16px; display: flex; gap: 8px">
      <Button data-testid="add-query-cancel" @click="router.back()">{{ t('crud.cancel') }}</Button>
      <Button
        type="primary"
        data-testid="add-query-save"
        :disabled="!permissionChecked || !canCreate || !sql.trim()"
        :loading="saving"
        @click="onSave"
      >
        {{ t('crud.save') }}
      </Button>
    </div>
    <SmState
      v-if="permissionChecked && !canCreate"
      state="error"
      test-id="add-query-no-permission"
      :error-text="t('query.createDenied')"
    />
    <Form layout="vertical" data-testid="add-query-form" style="max-width: 760px">
      <Form.Item :label="t('query.sql')" required>
        <Input.TextArea
          v-model:value="sql"
          data-testid="add-query-sql"
          :rows="10"
          :placeholder="t('query.sqlPlaceholder')"
        />
      </Form.Item>
      <Form.Item :label="t('query.description')">
        <Input.TextArea
          v-model:value="description"
          data-testid="add-query-description"
          :rows="3"
        />
      </Form.Item>
      <Form.Item :label="t('query.usedIn')">
        <Select
          v-model:value="selectedTables"
          mode="multiple"
          show-search
          data-testid="add-query-used-in"
          :filter-option="false"
          :options="
            tableOptions.map((hit) => ({
              value: hit.id,
              label: hit.displayName || hit.name || hit.fullyQualifiedName,
            }))
          "
          @search="onSearchTables"
        />
      </Form.Item>
      <SmState v-if="errorMessage" state="error" test-id="add-query-error" :error-text="errorMessage" />
    </Form>
  </div>
</template>
