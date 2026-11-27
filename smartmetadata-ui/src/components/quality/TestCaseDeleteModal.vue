<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
  Official test-case delete: soft delete vs hard delete (live quality-test-delete-dialog.png).
-->
<script setup lang="ts">
import { ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { Modal, Radio, Space, Typography } from 'ant-design-vue';

const props = defineProps<{
  open: boolean;
  name: string;
}>();
const emit = defineEmits<{
  cancel: [];
  confirm: [mode: 'soft' | 'hard'];
}>();
const { t } = useI18n();
const mode = ref<'soft' | 'hard'>('soft');

watch(
  () => props.open,
  (open) => {
    if (open) {
      mode.value = 'soft';
    }
  },
);
</script>

<template>
  <Modal
    :open="open"
    :title="t('quality.testCases.deleteTitle')"
    :ok-text="t('crud.delete')"
    :cancel-text="t('crud.cancel')"
    ok-type="danger"
    data-testid="test-case-delete-modal"
    @ok="emit('confirm', mode)"
    @cancel="emit('cancel')"
  >
    <Typography.Paragraph>
      {{ t('quality.testCases.deleteLead', { name }) }}
    </Typography.Paragraph>
    <Radio.Group v-model:value="mode" data-testid="test-case-delete-mode">
      <Space direction="vertical" style="width: 100%">
        <Radio value="soft" data-testid="test-case-delete-soft">
          <strong>{{ t('quality.testCases.deleteSoft') }}</strong>
          <div>{{ t('quality.testCases.deleteSoftHelp') }}</div>
        </Radio>
        <Radio value="hard" data-testid="test-case-delete-hard">
          <strong>{{ t('quality.testCases.deleteHard') }}</strong>
          <div>{{ t('quality.testCases.deleteHardHelp') }}</div>
        </Radio>
      </Space>
    </Radio.Group>
  </Modal>
</template>
