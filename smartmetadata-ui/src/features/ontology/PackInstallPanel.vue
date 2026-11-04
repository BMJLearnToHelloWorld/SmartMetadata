<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { Button, Card, Checkbox, Form, Input, Space, Switch, Typography, message } from 'ant-design-vue';
import { installOntologyPack } from '@/api/ontologyEdit';
import { listOntologyPacks } from '@/api/ontology';
import type { OntologyPack } from '@/types/ontology';
import type { OntologyPackInstallResult as InstallResult } from '@/types/ontologyEdit';

const props = defineProps<{
  canEdit: boolean;
}>();

const { t } = useI18n();

const packs = ref<OntologyPack[]>([]);
const selectedPackId = ref<string | undefined>(undefined);
const selectedModules = ref<string[]>([]);
const targetGlossary = ref('');
const dryRun = ref(true);
const result = ref<InstallResult | null>(null);
const errorMessage = ref('');
const busy = ref(false);

async function loadPacks(): Promise<void> {
  try {
    packs.value = await listOntologyPacks();
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : t('ontology.edit.packFailed');
  }
}

function selectPack(packId: string): void {
  selectedPackId.value = packId;
  const pack = packs.value.find((item) => item.name === packId || item.id === packId);
  selectedModules.value = (pack?.modules ?? [])
    .filter((module) => module.selectedByDefault)
    .map((module) => module.id ?? module.name)
    .filter(Boolean);
  result.value = null;
}

async function onInstall(): Promise<void> {
  if (!props.canEdit || !selectedPackId.value || !targetGlossary.value || !selectedModules.value.length) {
    return;
  }
  busy.value = true;
  errorMessage.value = '';
  try {
    result.value = await installOntologyPack(selectedPackId.value, {
      moduleIds: selectedModules.value,
      targetGlossaryName: targetGlossary.value,
      dryRun: dryRun.value,
    });
    message.success(t(dryRun.value ? 'ontology.edit.packDryRunOk' : 'ontology.edit.packInstalled'));
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : t('ontology.edit.packFailed');
  } finally {
    busy.value = false;
  }
}

void loadPacks();
</script>

<template>
  <Card data-testid="ontology-pack-install-panel" style="margin-bottom: 16px">
    <Space direction="vertical" style="width: 100%">
      <Typography.Text strong>{{ t('ontology.edit.packInstallTitle') }}</Typography.Text>
      <Typography.Text v-if="errorMessage" type="danger">{{ errorMessage }}</Typography.Text>
      <Form layout="inline" data-testid="ontology-pack-install-form">
        <Form.Item :label="t('ontology.edit.pack')">
          <Select
            v-model:value="selectedPackId"
            style="width: 220px"
            :placeholder="t('ontology.edit.selectPack')"
            data-testid="ontology-pack-select"
            @change="(value: string) => selectPack(value)"
          >
            <Select.Option v-for="pack in packs" :key="pack.name" :value="pack.name">
              {{ pack.displayName || pack.name }}
            </Select.Option>
          </Select>
        </Form.Item>
        <Form.Item :label="t('ontology.edit.targetGlossary')"><Input v-model:value="targetGlossary" data-testid="ontology-pack-target" /></Form.Item>
        <Form.Item :label="t('ontology.edit.dryRun')"><Switch v-model:checked="dryRun" data-testid="ontology-pack-dry-run" /></Form.Item>
        <Form.Item>
          <Button
            type="primary"
            :disabled="!canEdit || !selectedPackId || !targetGlossary || !selectedModules.length"
            :loading="busy"
            data-testid="ontology-pack-install"
            @click="onInstall"
          >
            {{ t('ontology.edit.installPack') }}
          </Button>
        </Form.Item>
      </Form>
      <div v-if="selectedPackId" data-testid="ontology-pack-modules">
        <Checkbox.Group v-model:value="selectedModules">
          <Checkbox
            v-for="module in (packs.find((item) => item.name === selectedPackId || item.id === selectedPackId)?.modules ?? [])"
            :key="module.id ?? module.name"
            :value="module.id ?? module.name"
          >
            {{ module.name }} ({{ module.conceptCount ?? '' }})
          </Checkbox>
        </Checkbox.Group>
      </div>
      <div v-if="result" data-testid="ontology-pack-install-result">
        <Typography.Text>
          {{ t('ontology.edit.packResult', { concepts: result.conceptCount ?? 0, relations: result.relationshipCount ?? 0, dry: result.dryRun ? t('ontology.edit.dryRunYes') : t('ontology.edit.dryRunNo') }) }}
        </Typography.Text>
      </div>
    </Space>
  </Card>
</template>
