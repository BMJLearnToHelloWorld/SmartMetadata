<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
/**
 * Record route redirect shell (F-D-2): the incident record page no longer
 * renders its own detail — it loads the incident once to learn the test-case
 * FQN and replaces the route with the test-case detail page. A router-level
 * redirect cannot do this: the FQN is only known after the read.
 * ADR:2026-11-08-incident-detail-redirects-to-test-case
 */
import { computed, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { getTestIncident } from '@/api/testIncidents';
import EntityDetailShell from '@/features/crud/EntityDetailShell.vue';
import type { EntityBreadcrumb } from '@/features/crud/types';

const props = defineProps<{ id: string }>();
const { t } = useI18n();
const router = useRouter();
const loading = ref(false);
const errorMessage = ref('');
const redirected = ref(false);

const breadcrumbs = computed<EntityBreadcrumb[]>(() => [
  { label: t('observability.incidents.title'), to: { name: 'observability-incidents' } },
]);

async function load(): Promise<void> {
  loading.value = true;
  errorMessage.value = '';
  try {
    const incident = await getTestIncident(props.id);
    const fqn = incident.testCaseReference?.fullyQualifiedName;
    if (fqn !== undefined) {
      redirected.value = true;
      await router.replace(`/test-case/${encodeURIComponent(fqn)}`);
      return;
    }
    const testCaseId = incident.testCaseReference?.id;
    if (testCaseId !== undefined) {
      redirected.value = true;
      await router.replace({ name: 'quality-test-case', params: { id: testCaseId } });
      return;
    }
    errorMessage.value = t('observability.incidents.noTestCase');
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : t('crud.loadFailed');
  } finally {
    loading.value = false;
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
  <EntityDetailShell
    :title="t('observability.incidents.title')"
    :loading="loading"
    :error="errorMessage"
    :empty="!loading && !errorMessage && !redirected"
    :breadcrumbs="breadcrumbs"
    data-testid="incident-detail-redirect"
  />
</template>
