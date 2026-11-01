<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { Spin } from 'ant-design-vue';
import { insightsTabFromKey } from '@/catalog/insightsTabs';

/**
 * Compatibility shell (Stage 6). The pre-split single page used
 * `/insights?tab=<key>`; the official split lives at `/insights/<key>`.
 * This shell only redirects: an unknown or missing tab lands on
 * data-assets, exactly like the official page's unknown-tab rule. No
 * content lives here anymore; see DataAssetsView / AppAnalyticsView /
 * KpiListView / OnlineUsersView.
 */
const route = useRoute();
const router = useRouter();

onMounted(() => {
  const tab = insightsTabFromKey(route.query.tab as string | undefined);
  void router.replace({ name: tab.routeName });
});
</script>

<template>
  <Spin data-testid="insights-compat-redirect" />
</template>
