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
import { useRoute, useRouter } from 'vue-router';
import { Button, Card, Descriptions, Spin, Typography } from 'ant-design-vue';
import PageHeader from '@/components/shared/PageHeader.vue';
import SmState from '@/components/shared/SmState.vue';
import { getEntityPermissionById, toOperationPermissions } from '@/api/permissions';
import { getQueryById, type DataQuery } from '@/api/queries';

/**
 * Official QueryPage (QUERY_FULL_SCREEN_VIEW): permission gate via entity
 * permissions for resource QUERY by id (ViewAll || ViewBasic ||
 * ViewQueries), then renders the expanded QueryCard. Description/query
 * editing and voting are not in this view: the official page's edit and
 * vote handlers live on the table detail's query tab in this product, so
 * a full-screen edit would duplicate that surface; the view itself is
 * the official read surface.
 */
const props = defineProps<{ fqn: string; queryId: string }>();
const route = useRoute();
const router = useRouter();
const { t } = useI18n();

const loading = ref(true);
const allowed = ref(false);
const denied = ref(false);
const errorMessage = ref('');
const queryData = ref<DataQuery | null>(null);

async function load(): Promise<void> {
  const queryId = props.queryId || (route.params.queryId as string);
  loading.value = true;
  errorMessage.value = '';
  try {
    const permissions = await getEntityPermissionById('query', queryId);
    const ops = toOperationPermissions(permissions);
    if (!(ops.ViewAll || ops.ViewBasic || ops.ViewQueries)) {
      denied.value = true;
      return;
    }
    allowed.value = true;
    queryData.value = await getQueryById(queryId);
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : t('crud.loadFailed');
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  void load();
});
</script>

<template>
  <div class="entity-detail">
    <PageHeader :header="t('query.title')" :sub-header="t('query.fullScreenLead')" />
    <div style="margin-bottom: 16px">
      <Button data-testid="query-full-screen-back" @click="router.back()">{{ t('crud.back') }}</Button>
    </div>
    <Spin v-if="loading" :spinning="true" />
    <SmState
      v-else-if="denied"
      state="error"
      test-id="query-full-screen-denied"
      :error-text="t('query.viewDenied')"
    />
    <SmState
      v-else-if="errorMessage"
      state="error"
      test-id="query-full-screen-error"
      :error-text="errorMessage"
    />
    <SmState
      v-else-if="!queryData"
      state="empty"
      test-id="query-full-screen-empty"
      :empty-text="t('query.notFound')"
    />
    <Card v-else>
      <Descriptions bordered :column="1" size="small" style="margin-bottom: 16px">
        <Descriptions.Item :label="t('crud.fqn')">{{ fqn }}</Descriptions.Item>
        <Descriptions.Item :label="t('query.service')">{{ queryData.service || '—' }}</Descriptions.Item>
        <Descriptions.Item :label="t('query.votes')">
          {{
            queryData.votes
              ? t('query.voteCounts', {
                  up: queryData.votes.upVotes ?? 0,
                  down: queryData.votes.downVotes ?? 0,
                })
              : '—'
          }}
        </Descriptions.Item>
      </Descriptions>
      <Typography.Paragraph v-if="queryData.description">{{ queryData.description }}</Typography.Paragraph>
      <pre data-testid="query-full-screen-sql">{{ queryData.query ?? '' }}</pre>
      <div v-if="queryData.queryUsedIn && queryData.queryUsedIn.length > 0" style="margin-top: 16px">
        <Typography.Title :level="5">{{ t('query.usedIn') }}</Typography.Title>
        <ul>
          <li v-for="table in queryData.queryUsedIn" :key="table.id">
            {{ table.displayName || table.name || table.id }}
          </li>
        </ul>
      </div>
    </Card>
  </div>
</template>
