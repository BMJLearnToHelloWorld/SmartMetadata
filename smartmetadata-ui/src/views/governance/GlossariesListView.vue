<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { Alert, Button, Checkbox, Empty, Form, Input, Modal, Spin, message } from 'ant-design-vue';
import { createGlossary, listGlossaries } from '@/api/glossaries';
import { requiredField } from '@/features/crud/formRules';

const { t } = useI18n();
const router = useRouter();
const loading = ref(true);
const errorMessage = ref('');
const empty = ref(false);
const createOpen = ref(false);
const creating = ref(false);
const form = reactive({
  name: '',
  displayName: '',
  description: '',
  mutuallyExclusive: false,
});

async function bootstrap(): Promise<void> {
  loading.value = true;
  errorMessage.value = '';
  empty.value = false;
  try {
    const page = await listGlossaries({ limit: 1 });
    const first = page.data[0];
    if (first?.id) {
      await router.replace({ name: 'governance-glossary', params: { id: first.id } });
      return;
    }
    empty.value = true;
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : t('crud.loadFailed');
  } finally {
    loading.value = false;
  }
}

async function onCreate(): Promise<void> {
  creating.value = true;
  try {
    const created = await createGlossary({
      name: form.name.trim(),
      description: form.description.trim(),
      displayName: form.displayName.trim() || undefined,
      mutuallyExclusive: form.mutuallyExclusive,
    });
    createOpen.value = false;
    message.success(t('governance.glossaries.created', { name: created.name }));
    if (created.id) {
      await router.push({ name: 'governance-glossary', params: { id: created.id } });
    } else {
      await bootstrap();
    }
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('crud.createFailed'));
  } finally {
    creating.value = false;
  }
}

onMounted(() => {
  void bootstrap();
});
</script>

<template>
  <div class="glossaries-entry" data-testid="glossaries-entry">
    <Spin :spinning="loading">
      <Alert v-if="errorMessage" type="error" show-icon :message="errorMessage" />
      <Empty
        v-else-if="empty"
        data-testid="glossaries-table"
        :description="t('governance.glossaries.emptyList')"
      >
        <Button type="primary" data-testid="create-glossary" @click="createOpen = true">
          {{ t('governance.glossaries.create') }}
        </Button>
      </Empty>
    </Spin>
  </div>
  <Modal
    v-model:open="createOpen"
    :title="t('governance.glossaries.createTitle')"
    :ok-text="t('crud.create')"
    :cancel-text="t('crud.cancel')"
    :confirm-loading="creating"
    @ok="onCreate"
  >
    <Form layout="vertical">
      <Form.Item :label="t('crud.name')" :rules="requiredField(t, t('crud.name'))">
        <Input v-model:value="form.name" data-testid="create-glossary-name" />
      </Form.Item>
      <Form.Item :label="t('crud.description')" required>
        <Input.TextArea v-model:value="form.description" data-testid="create-glossary-description" :rows="3" />
      </Form.Item>
      <Form.Item :label="t('crud.displayName')" :extra="t('crud.displayNameHelp')">
        <Input v-model:value="form.displayName" />
      </Form.Item>
      <Form.Item>
        <Checkbox v-model:checked="form.mutuallyExclusive">
          {{ t('governance.glossaries.exclusiveHint') }}
        </Checkbox>
      </Form.Item>
    </Form>
  </Modal>
</template>

<style scoped>
.glossaries-entry {
  min-height: 240px;
  display: flex;
  align-items: center;
  justify-content: center;
}
</style>
