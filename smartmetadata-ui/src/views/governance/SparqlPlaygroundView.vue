<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import PageHeader from '@/components/shared/PageHeader.vue';
import SparqlQueryConsole from './SparqlQueryConsole.vue';

const { t } = useI18n();

/**
 * Official page shape (pages/SparqlPlayground): a heading card with a
 * Beta badge and subtitle, then the shared SPARQL query console.
 */
</script>

<template>
  <div data-testid="sparql-playground">
    <PageHeader
      :header="t('sparql.title')"
      :sub-header="t('sparql.subtitle')"
      :is-beta="true"
    />
    <SparqlQueryConsole />
  </div>
</template>
