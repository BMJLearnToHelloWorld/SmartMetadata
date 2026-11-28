<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
  Official TestCaseTestSuitesCard (OSS reference).
-->
<script setup lang="ts">
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { RouterLink } from 'vue-router';
import { Button, Card, Typography } from 'ant-design-vue';
import type { EntityRef } from '@/types/api';

const LIST_SIZE = 10;

const props = defineProps<{
  testSuites: EntityRef[];
}>();

const { t } = useI18n();
const showAll = ref(false);

const visibleSuites = computed(() =>
  showAll.value ? props.testSuites : props.testSuites.slice(0, LIST_SIZE),
);
const hiddenCount = computed(() => Math.max(0, props.testSuites.length - LIST_SIZE));

function suiteLabel(suite: EntityRef): string {
  return suite.displayName || suite.name || suite.fullyQualifiedName || '—';
}

function suiteTo(suite: EntityRef): string | undefined {
  const id = suite.id || suite.fullyQualifiedName || suite.name;
  return id ? `/test-suites/${encodeURIComponent(id)}` : undefined;
}
</script>

<template>
  <Card
    size="small"
    data-testid="test-suites-container"
    :title="t('label.test-suite-plural')"
  >
    <Typography.Text v-if="!testSuites.length" type="secondary">—</Typography.Text>
    <ul v-else class="tc-suites-list">
      <li v-for="suite in visibleSuites" :key="suite.id ?? suite.fullyQualifiedName ?? suite.name">
        <RouterLink v-if="suiteTo(suite)" :to="suiteTo(suite)!">{{ suiteLabel(suite) }}</RouterLink>
        <span v-else>{{ suiteLabel(suite) }}</span>
      </li>
    </ul>
    <Button
      v-if="hiddenCount > 0"
      type="link"
      size="small"
      class="tc-suites-more"
      @click="showAll = !showAll"
    >
      {{ showAll ? t('label.show-less') : t('label.plus-count-more', { count: hiddenCount }) }}
    </Button>
  </Card>
</template>

<style scoped>
.tc-suites-list {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.tc-suites-more {
  padding-left: 0;
  margin-top: 4px;
}
</style>