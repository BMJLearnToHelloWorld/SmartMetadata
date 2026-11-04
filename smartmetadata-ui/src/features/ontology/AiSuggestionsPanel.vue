<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { Button, Card, Form, Input, Space, Typography, message } from 'ant-design-vue';
import {
  createOntologyChangeSet,
  generateOntologyDomainDraft,
  suggestOntologyMappings,
  suggestOntologyRelationships,
} from '@/api/ontologyEdit';
import type {
  OntologyMappingSuggestion,
  OntologyRelationshipSuggestion,
} from '@/types/ontologyEdit';

const props = defineProps<{
  canEdit: boolean;
}>();

const { t } = useI18n();

const relForm = ref({ glossary: '', sourceTermIds: '', candidateTermIds: '', relationshipTypeIds: '', maxSuggestions: '5' });
const mapForm = ref({ glossary: '', sourceTermIds: '', standards: '', maxSuggestions: '5' });
const draftForm = ref({ glossary: '', changeSetName: '', displayName: '', description: '', domainDescription: '', maxConcepts: '10' });

const relSuggestions = ref<OntologyRelationshipSuggestion[]>([]);
const mapSuggestions = ref<OntologyMappingSuggestion[]>([]);
const draftPreview = ref<string>('');
const draftPayload = ref<Record<string, unknown> | null>(null);
const errorMessage = ref('');
const busy = ref('');

function idList(value: string): string[] {
  return value.split(',').map((item) => item.trim()).filter(Boolean);
}

async function onSuggestRelationships(): Promise<void> {
  if (!relForm.value.glossary) {
    return;
  }
  busy.value = 'rel';
  errorMessage.value = '';
  try {
    const result = await suggestOntologyRelationships({
      glossary: relForm.value.glossary,
      sourceTermIds: idList(relForm.value.sourceTermIds),
      candidateTermIds: idList(relForm.value.candidateTermIds),
      relationshipTypeIds: idList(relForm.value.relationshipTypeIds),
      maxSuggestions: Number(relForm.value.maxSuggestions) || 5,
    });
    relSuggestions.value = result.suggestions;
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : t('ontology.edit.aiFailed');
  } finally {
    busy.value = '';
  }
}

async function onSuggestMappings(): Promise<void> {
  if (!mapForm.value.glossary) {
    return;
  }
  busy.value = 'map';
  errorMessage.value = '';
  try {
    const result = await suggestOntologyMappings({
      glossary: mapForm.value.glossary,
      sourceTermIds: idList(mapForm.value.sourceTermIds),
      standards: idList(mapForm.value.standards),
      maxSuggestions: Number(mapForm.value.maxSuggestions) || 5,
    });
    mapSuggestions.value = result.suggestions;
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : t('ontology.edit.aiFailed');
  } finally {
    busy.value = '';
  }
}

async function onGenerateDraft(): Promise<void> {
  if (!draftForm.value.glossary || !draftForm.value.changeSetName) {
    return;
  }
  busy.value = 'draft';
  errorMessage.value = '';
  try {
    const result = await generateOntologyDomainDraft({
      glossary: draftForm.value.glossary,
      changeSetName: draftForm.value.changeSetName,
      displayName: draftForm.value.displayName,
      description: draftForm.value.description,
      domainDescription: draftForm.value.domainDescription,
      maxConcepts: Number(draftForm.value.maxConcepts) || 10,
    });
    draftPayload.value = result.draft ?? null;
    draftPreview.value = result.draft ? JSON.stringify(result.draft, null, 2) : '';
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : t('ontology.edit.aiFailed');
  } finally {
    busy.value = '';
  }
}

async function onCreateDraftFromAi(): Promise<void> {
  if (!props.canEdit || !draftPayload.value) {
    return;
  }
  busy.value = 'create';
  errorMessage.value = '';
  try {
    // The AI draft IS a CreateOntologyChangeSet payload (schema ref), so
    // posting it creates the draft the user reviews — nothing is applied.
    const payload = draftPayload.value;
    const created = await createOntologyChangeSet({
      name: String(payload.name ?? draftForm.value.changeSetName),
      displayName: String(payload.displayName ?? draftForm.value.displayName),
      description: String(payload.description ?? draftForm.value.description),
      glossaries: Array.isArray(payload.glossaries) ? payload.glossaries.filter((item): item is string => typeof item === 'string') : undefined,
      operations: Array.isArray(payload.operations) ? (payload.operations as never[]) : undefined,
    });
    message.success(t('ontology.edit.draftCreated', { name: created.name }));
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : t('ontology.edit.aiFailed');
  } finally {
    busy.value = '';
  }
}
</script>

