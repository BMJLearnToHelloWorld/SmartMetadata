<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { Button, Modal, Typography } from 'ant-design-vue';
import { useI18n } from 'vue-i18n';

/**
 * Announcement delete confirmation, ported from pin
 * components/Announcement/AnnouncementDeleteDialog.tsx. Unlike the
 * alert delete modal it stays dismissable while deleting; the Delete
 * button shows its loading state but is not disabled.
 */
const props = defineProps<{
  open: boolean;
  deleting?: boolean;
}>();
const emit = defineEmits<{ cancel: []; confirm: [] }>();
const { t } = useI18n();
</script>

<template>
  <Modal
    :open="props.open"
    :width="480"
    :title="t('message.delete-message-question-mark')"
    :footer="null"
    @cancel="emit('cancel')"
  >
    <!-- The testid rides this wrapper: antd Modal does not forward
    unknown attributes onto a rendered node. -->
    <div data-testid="announcement-delete-confirm">
      <Typography.Paragraph type="secondary">
        {{ t('message.confirm-delete-message') }}
      </Typography.Paragraph>
      <div class="announcement-delete-dialog__footer">
        <Button data-testid="cancel" @click="emit('cancel')">
          {{ t('label.cancel') }}
        </Button>
        <Button
          danger
          type="primary"
          data-testid="save-button"
          :loading="props.deleting"
          @click="emit('confirm')"
        >
          {{ t('label.delete') }}
        </Button>
      </div>
    </div>
  </Modal>
</template>

<style scoped>
.announcement-delete-dialog__footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding-top: 8px;
}
</style>
