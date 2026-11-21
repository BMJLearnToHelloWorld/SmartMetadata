<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { Button, Modal, Select, message } from 'ant-design-vue';
import { EditOutlined, PlusOutlined } from '@ant-design/icons-vue';
import { DOMAIN_TYPES } from '@/types/governance';

/**
 * DomainType widget cell (D-2 batch 5a). Pin
 * `U/components/Domain/DomainTypeWidget/DomainTypeWidget.tsx:28`: the
 * domain type with a single-select picker behind a +/edit button
 * (pin: `FilterSelect` popover, select saves at once; the product uses
 * the batch-wide Modal + Select + Save/Cancel shape, same options and
 * value semantics). The caller owns the gate (`has-edit-access`, P1
 * `isAdminUser || canEditAll`) and the save.
 */
const props = defineProps<{
  domainType: string;
  hasEditAccess: boolean;
  onSave: (domainType: string) => Promise<unknown>;
}>();

const { t } = useI18n();

const modalOpen = ref(false);
const selected = ref('');
const saving = ref(false);

function openModal(): void {
  selected.value = props.domainType;
  modalOpen.value = true;
}

function closeModal(): void {
  modalOpen.value = false;
}

async function save(): Promise<void> {
  if (!selected.value || selected.value === props.domainType) {
    closeModal();
    return;
  }
  saving.value = true;
  try {
    await props.onSave(selected.value);
    closeModal();
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('crud.updateFailed'));
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <div>
    <div class="widget-domain-type__view">
      <span data-testid="domain-type-label">{{ domainType || '—' }}</span>
      <Button
        v-if="hasEditAccess"
        type="text"
        size="small"
        :data-testid="domainType ? 'edit-domainType-button' : 'add-domainType-button'"
        @click="openModal"
      >
        <PlusOutlined v-if="!domainType" />
        <EditOutlined v-else />
      </Button>
    </div>
    <Modal
      :open="modalOpen"
      :closable="false"
      :mask-closable="false"
      :keyboard="false"
      :title="t('governance.domains.type')"
      data-testid="widget-domain-type-modal"
      @cancel="closeModal"
    >
      <Select
        v-model:value="selected"
        data-testid="widget-domain-type-select"
        :placeholder="t('governance.domains.type')"
        style="width: 100%"
      >
        <Select.Option v-for="type in DOMAIN_TYPES" :key="type" :value="type">
          {{ type }}
        </Select.Option>
      </Select>
      <template #footer>
        <Button data-testid="cancel-btn" @click="closeModal">{{ t('crud.cancel') }}</Button>
        <Button type="primary" data-testid="widget-domain-type-save" :loading="saving" @click="save">
          {{ t('crud.save') }}
        </Button>
      </template>
    </Modal>
  </div>
</template>

<style scoped>
.widget-domain-type__view {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
}
</style>
