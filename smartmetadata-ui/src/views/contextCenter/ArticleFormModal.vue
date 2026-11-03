<!--
  Copyright 2026 SmartMetadata authors.

  Licensed under the Apache License, Version 2.0 (the "License");
  you may not use this file except in compliance with the License.
  You may obtain a copy of the License at

      http://www.apache.org/licenses/LICENSE-2.0
-->
<script setup lang="ts">
import { reactive, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { Form, Input, Select } from 'ant-design-vue';
import FormModal from '@/components/shared/FormModal.vue';
import type { KnowledgePageType } from '@/types/contextCenter';

const { t } = useI18n();

const props = withDefaults(
  defineProps<{
    open: boolean;
    /** When set, the modal edits this page instead of creating one. */
    initialName?: string;
    initialDisplayName?: string;
    initialDescription?: string;
    initialPageType?: KnowledgePageType;
    initialPageUrl?: string;
  }>(),
  {
    initialName: '',
    initialDisplayName: '',
    initialDescription: '',
    initialPageType: 'Article',
    initialPageUrl: '',
  },
);

const emit = defineEmits<{
  ok: [
    value: {
      name: string;
      displayName?: string;
      description?: string;
      pageType: KnowledgePageType;
      pageUrl?: string;
    },
  ];
  cancel: [];
  'update:open': [open: boolean];
}>();

const form = reactive({
  name: '',
  displayName: '',
  description: '',
  pageType: 'Article' as KnowledgePageType,
  pageUrl: '',
});

watch(
  () => props.open,
  (open) => {
    if (!open) {
      return;
    }
    // The article body lives in description, matching official article editing.
    form.name = props.initialName;
    form.displayName = props.initialDisplayName;
    form.description = props.initialDescription;
    form.pageType = props.initialPageType;
    form.pageUrl = props.initialPageUrl;
  },
  { immediate: true },
);

function onOk(): void {
  emit('ok', {
    name: form.name.trim(),
    displayName: form.displayName.trim() || undefined,
    description: form.description.trim() || undefined,
    pageType: form.pageType,
    pageUrl: form.pageType === 'QuickLink' ? form.pageUrl.trim() || undefined : undefined,
  });
}
</script>

<template>
  <FormModal
    :open="open"
    :title="initialName ? t('contextCenter.editArticle') : t('contextCenter.createArticle')"
    :ok-disabled="!form.name.trim() || (form.pageType === 'QuickLink' && !form.pageUrl.trim())"
    test-id="article-form-modal"
    @ok="onOk"
    @cancel="emit('cancel')"
    @update:open="emit('update:open', $event)"
  >
    <Form layout="vertical">
      <Form.Item :label="t('contextCenter.name')" required>
        <!-- Edit mode locks the name: the server PUT identifies the page
             by name, so renaming here would create a second page. -->
        <Input
          v-model:value="form.name"
          :disabled="!!initialName"
          data-testid="article-form-name"
        />
      </Form.Item>
      <Form.Item :label="t('contextCenter.displayName')">
        <Input v-model:value="form.displayName" data-testid="article-form-display-name" />
      </Form.Item>
      <Form.Item :label="t('contextCenter.pageType')">
        <Select
          v-model:value="form.pageType"
          data-testid="article-form-page-type"
          :options="[
            { value: 'Article', label: t('contextCenter.articleType') },
            { value: 'QuickLink', label: t('contextCenter.quickLinkType') },
          ]"
        />
      </Form.Item>
      <Form.Item v-if="form.pageType === 'QuickLink'" :label="t('contextCenter.url')" required>
        <Input v-model:value="form.pageUrl" data-testid="article-form-url" />
      </Form.Item>
      <Form.Item :label="t('contextCenter.description')">
        <Input.TextArea
          v-model:value="form.description"
          data-testid="article-form-description"
          :rows="5"
        />
      </Form.Item>
    </Form>
  </FormModal>
</template>
