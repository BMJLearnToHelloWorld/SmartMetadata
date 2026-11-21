<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { Button, Modal, Select, Space, Typography, message } from 'ant-design-vue';
import { EditOutlined, PlusOutlined } from '@ant-design/icons-vue';
import type { EntityRef } from '@/types/api';
import { ownerKey, parseOwnerKey, type OwnerOption } from '@/governance/catalogOptions';

/**
 * GlossaryTerm Owner widget cell (D-2 batch 5a). Pin
 * `U/utils/GlossaryTerm/GlossaryTermWidgetUtils.tsx:98`
 * (`GlossaryTermOwnerWidget`): owner names + a user/team picker behind
 * a +/edit button. The gate is pin's documented exception — the raw
 * `EditOwners || EditAll` read, no derivation, no `deleted` gate (A8
 * §2.3 exception 1) — computed by the caller and passed in as
 * `has-edit-access` (with the P1 admin line ORed on top). This is the
 * GlossaryTerm OWNER face; the generic OWNERS widget is batch 2's
 * `WidgetOwnersCell`, a different widget.
 */
const props = defineProps<{
  owners: EntityRef[];
  ownerOptions: OwnerOption[];
  hasEditAccess: boolean;
  onSave: (owners: Array<{ id: string; type: string }>) => Promise<unknown>;
}>();

const { t } = useI18n();

const modalOpen = ref(false);
const selectedKeys = ref<string[]>([]);
const saving = ref(false);

function openModal(): void {
  selectedKeys.value = props.owners
    .filter((owner) => owner.id && owner.type)
    .map((owner) => ownerKey(owner.id as string, owner.type as string));
  modalOpen.value = true;
}

function closeModal(): void {
  modalOpen.value = false;
}

async function save(): Promise<void> {
  const owners = selectedKeys.value.flatMap((key) => {
    const parsed = parseOwnerKey(key);
    return parsed ? [parsed] : [];
  });
  saving.value = true;
  try {
    await props.onSave(owners);
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
    <div class="widget-owner__view">
      <Space wrap>
        <span v-for="owner in owners" :key="owner.id || owner.name">
          {{ owner.displayName || owner.name }}
        </span>
        <Typography.Text v-if="!owners.length && !hasEditAccess" type="secondary">—</Typography.Text>
      </Space>
      <Button
        v-if="hasEditAccess"
        type="text"
        size="small"
        :data-testid="owners.length ? 'edit-owner' : 'add-owner'"
        @click="openModal"
      >
        <PlusOutlined v-if="!owners.length" />
        <EditOutlined v-else />
      </Button>
    </div>
    <Modal
      :open="modalOpen"
      :closable="false"
      :mask-closable="false"
      :keyboard="false"
      :title="t('crud.owners')"
      data-testid="widget-owner-modal"
      @cancel="closeModal"
    >
      <Select
        v-model:value="selectedKeys"
        mode="multiple"
        allow-clear
        data-testid="widget-owner-select"
        :placeholder="t('terms.ownerSelectPlaceholder')"
        style="width: 100%"
      >
        <Select.Option v-for="option in ownerOptions" :key="option.key" :value="option.key">
          {{ option.label }}
        </Select.Option>
      </Select>
      <template #footer>
        <Button data-testid="cancel-btn" @click="closeModal">{{ t('crud.cancel') }}</Button>
        <Button type="primary" data-testid="widget-owner-save" :loading="saving" @click="save">
          {{ t('crud.save') }}
        </Button>
      </template>
    </Modal>
  </div>
</template>

<style scoped>
.widget-owner__view {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
}
</style>
