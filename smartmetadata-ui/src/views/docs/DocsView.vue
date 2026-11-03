<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import PageHeader from '@/components/shared/PageHeader.vue';
import PageLayout from '@/components/shared/PageLayout.vue';

/**
 * Official SwaggerPage equivalent (constants.ts:195 SWAGGER '/docs').
 * The official page renders RapiDoc against ./swagger.json. This console
 * ships no RapiDoc dependency, so it embeds the server's own Swagger UI
 * (SwaggerBundle serves /swagger-ui, reachable through the existing /api
 * proxy) instead of adding a new renderer dependency. Try-it-out calls
 * need a bearer token pasted into the UI's Authorize dialog, because
 * product auth is JWT bearer, not cookies — the hint below says so
 * instead of pretending the embedded UI is already authenticated.
 */
const { t } = useI18n();
const swaggerUiUrl = '/api/swagger-ui';
const specUrl = '/api/swagger.json';
</script>

<template>
  <PageLayout test-id="docs-layout">
    <PageHeader :header="t('docs.title')" :sub-header="t('docs.lead')" />
    <p class="docs__hint">{{ t('docs.authHint') }}</p>
    <p>
      <a data-testid="docs-spec-download" :href="specUrl" target="_blank" rel="noreferrer">
        {{ t('docs.specDownload') }}
      </a>
    </p>
    <iframe
      data-testid="docs-swagger-frame"
      :title="t('docs.title')"
      :src="swaggerUiUrl"
      class="docs__frame"
    />
  </PageLayout>
</template>

<style scoped>
.docs__hint {
  margin-block: 12px;
  color: var(--sm-text-secondary);
}

.docs__frame {
  width: 100%;
  height: calc(100vh - 220px);
  min-height: 480px;
  border: 1px solid var(--sm-border);
  border-radius: var(--sm-radius-card);
}
</style>
