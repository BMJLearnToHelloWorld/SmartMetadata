<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { Modal } from 'ant-design-vue';

defineProps<{
  open: boolean;
  entityName: string;
  entityTypeLabel: string;
  loading?: boolean;
}>();
const emit = defineEmits<{
  cancel: [];
  confirm: [];
}>();

const { t } = useI18n();
</script>

<template>
  <!--
    Official ManageButton restore modal (SimpleModal, pin a3012259ca):
    titled "Restore {entity type}", body asking to restore the named
    entity, Restore/Cancel buttons, overlay/Escape dismissal locked
    unconditionally (isDismissable=false) — not only while restoring.
    The X button stays: SimpleModal always renders its close button,
    and it calls the same cancel handler as Cancel. The caller owns
    the restore call; on failure it keeps the modal open, mirroring
    the pin (the modal closes only when the restore handler returns
    true).
  -->
  <Modal
    :open="open"
    :title="t('crud.restoreEntityTitle', { entity: entityTypeLabel })"
    :ok-text="t('crud.restore')"
    :cancel-text="t('crud.cancel')"
    :confirm-loading="loading ?? false"
    :cancel-button-props="{ disabled: loading ?? false }"
    :mask-closable="false"
    :closable="true"
    :keyboard="false"
    data-testid="restore-entity-modal"
    @ok="emit('confirm')"
    @cancel="emit('cancel')"
  >
    <p data-testid="restore-entity-modal-body">
      {{ t('crud.restoreConfirm', { entity: entityName }) }}
    </p>
  </Modal>
</template>
