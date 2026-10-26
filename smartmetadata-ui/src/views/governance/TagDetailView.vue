<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { onMounted, reactive, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import {
  Alert,
  Button,
  Card,
  Descriptions,
  Form,
  Input,
  Modal,
  Space,
  Spin,
  Typography,
  message,
} from 'ant-design-vue';
import { getTag, updateTag } from '@/api/tags';
import type { ClassificationTag } from '@/types/governance';

const props = defineProps<{ id: string }>();
const router = useRouter();
const { t } = useI18n();
const loading = ref(false);
const errorMessage = ref('');
const tag = ref<ClassificationTag | null>(null);
const editOpen = ref(false);
const saving = ref(false);
const editForm = reactive({
  displayName: '',
  description: '',
});

async function load(): Promise<void> {
  loading.value = true;
  errorMessage.value = '';
  try {
    tag.value = await getTag(props.id);
  } catch (error) {
    tag.value = null;
    errorMessage.value = error instanceof Error ? error.message : t('tags.loadFailed');
  } finally {
    loading.value = false;
  }
}

function openEdit(): void {
  if (!tag.value) {
    return;
  }
  editForm.displayName = tag.value.displayName || '';
  editForm.description = tag.value.description || '';
  editOpen.value = true;
}

async function onSave(): Promise<void> {
  if (!tag.value) {
    return;
  }
  saving.value = true;
  try {
    await updateTag({
      name: tag.value.name,
      description: editForm.description.trim(),
      displayName: editForm.displayName.trim() || undefined,
      classification: tag.value.classification?.fullyQualifiedName || tag.value.classification?.name,
      parent: tag.value.parent?.fullyQualifiedName || tag.value.parent?.name,
    });
    editOpen.value = false;
    message.success(t('tags.updated'));
    await load();
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('crud.updateFailed'));
  } finally {
    saving.value = false;
  }
}

watch(
  () => props.id,
  () => {
    void load();
  },
);

onMounted(() => {
  void load();
});
</script>

<template>
  <Spin :spinning="loading">
    <Card>
      <Space direction="vertical" size="middle" style="width: 100%">
        <div class="gov-head">
          <Typography.Title :level="4">{{ tag?.displayName || tag?.name || t('tags.fallback') }}</Typography.Title>
          <Space>
            <Button
              v-if="tag?.classification?.id"
              @click="router.push({ name: 'governance-classification', params: { id: tag.classification.id } })"
            >
              {{ t('tags.back') }}
            </Button>
            <Button type="primary" data-testid="edit-tag" :disabled="!tag" @click="openEdit">
              {{ t('tags.edit') }}
            </Button>
          </Space>
        </div>
        <Alert v-if="errorMessage" type="warning" show-icon :message="errorMessage" />
        <Descriptions v-if="tag" bordered :column="1" size="small">
          <Descriptions.Item :label="t('crud.name')">{{ tag.name }}</Descriptions.Item>
          <Descriptions.Item :label="t('crud.fqn')">{{ tag.fullyQualifiedName }}</Descriptions.Item>
          <Descriptions.Item :label="t('tags.classification')">{{ tag.classification?.name || '—' }}</Descriptions.Item>
          <Descriptions.Item :label="t('crud.parent')">{{ tag.parent?.name || '—' }}</Descriptions.Item>
          <Descriptions.Item :label="t('crud.description')">{{ tag.description || '—' }}</Descriptions.Item>
          <Descriptions.Item :label="t('tags.usage')">{{ tag.usageCount ?? '—' }}</Descriptions.Item>
        </Descriptions>
      </Space>
    </Card>
    <Modal
      v-model:open="editOpen"
      :title="t('tags.editTitle')"
      :ok-text="t('crud.save')"
      :cancel-text="t('crud.cancel')"
      :confirm-loading="saving"
      @ok="onSave"
    >
      <Form layout="vertical">
        <Form.Item :label="t('crud.displayName')">
          <Input v-model:value="editForm.displayName" />
        </Form.Item>
        <Form.Item :label="t('crud.description')" required>
          <Input.TextArea v-model:value="editForm.description" :rows="3" />
        </Form.Item>
      </Form>
    </Modal>
  </Spin>
</template>

<style scoped>
.gov-head {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: flex-start;
}
</style>
