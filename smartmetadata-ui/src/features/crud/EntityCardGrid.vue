<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { Button, Card, Typography } from 'ant-design-vue';
import { DeleteOutlined } from '@ant-design/icons-vue';

/**
 * Card-grid rendering for entity lists that offer a card view
 * (official `EntityCardView` + per-page card templates, e.g. pin
 * `DomainListPage.tsx:305-310` / `DataProductListPage`): one card per
 * entity with its name, description and one meta line; clicking a
 * card opens the entity, exactly like clicking its table row. The
 * delete action mirrors the table's row action when `showDelete` is
 * set. Field content is the list's own data — no invented fields.
 */
export interface EntityCardItem {
  id: string;
  title: string;
  description?: string;
  meta?: string;
  testId: string;
}

defineProps<{
  items: EntityCardItem[];
  showDelete?: boolean;
  testId: string;
}>();

const emit = defineEmits<{
  open: [id: string];
  delete: [id: string];
}>();
</script>

<template>
  <div class="entity-card-grid" :data-testid="testId">
    <Card
      v-for="item in items"
      :key="item.id"
      class="entity-card-grid__card"
      hoverable
      :data-testid="`${testId}-${item.testId}`"
    >
      <a
        href="#"
        class="entity-card-grid__title"
        :data-testid="`${testId}-open-${item.testId}`"
        @click.prevent="emit('open', item.id)"
      >
        {{ item.title }}
      </a>
      <Typography.Paragraph
        v-if="item.description"
        class="entity-card-grid__description"
        :ellipsis="{ rows: 2 }"
      >
        {{ item.description }}
      </Typography.Paragraph>
      <Typography.Text v-if="item.meta" type="secondary" class="entity-card-grid__meta">
        {{ item.meta }}
      </Typography.Text>
      <div v-if="showDelete" class="entity-card-grid__actions">
        <Button
          danger
          type="text"
          size="small"
          :data-testid="`${testId}-delete-${item.testId}`"
          @click="emit('delete', item.id)"
        >
          <DeleteOutlined />
        </Button>
      </div>
    </Card>
  </div>
</template>

<style scoped>
.entity-card-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 16px;
  padding: 12px 0;
}

.entity-card-grid__title {
  font-weight: 600;
}

.entity-card-grid__description {
  margin: 8px 0 0;
}

.entity-card-grid__meta {
  display: block;
  margin-top: 8px;
}

.entity-card-grid__actions {
  margin-top: 8px;
  text-align: right;
}
</style>