<template>
  <Card data-testid="ontology-ai-panel" style="margin-bottom: 16px">
    <Space direction="vertical" style="width: 100%">
      <Typography.Text strong>{{ t('ontology.edit.aiTitle') }}</Typography.Text>
      <Typography.Text v-if="errorMessage" type="danger">{{ errorMessage }}</Typography.Text>
      <Form layout="inline" data-testid="ontology-ai-rel-form">
        <Form.Item :label="t('ontology.edit.glossary')"><Input v-model:value="relForm.glossary" data-testid="ontology-ai-rel-glossary" /></Form.Item>
        <Form.Item :label="t('ontology.edit.sourceTermIds')"><Input v-model:value="relForm.sourceTermIds" data-testid="ontology-ai-rel-sources" /></Form.Item>
        <Form.Item :label="t('ontology.edit.candidateTermIds')"><Input v-model:value="relForm.candidateTermIds" data-testid="ontology-ai-rel-candidates" /></Form.Item>
        <Form.Item :label="t('ontology.edit.relationshipTypeIds')"><Input v-model:value="relForm.relationshipTypeIds" data-testid="ontology-ai-rel-types" /></Form.Item>
        <Form.Item :label="t('ontology.edit.maxSuggestions')"><Input v-model:value="relForm.maxSuggestions" data-testid="ontology-ai-rel-max" /></Form.Item>
        <Form.Item>
          <Button :loading="busy === 'rel'" data-testid="ontology-ai-rel-suggest" @click="onSuggestRelationships">
            {{ t('ontology.edit.suggestRelationships') }}
          </Button>
        </Form.Item>
      </Form>
      <ul v-if="relSuggestions.length" data-testid="ontology-ai-rel-results">
        <li v-for="item in relSuggestions" :key="item.id">
          {{ item.rationale ?? '' }} ({{ t('ontology.edit.confidence', { value: item.confidence ?? '' }) }})
        </li>
      </ul>
      <Form layout="inline" data-testid="ontology-ai-map-form">
        <Form.Item :label="t('ontology.edit.glossary')"><Input v-model:value="mapForm.glossary" data-testid="ontology-ai-map-glossary" /></Form.Item>
        <Form.Item :label="t('ontology.edit.sourceTermIds')"><Input v-model:value="mapForm.sourceTermIds" data-testid="ontology-ai-map-sources" /></Form.Item>
        <Form.Item :label="t('ontology.edit.standards')"><Input v-model:value="mapForm.standards" data-testid="ontology-ai-map-standards" /></Form.Item>
        <Form.Item :label="t('ontology.edit.maxSuggestions')"><Input v-model:value="mapForm.maxSuggestions" data-testid="ontology-ai-map-max" /></Form.Item>
        <Form.Item>
          <Button :loading="busy === 'map'" data-testid="ontology-ai-map-suggest" @click="onSuggestMappings">
            {{ t('ontology.edit.suggestMappings') }}
          </Button>
        </Form.Item>
      </Form>
      <ul v-if="mapSuggestions.length" data-testid="ontology-ai-map-results">
        <li v-for="item in mapSuggestions" :key="item.id">
          {{ item.targetLabel ?? '' }} — {{ item.rationale ?? '' }} ({{ t('ontology.edit.confidence', { value: item.confidence ?? '' }) }})
        </li>
      </ul>
      <Form layout="inline" data-testid="ontology-ai-draft-form">
        <Form.Item :label="t('ontology.edit.glossary')"><Input v-model:value="draftForm.glossary" data-testid="ontology-ai-draft-glossary" /></Form.Item>
        <Form.Item :label="t('ontology.edit.changeSetName')"><Input v-model:value="draftForm.changeSetName" data-testid="ontology-ai-draft-name" /></Form.Item>
        <Form.Item :label="t('ontology.edit.draftDisplayName')"><Input v-model:value="draftForm.displayName" data-testid="ontology-ai-draft-display-name" /></Form.Item>
        <Form.Item :label="t('ontology.edit.draftDescription')"><Input v-model:value="draftForm.description" data-testid="ontology-ai-draft-description" /></Form.Item>
        <Form.Item :label="t('ontology.edit.domainDescription')"><Input v-model:value="draftForm.domainDescription" data-testid="ontology-ai-draft-domain" /></Form.Item>
        <Form.Item :label="t('ontology.edit.maxConcepts')"><Input v-model:value="draftForm.maxConcepts" data-testid="ontology-ai-draft-max" /></Form.Item>
        <Form.Item>
          <Button :loading="busy === 'draft'" data-testid="ontology-ai-draft-generate" @click="onGenerateDraft">
            {{ t('ontology.edit.generateDraft') }}
          </Button>
        </Form.Item>
      </Form>
      <div v-if="draftPreview" data-testid="ontology-ai-draft-preview">
        <pre style="white-space: pre-wrap">{{ draftPreview }}</pre>
        <Button type="primary" :disabled="!canEdit" :loading="busy === 'create'" data-testid="ontology-ai-draft-create" @click="onCreateDraftFromAi">
          {{ t('ontology.edit.createDraftFromAi') }}
        </Button>
      </div>
    </Space>
  </Card>
</template>
