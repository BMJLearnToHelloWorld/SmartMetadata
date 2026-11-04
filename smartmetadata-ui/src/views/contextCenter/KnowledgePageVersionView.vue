<!--
  Copyright 2026 SmartMetadata authors.

  Licensed under the Apache License, Version 2.0 (the "License");
  you may not use this file except in compliance with the License.
  You may obtain a copy of the License at

      http://www.apache.org/licenses/LICENSE-2.0
-->
<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute, useRouter } from 'vue-router';
import { Button, Card, Col, List, Row, Space, Tag, Typography } from 'ant-design-vue';
import type { ChangeField } from '@/api/entities';
import {
  getKnowledgePageByFqn,
  getKnowledgePageVersion,
  listKnowledgePageVersions,
  type VersionedKnowledgePage,
} from '@/api/contextCenter';
import type { EntityVersion } from '@/api/entities';
import PageHeader from '@/components/shared/PageHeader.vue';
import PageLayout from '@/components/shared/PageLayout.vue';
import SmState from '@/components/shared/SmState.vue';
import ContextCenterNav from './ContextCenterNav.vue';
import { formatEpoch } from './time';

const route = useRoute();
const router = useRouter();
const { t } = useI18n();

const fqn = computed(() => {
  const param = route.params.fqn;
  return Array.isArray(param) ? param[0] : param;
});
const versionParam = computed(() => {
  const param = route.params.version;
  return Array.isArray(param) ? param[0] : param;
});

const loading = ref(true);
const errorMessage = ref('');
const snapshot = ref<VersionedKnowledgePage | null>(null);
const versions = ref<EntityVersion[]>([]);

function renderValue(value: unknown): string {
  if (value === undefined || value === null) {
    return '—';
  }
  return typeof value === 'string' ? value : JSON.stringify(value);
}

function findChange(fields: ChangeField[] | undefined, field: string): ChangeField | undefined {
  return (fields ?? []).find((item) => item.field === field);
}

/** Mirrors official KnowledgePageVersion: displayName with its change, if any. */
const displayNameChange = computed(() => {
  const change = snapshot.value?.changeDescription;
  if (!change) {
    return null;
  }
  return findChange(change.fieldsUpdated, 'displayName') ?? null;
});

/** Mirrors official KnowledgePageVersion: the description rich-text diff, as old/new text. */
const descriptionChange = computed(() => {
  const change = snapshot.value?.changeDescription;
  if (!change) {
    return null;
  }
  return (
    findChange(change.fieldsUpdated, 'description') ??
    findChange(change.fieldsAdded, 'description') ??
    findChange(change.fieldsDeleted, 'description') ??
    null
  );
});

const classificationTags = computed(() =>
  (snapshot.value?.tags ?? []).filter((tag) => tag.source !== 'Glossary'),
);
const glossaryTags = computed(() =>
  (snapshot.value?.tags ?? []).filter((tag) => tag.source === 'Glossary'),
);

function goToArticle(): void {
  void router.push({
    name: 'context-center-article',
    params: { fqn: snapshot.value?.fullyQualifiedName ?? fqn.value },
  });
}

function goToVersion(version: number | string): void {
  void router.push({
    name: 'context-center-article-version',
    params: { fqn: fqn.value, version: String(version) },
  });
}

async function load(): Promise<void> {
  loading.value = true;
  errorMessage.value = '';
  snapshot.value = null;
  versions.value = [];
  try {
    const page = await getKnowledgePageByFqn(fqn.value);
    if (!page) {
      errorMessage.value = t('crud.loadFailed');
      return;
    }
    const [versionList, versionData] = await Promise.all([
      listKnowledgePageVersions(page.id),
      getKnowledgePageVersion(page.id, versionParam.value),
    ]);
    versions.value = versionList;
    if (!versionData) {
      errorMessage.value = t('crud.loadFailed');
      return;
    }
    snapshot.value = versionData;
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : t('crud.loadFailed');
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  void load();
});

watch(
  () => [route.params.fqn, route.params.version],
  () => {
    void load();
  },
);
</script>

