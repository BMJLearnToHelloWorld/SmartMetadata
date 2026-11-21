<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { ref } from 'vue';
import { Button, Space, Tag, Typography } from 'ant-design-vue';
import { EditOutlined, PlusOutlined } from '@ant-design/icons-vue';
import { getSafeHttpUrl } from '@/catalog/safeHttpUrl';
import type { TermReference } from '@/types/governance';
import WidgetReferencesModal from './WidgetReferencesModal.vue';

/**
 * References widget cell (D-2 batch 5a). Pin
 * `U/components/Glossary/GlossaryTerms/tabs/GlossaryTermReferences.tsx:39`:
 * reference badges as external links (an unsafe URL degrades to plain
 * text, pin `ReferenceBadge` via `getSafeHttpUrl`); +/edit button opens
 * the references modal. The caller owns the gate (`has-edit-access`,
 * P1 `isAdminUser || canEditAll`) and the save.
 */
const props = defineProps<{
  references: TermReference[];
  hasEditAccess: boolean;
  onSave: (references: TermReference[]) => Promise<unknown>;
}>();

const modalOpen = ref(false);

async function handleSave(next: TermReference[]): Promise<void> {
  await props.onSave(next);
}
</script>

<template>
  <div>
    <div class="widget-references__view">
      <Space v-if="references.length" wrap>
        <template v-for="(reference, index) in references" :key="index">
          <Tag>
            <a
              v-if="getSafeHttpUrl(reference.endpoint)"
              :href="getSafeHttpUrl(reference.endpoint)"
              :data-testid="`reference-link-${reference.name}`"
              target="_blank"
              rel="noopener noreferrer"
            >
              {{ reference.name || reference.endpoint }}
            </a>
            <span v-else>{{ reference.name || reference.endpoint }}</span>
          </Tag>
        </template>
      </Space>
      <Typography.Text v-if="!references.length && !hasEditAccess" type="secondary">—</Typography.Text>
      <Button
        v-if="hasEditAccess"
        type="text"
        size="small"
        :data-testid="references.length ? 'edit-button' : 'term-references-add-button'"
        @click="modalOpen = true"
      >
        <PlusOutlined v-if="!references.length" />
        <EditOutlined v-else />
      </Button>
    </div>
    <WidgetReferencesModal
      :open="modalOpen"
      :references="references"
      :on-save="handleSave"
      :on-close="() => { modalOpen = false; }"
    />
  </div>
</template>

<style scoped>
.widget-references__view {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
}
</style>
