<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0 (the "License");
  you may not use this file except in compliance with the License.
  You may obtain a copy of the License at

      http://www.apache.org/licenses/LICENSE-2.0
-->
<script setup lang="ts">
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { SettingOutlined } from '@ant-design/icons-vue';
import { Button, Popover, Select, Space, Switch, Typography } from 'ant-design-vue';
import type { SelectValue } from 'ant-design-vue/es/select';
import type { OntologyGraphSettings } from '@/types/ontologyDataGraph';

/**
 * Graph settings (official components/OntologyExplorer/GraphSettingsPanel.tsx,
 * 128 lines): exactly two fields — layout (Hierarchical | Circular) +
 * showEdgeLabels. Popover (placement top) with a gear button; the panel
 * header carries a close button. The caller owns the settings object and
 * applies it to the canvas (handleSettingsChange in pin); a change that
 * equals the current settings emits nothing.
 */
const props = defineProps<{
  settings: OntologyGraphSettings;
}>();

const emit = defineEmits<{
  (event: 'settings-change', settings: OntologyGraphSettings): void;
}>();

const { t } = useI18n();
const open = ref(false);

function onLayoutChange(value: SelectValue): void {
  // antd Select emits SelectValue (single or array); the layout select is
  // single-choice, so only a string value is a layout.
  if (typeof value !== 'string') {
    return;
  }
  const layout = value as OntologyGraphSettings['layout'];
  if (layout !== props.settings.layout) {
    emit('settings-change', { ...props.settings, layout });
  }
}

function onEdgeLabelsChange(checked: boolean | string | number): void {
  const showEdgeLabels = checked === true;
  if (showEdgeLabels !== props.settings.showEdgeLabels) {
    emit('settings-change', { ...props.settings, showEdgeLabels });
  }
}
</script>

<template>
  <Popover v-model:open="open" placement="top" trigger="click" data-testid="ontology-graph-settings-popover">
    <template #content>
      <Space direction="vertical" style="min-width: 220px">
        <Space style="justify-content: space-between; width: 100%">
          <Typography.Text strong>{{ t('ontology.browser.graphSettings') }}</Typography.Text>
          <Button size="small" type="text" data-testid="graph-settings-close" @click="open = false">
            {{ t('crud.close') }}
          </Button>
        </Space>
        <Space direction="vertical" style="width: 100%">
          <Typography.Text type="secondary">{{ t('ontology.browser.graphSettingsLayout') }}</Typography.Text>
          <Select
            :value="settings.layout"
            style="width: 100%"
            data-testid="graph-settings-layout-select"
            @change="onLayoutChange"
          >
            <Select.Option value="Hierarchical">
              {{ t('ontology.browser.graphSettingsLayoutHierarchical') }}
            </Select.Option>
            <Select.Option value="Circular">
              {{ t('ontology.browser.graphSettingsLayoutCircular') }}
            </Select.Option>
          </Select>
        </Space>
        <Space style="justify-content: space-between; width: 100%">
          <Typography.Text>{{ t('ontology.browser.graphSettingsEdgeLabels') }}</Typography.Text>
          <Switch
            :checked="settings.showEdgeLabels"
            data-testid="graph-settings-edge-labels-toggle"
            @change="onEdgeLabelsChange"
          />
        </Space>
      </Space>
    </template>
    <Button data-testid="ontology-graph-settings" :aria-label="t('ontology.browser.graphSettings')">
      <SettingOutlined />
    </Button>
  </Popover>
</template>
