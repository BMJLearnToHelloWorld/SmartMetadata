<!--
Copyright 2026 SmartMetadata authors.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0
-->
<script setup lang="ts">
import { InfoCircleOutlined } from '@ant-design/icons-vue';
import { Button, Card, Col, Row, Skeleton, Tooltip, Typography } from 'ant-design-vue';
import { onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { getDiagnosticInfo } from '@/api/eventSubscriptions';
import type { EventSubscriptionDiagnosticInfo } from '@/types/notifications';
import type { TranslateFn } from '@/utils/notifications/alertUtils';
import { formatDiagnosticTabValue, getDiagnosticItems } from '@/utils/notifications/alertUtils';
import { reportErrorToast, type AlertSearchHooks } from '@/utils/notifications/alertSourceSearch';

/**
 * Pin `AlertDiagnosticInfoTab` (AlertDiagnosticInfoTab.tsx:32-111): fetches
 * once on mount (the pin effect has empty deps, so the FQN is captured and
 * never re-fetched), toasts failures with no fallback text, shows a
 * 3-row skeleton while loading, then the six fixed-order diagnostic items
 * in a two-column grid with description tooltips.
 */
const props = defineProps<{
  fqn: string;
  hooks: AlertSearchHooks;
}>();

const { t } = useI18n();
const translate = t as unknown as TranslateFn;
const diagnosticData = ref<EventSubscriptionDiagnosticInfo | undefined>(undefined);
const isLoading = ref(true);

async function fetchDiagnosticInfo(): Promise<void> {
  isLoading.value = true;
  try {
    diagnosticData.value = await getDiagnosticInfo(props.fqn);
  } catch (error) {
    reportErrorToast(error, props.hooks);
  } finally {
    isLoading.value = false;
  }
}

onMounted(() => {
  void fetchDiagnosticInfo();
});
</script>

<template>
  <Card>
    <Skeleton v-if="isLoading" active :paragraph="{ rows: 3 }" :title="false" />
    <Row v-else :gutter="[16, 16]">
      <Col
        v-for="item in getDiagnosticItems(diagnosticData, translate)"
        :key="item.key"
        :span="12"
      >
        <Row align="middle">
          <Col :span="24">
            <Typography.Text type="secondary">{{ `${item.key}:` }}</Typography.Text>
            <Tooltip placement="bottom" :title="item.description">
              <Button
                type="text"
                size="small"
                :aria-label="item.description"
              >
                <InfoCircleOutlined />
              </Button>
            </Tooltip>
          </Col>
          <Col :span="24">
            <Typography.Text>{{ formatDiagnosticTabValue(item.value, translate) }}</Typography.Text>
          </Col>
        </Row>
      </Col>
    </Row>
  </Card>
</template>
