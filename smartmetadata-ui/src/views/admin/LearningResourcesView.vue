<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
  Official Learning Center resources list (GET /v1/learning/resources).
-->
<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { Button, Card, Col, Empty, Row, Tag } from 'ant-design-vue';
import { listLearningResources } from '@/api/learningResources';
import PreferencePageShell from '@/features/settings/PreferencePageShell.vue';
import type { LearningResource } from '@/types/admin';

const { t } = useI18n();
const loading = ref(false);
const errorMessage = ref('');
const resources = ref<LearningResource[]>([]);

async function load(): Promise<void> {
  loading.value = true;
  errorMessage.value = '';
  try {
    const page = await listLearningResources({ limit: 100 });
    resources.value = page.data;
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : t('settings.learning.loadFailed');
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  void load();
});
</script>

<template>
  <PreferencePageShell
    test-id="learning-resources"
    :title="t('settings.learning.title')"
    :lead="t('settings.learning.lead')"
    :loading="loading"
    :error-message="errorMessage"
  >
    <Button style="margin-bottom: 12px" data-testid="learning-refresh" @click="load">
      {{ t('settings.learning.refresh') }}
    </Button>
    <Empty v-if="!resources.length && !loading" :description="t('settings.learning.empty')" />
    <Row v-else :gutter="[16, 16]" data-testid="learning-resource-cards">
      <Col v-for="item in resources" :key="item.id" :xs="24" :sm="12" :md="8">
        <Card :title="item.displayName || item.name" :data-testid="`learning-card-${item.name}`">
          <p>{{ item.description || '—' }}</p>
          <Tag v-if="item.resourceType">{{ item.resourceType }}</Tag>
          <div style="margin-top: 8px">
            <a
              v-if="item.source?.url"
              :href="item.source.url"
              target="_blank"
              rel="noopener noreferrer"
            >
              {{ t('settings.learning.open') }}
            </a>
          </div>
        </Card>
      </Col>
    </Row>
  </PreferencePageShell>
</template>
