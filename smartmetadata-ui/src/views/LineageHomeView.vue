<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { Button, Card, Collapse, Empty, Form, Input, Select, Typography } from 'ant-design-vue';
import LineageEntitySearch from '@/components/lineage/LineageEntitySearch.vue';
import { lineageLocation } from '@/catalog/entityRoutes';
import { lineageTargetFromTypedFqn } from '@/lineage/entry';

const router = useRouter();
const { t } = useI18n();
const entityType = ref('table');
const fqn = ref('');
const fqnPanel = ref(['fqn']);

const typeOptions = computed(() => [
  { value: 'table', label: t('explore.entity.table') },
  { value: 'topic', label: t('explore.entity.topic') },
]);

function openTarget(target: { entityType: string; fqn: string }): void {
  void router.push(lineageLocation(target.entityType, target.fqn));
}

function openTyped(): void {
  const target = lineageTargetFromTypedFqn(entityType.value, fqn.value);
  if (!target) {
    return;
  }
  openTarget(target);
}
</script>

<template>
  <Card>
    <Typography.Title :level="4">{{ t('lineage.title') }}</Typography.Title>
    <Typography.Paragraph type="secondary">{{ t('lineage.platformLead') }}</Typography.Paragraph>
    <LineageEntitySearch @select="openTarget" />
    <Collapse v-model:activeKey="fqnPanel" ghost class="lineage-home__fqn">
      <Collapse.Panel key="fqn" :header="t('lineage.openByFqn')" data-testid="lineage-home-fqn-panel">
        <Form layout="vertical" @finish="openTyped">
          <Form.Item :label="t('lineage.entityType')">
            <Select v-model:value="entityType" data-testid="lineage-home-type" :options="typeOptions" />
          </Form.Item>
          <Form.Item :label="t('lineage.fqn')">
            <Input
              v-model:value="fqn"
              data-testid="lineage-home-fqn"
              :placeholder="t('lineage.fqnPlaceholder')"
              allow-clear
            />
          </Form.Item>
          <Button type="primary" html-type="submit" data-testid="lineage-home-open" @click="openTyped">
            {{ t('lineage.open') }}
          </Button>
        </Form>
      </Collapse.Panel>
    </Collapse>
    <div class="lineage-home__canvas" data-testid="lineage-home-canvas">
      <Empty :description="t('lineage.emptyCanvas')" />
    </div>
  </Card>
</template>

<style scoped>
.lineage-home__fqn {
  margin-top: 12px;
}
.lineage-home__canvas {
  min-height: calc(100vh - 280px);
  margin-top: 12px;
  border: 1px dashed #cbd5e1;
  border-radius: 8px;
  background: #f8fafc;
  display: flex;
  align-items: center;
  justify-content: center;
}
</style>