<template>
  <PageLayout>
    <ContextCenterNav />
    <PageHeader
      :header="snapshot?.displayName || snapshot?.name || fqn"
      :sub-header="t('contextCenter.versionHistory')"
    />
    <SmState
      v-if="loading || errorMessage || !snapshot"
      :state="loading ? 'loading' : errorMessage ? 'error' : 'empty'"
      :error-text="errorMessage || undefined"
      :empty-text="t('contextCenter.noVersions')"
      test-id="article-version-state"
    />
    <Row v-else :gutter="16">
      <Col :xs="24" :md="17">
        <Space direction="vertical" style="width: 100%">
          <Space wrap>
            <Button data-testid="article-version-badge" @click="goToArticle">
              {{ t('contextCenter.version') }} {{ snapshot.version ?? '—' }}
            </Button>
            <Button data-testid="article-version-back" @click="goToArticle">
              {{ t('contextCenter.backToArticle') }}
            </Button>
          </Space>
          <Typography.Paragraph
            v-if="snapshot.owners && snapshot.owners.length > 0"
            data-testid="article-version-owners"
          >
            {{ t('contextCenter.owners') }}:
            {{ snapshot.owners.map((owner) => owner.displayName || owner.name).join(', ') }}
          </Typography.Paragraph>
          <Typography.Paragraph type="secondary" data-testid="article-version-meta">
            {{ t('contextCenter.updatedBy') }}: {{ snapshot.updatedBy || '' }}
            {{ formatEpoch(snapshot.updatedAt) }}
          </Typography.Paragraph>
          <Typography.Paragraph v-if="displayNameChange" data-testid="article-version-displayname-change">
            {{ t('contextCenter.changedFrom') }}:
            {{ renderValue(displayNameChange.oldValue) }}
            →
            {{ renderValue(displayNameChange.newValue) }}
          </Typography.Paragraph>
          <Space wrap>
            <span>{{ t('contextCenter.tags') }}:</span>
            <Tag v-for="tag in classificationTags" :key="tag.tagFQN">{{ tag.tagFQN }}</Tag>
            <span v-if="classificationTags.length === 0">—</span>
          </Space>
          <Space wrap>
            <span>{{ t('contextCenter.glossaryTerms') }}:</span>
            <Tag v-for="tag in glossaryTags" :key="tag.tagFQN">{{ tag.tagFQN }}</Tag>
            <span v-if="glossaryTags.length === 0">—</span>
          </Space>
          <div data-testid="article-version-description">
            <template v-if="descriptionChange">
              <Typography.Paragraph delete type="secondary">
                {{ renderValue(descriptionChange.oldValue) }}
              </Typography.Paragraph>
              <Typography.Paragraph>
                {{ renderValue(descriptionChange.newValue) }}
              </Typography.Paragraph>
            </template>
            <Typography.Paragraph v-else>
              {{ snapshot.description ?? '' }}
            </Typography.Paragraph>
          </div>
        </Space>
      </Col>
      <Col :xs="24" :md="7">
        <Card :title="t('contextCenter.versionHistory')" data-testid="article-version-timeline">
          <SmState
            v-if="versions.length === 0"
            state="empty"
            :empty-text="t('contextCenter.noVersions')"
            test-id="article-version-timeline-empty"
          />
          <List v-else :data-source="versions">
            <template #renderItem="{ item }">
              <List.Item>
                <Button
                  type="text"
                  :data-testid="`article-version-item-${String(item.version ?? '')}`"
                  :disabled="String(item.version) === versionParam"
                  @click="item.version !== undefined && goToVersion(item.version)"
                >
                  {{ t('contextCenter.version') }} {{ item.version ?? '—' }}
                  <span v-if="item.updatedBy"> · {{ item.updatedBy }}</span>
                  <span v-if="item.updatedAt"> · {{ formatEpoch(item.updatedAt) }}</span>
                </Button>
              </List.Item>
            </template>
          </List>
        </Card>
      </Col>
    </Row>
  </PageLayout>
</template>
