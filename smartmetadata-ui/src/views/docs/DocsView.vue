<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
/**
 * Official OM SwaggerPage equivalent (constants SWAGGER '/docs').
 * Align with openmetadata-ui SwaggerPage: in-page RapiDoc against Jersey
 * /api/swagger.json (server.rootPath is /api/*), with the logged-in JWT as
 * Authorization bearer. Do not iframe /api/swagger-ui - that path is not
 * under Jersey and #139 nginx rewrites for it were wrong.
 */
import 'rapidoc';
import { computed } from 'vue';
import { storeToRefs } from 'pinia';
import { useI18n } from 'vue-i18n';
import { authorizationHeader } from '@/auth/token';
import PageHeader from '@/components/shared/PageHeader.vue';
import PageLayout from '@/components/shared/PageLayout.vue';
import { useAuthStore } from '@/stores/auth';
import { SM_COLOR_PRIMARY } from '@/theme/tokens';

const { t } = useI18n();
const auth = useAuthStore();
const { session } = storeToRefs(auth);

/** Jersey serves the generated OpenAPI spec at /api/swagger.json. */
const specUrl = '/api/swagger.json';

const apiKeyValue = computed(() => {
  const token = session.value?.accessToken;
  return token ? authorizationHeader(token) : '';
});
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
    <rapi-doc
      v-if="apiKeyValue"
      data-testid="docs-rapidoc"
      class="docs__rapidoc"
      :spec-url="specUrl"
      render-style="focused"
      theme="light"
      font-size="large"
      nav-item-spacing="compact"
      show-method-in-nav-bar="as-colored-block"
      api-key-name="Authorization"
      api-key-location="header"
      :api-key-value="apiKeyValue"
      :primary-color="SM_COLOR_PRIMARY"
      :show-header="false"
      :load-fonts="false"
      :allow-spec-file-download="true"
    />
    <div v-else data-testid="docs-rapidoc-loading" class="docs__loading">
      {{ t('docs.loading') }}
    </div>
  </PageLayout>
</template>

<style scoped>
.docs__hint {
  margin-block: 12px;
  color: var(--sm-text-secondary);
}

.docs__rapidoc {
  display: block;
  width: 100%;
  height: calc(100vh - 220px);
  min-height: 480px;
  border: 1px solid var(--sm-border);
  border-radius: var(--sm-radius-card);
}

.docs__loading {
  margin-block: 24px;
  color: var(--sm-text-secondary);
}
</style>
