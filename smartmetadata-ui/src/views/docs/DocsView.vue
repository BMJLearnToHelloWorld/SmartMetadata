<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
/**
 * Official OM SwaggerPage equivalent (constants SWAGGER '/docs').
 * Align with openmetadata-ui SwaggerPage: in-page RapiDoc with
 * spec-url="./swagger.json" (public UI-root OpenAPI document) and the
 * logged-in JWT as Authorization bearer for Try-it calls.
 *
 * RapiDoc's api-key-* attrs are applied to Try-it requests only — they are
 * NOT attached to the initial spec fetch (rapidoc loadSpec passes api-key
 * into securitySchemes for Try-it; the document URL fetch does not send
 * Authorization). Pointing spec-url at /api/swagger.json therefore 401s
 * even when the user is logged in. Official OM serves ./swagger.json
 * outside Jersey auth (AssetServlet); on the rebuild stack we mirror that
 * with nginx /swagger.json → Jersey /api/swagger.json plus JwtFilter
 * exclusions for swagger.json/.yaml.
 *
 * Do not iframe /api/swagger-ui — that path is not under Jersey and #139
 * nginx rewrites for it were wrong.
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

/**
 * Same relative URL as OM SwaggerPage.tsx (`./swagger.json`). Resolves to
 * /swagger.json from /docs; nginx proxies that to Jersey without requiring
 * the browser to send Authorization on the document fetch.
 */
const specUrl = './swagger.json';

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
