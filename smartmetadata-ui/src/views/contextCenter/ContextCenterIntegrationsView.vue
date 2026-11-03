<!--
  Copyright 2026 SmartMetadata authors.

  Licensed under the Apache License, Version 2.0 (the "License");
  you may not use this file except in compliance with the License.
  You may obtain a copy of the License at

      http://www.apache.org/licenses/LICENSE-2.0
-->
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { Button, Card, Col, List, Row, Typography } from 'ant-design-vue';
import PageHeader from '@/components/shared/PageHeader.vue';
import { listContextFiles } from '@/api/contextCenter';
import type { ContextFile } from '@/types/contextCenter';
import ContextCenterNav from './ContextCenterNav.vue';
import { formatEpoch } from './time';

const { t } = useI18n();
const router = useRouter();

/**
 * Official HEAD defines the /context-center/integrations route constant but
 * serves no integrations page (its own router test treats /integrations as
 * the unknown path). This page therefore shows the integration surface the
 * official schema does define: the external sources that feed context
 * files, grouped by the official SourceType enum, with their files.
 * No connect buttons are rendered: no official UI endpoint for connecting
 * a source was verified, and inventing one would be beyond official.
 */
const loading = ref(false);
const errorMessage = ref('');
const files = ref<ContextFile[]>([]);

const groups = computed(() => {
  const bySource = new Map<string, ContextFile[]>();
  for (const file of files.value) {
    const key = file.sourceType || 'Unknown';
    const list = bySource.get(key) ?? [];
    list.push(file);
    bySource.set(key, list);
  }
  return [...bySource.entries()].map(([source, items]) => ({ source, items }));
});

async function load(): Promise<void> {
  loading.value = true;
  errorMessage.value = '';
  try {
    const page = await listContextFiles({ limit: 100 });
    files.value = page.data;
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : t('crud.loadFailed');
    files.value = [];
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  void load();
});
</script>

<template>
  <div data-testid="context-center-integrations">
    <PageHeader
      :header="t('contextCenter.integrations')"
      :sub-header="t('contextCenter.integrationsLead')"
    />
    <ContextCenterNav />
    <Typography.Text v-if="errorMessage" type="danger" data-testid="integrations-error">
      {{ errorMessage }}
    </Typography.Text>
    <Row :gutter="16">
      <Col
        v-for="group in groups"
        :key="group.source"
        :span="12"
        style="margin-bottom: 16px"
      >
        <Card
          :title="`${group.source} (${group.items.length})`"
          :loading="loading"
          :data-testid="`integrations-group-${group.source}`"
        >
          <List
            :data-source="group.items"
            :locale="{ emptyText: t('contextCenter.emptyDocuments') }"
          >
            <template #renderItem="{ item }">
              <List.Item>
                <Button
                  type="link"
                  @click="router.push({ name: 'context-center-documents' })"
                >
                  {{ (item as ContextFile).displayName || (item as ContextFile).name }}
                </Button>
                <Typography.Text type="secondary">
                  {{ formatEpoch((item as ContextFile).updatedAt) }}
                </Typography.Text>
              </List.Item>
            </template>
          </List>
        </Card>
      </Col>
    </Row>
    <Typography.Paragraph
      v-if="!loading && !errorMessage && groups.length === 0"
      type="secondary"
      data-testid="integrations-empty"
    >
      {{ t('contextCenter.emptyIntegrations') }}
    </Typography.Paragraph>
  </div>
</template>
