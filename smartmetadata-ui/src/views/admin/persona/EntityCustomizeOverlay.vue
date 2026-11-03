<!--
  Copyright 2026 SmartMetadata authors.

  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { Form, Select } from 'ant-design-vue';
import type { Persona, PersonaDocument } from '@/types/persona';
import { ENTITY_PAGE_TYPES } from '../personaPage';
import PersonaPageJsonEditor from './PersonaPageJsonEditor.vue';

/**
 * Entity customize overlay, mirroring the official
 * EntityCustomizeOverlay: pick an entity page type, then edit that
 * entity's page in the persona document. The entity pages are the
 * official PageType entity values; the page editor itself is shared
 * with the landing and marketplace editors.
 */
const props = defineProps<{
  persona: Persona;
  document: PersonaDocument;
  initialEntity?: string;
}>();

const emit = defineEmits<{ saved: [document: PersonaDocument] }>();

const { t } = useI18n();
const entityType = ref<string>(
  props.initialEntity && (ENTITY_PAGE_TYPES as readonly string[]).includes(props.initialEntity)
    ? props.initialEntity
    : ENTITY_PAGE_TYPES[0],
);
</script>

<template>
  <div data-testid="entity-customize-overlay">
    <Form layout="vertical">
      <Form.Item :label="t('persona.entityType')">
        <Select
          v-model:value="entityType"
          data-testid="entity-type-select"
          style="width: 100%"
        >
          <Select.Option v-for="type in ENTITY_PAGE_TYPES" :key="type" :value="type">
            {{ type }}
          </Select.Option>
        </Select>
      </Form.Item>
    </Form>
    <PersonaPageJsonEditor
      :key="entityType"
      :persona="persona"
      :document="document"
      :page-type="entityType"
      @saved="(doc) => emit('saved', doc)"
    />
  </div>
</template>
