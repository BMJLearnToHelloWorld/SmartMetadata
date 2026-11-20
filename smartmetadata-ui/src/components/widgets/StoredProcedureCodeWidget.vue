/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
<script setup lang="ts">
/**
 * Stored procedure code — the pin `StoredProcedureCodeCard.tsx`
 * equivalent (D-2 batch 5b). A read-only SQL editor (`SmCodeEditor`,
 * the pin `SchemaEditor` product equivalent, `mode` SQL,
 * `styleActiveLine` off, read only). The pin card has no edit action
 * and evaluates no permission (one of the ten no-write keys), so this
 * widget has neither; an absent code renders the empty state.
 */
import { useI18n } from 'vue-i18n';
import { Empty } from 'ant-design-vue';
import SmCodeEditor from '@/components/shared/SmCodeEditor.vue';
import type { StoredProcedureCode } from '@/types/api';
import { CSMode } from '@/utils/codeMirrorUtils';

const { t } = useI18n();

defineProps<{
  code?: StoredProcedureCode;
}>();
</script>

<template>
  <Empty
    v-if="!code?.code"
    data-testid="asset-code-empty"
    :description="t('asset.codeEmpty')"
  />
  <div v-else data-testid="asset-code-block">
    <SmCodeEditor
      variant="schema"
      :mode="{ name: CSMode.SQL }"
      :value="code.code"
      :read-only="true"
      :show-copy-button="false"
    />
  </div>
</template>
