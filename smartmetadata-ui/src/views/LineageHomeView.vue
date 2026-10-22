<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { Button, Card, Form, Input, Select, Typography } from 'ant-design-vue';
import { lineageLocation } from '@/catalog/entityRoutes';

const router = useRouter();
const entityType = ref('table');
const fqn = ref('');

const typeOptions = [
  { value: 'table', label: 'Table' },
  { value: 'topic', label: 'Topic' },
];

function open(): void {
  const trimmed = fqn.value.trim();
  if (!trimmed) {
    return;
  }
  void router.push(lineageLocation(entityType.value, trimmed));
}
</script>

<template>
  <Card>
    <Typography.Title :level="4">Lineage</Typography.Title>
    <Typography.Paragraph type="secondary">
      Open a table or topic graph via GET /api/v1/lineage/{entity}/name/{fqn}. Prefer the
      <strong>View lineage</strong> action on an asset detail page when you already have a catalog
      hit.
    </Typography.Paragraph>
    <Form layout="vertical" @finish="open">
      <Form.Item label="Entity type">
        <Select v-model:value="entityType" data-testid="lineage-home-type" :options="typeOptions" />
      </Form.Item>
      <Form.Item label="Fully qualified name">
        <Input
          v-model:value="fqn"
          data-testid="lineage-home-fqn"
          placeholder="service.database.schema.table"
          allow-clear
        />
      </Form.Item>
      <Button type="primary" html-type="submit" data-testid="lineage-home-open" @click="open">
        Open lineage
      </Button>
    </Form>
  </Card>
</template>
