<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { Button, Card, Form, Input, Select, Space, Typography, message } from 'ant-design-vue';
import {
  createOntologyAxiom,
  createOntologyConcept,
  createOntologyProperty,
  patchOntologyConcept,
  previewGlossaryTermDeleteImpact,
} from '@/api/ontologyEdit';
import type { OntologyDeleteImpact } from '@/types/ontologyEdit';

const props = defineProps<{
  ontologyFqn: string;
  canEdit: boolean;
}>();

const { t } = useI18n();

const conceptForm = ref({ name: '', displayName: '', description: '', iri: '', conceptType: 'SKOS_CONCEPT', synonyms: '' });
const patchForm = ref({ id: '', displayName: '', description: '', synonyms: '' });
const propertyForm = ref({ name: '', displayName: '', description: '', iri: '', kind: '', domain: '', range: '' });
const axiomForm = ref({ name: '', displayName: '', description: '', axiomType: '', subjectIri: '', targetIri: '', literal: '' });
const impactTermId = ref('');
const impact = ref<OntologyDeleteImpact | null>(null);
const errorMessage = ref('');
const busy = ref('');

function synonymsList(value: string): string[] | undefined {
  const list = value.split(',').map((item) => item.trim()).filter(Boolean);
  return list.length ? list : undefined;
}

async function run(key: string, task: () => Promise<unknown>, okKey: string): Promise<void> {
  if (!props.canEdit || busy.value) {
    return;
  }
  busy.value = key;
  errorMessage.value = '';
  try {
    await task();
    message.success(t(okKey));
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : t('ontology.edit.writeFailed');
  } finally {
    busy.value = '';
  }
}

async function onCreateConcept(): Promise<void> {
  await run('concept', () => createOntologyConcept({
    name: conceptForm.value.name,
    ontology: props.ontologyFqn,
    conceptType: conceptForm.value.conceptType,
    displayName: conceptForm.value.displayName || undefined,
    description: conceptForm.value.description || undefined,
    iri: conceptForm.value.iri || undefined,
    synonyms: synonymsList(conceptForm.value.synonyms),
  }), 'ontology.edit.conceptCreated');
}

async function onPatchConcept(): Promise<void> {
  const patch = [
    ...(patchForm.value.displayName ? [{ op: 'replace' as const, path: '/displayName', value: patchForm.value.displayName }] : []),
    ...(patchForm.value.description ? [{ op: 'replace' as const, path: '/description', value: patchForm.value.description }] : []),
    ...(patchForm.value.synonyms ? [{ op: 'replace' as const, path: '/synonyms', value: synonymsList(patchForm.value.synonyms) }] : []),
  ];
  if (!patch.length) {
    return;
  }
  await run('patch', () => patchOntologyConcept(patchForm.value.id, patch), 'ontology.edit.conceptPatched');
}

async function onCreateProperty(): Promise<void> {
  await run('property', () => createOntologyProperty({
    name: propertyForm.value.name,
    ontology: props.ontologyFqn,
    kind: propertyForm.value.kind || undefined,
    displayName: propertyForm.value.displayName || undefined,
    description: propertyForm.value.description || undefined,
    iri: propertyForm.value.iri || undefined,
    domain: propertyForm.value.domain || undefined,
    range: propertyForm.value.range || undefined,
  }), 'ontology.edit.propertyCreated');
}

async function onCreateAxiom(): Promise<void> {
  await run('axiom', () => createOntologyAxiom({
    name: axiomForm.value.name,
    ontology: props.ontologyFqn,
    axiomType: axiomForm.value.axiomType || undefined,
    displayName: axiomForm.value.displayName || undefined,
    description: axiomForm.value.description || undefined,
    subjectIri: axiomForm.value.subjectIri || undefined,
    targetIri: axiomForm.value.targetIri || undefined,
    literal: axiomForm.value.literal || undefined,
  }), 'ontology.edit.axiomCreated');
}

async function onPreviewImpact(): Promise<void> {
  if (!impactTermId.value) {
    return;
  }
  busy.value = 'impact';
  errorMessage.value = '';
  try {
    impact.value = await previewGlossaryTermDeleteImpact(impactTermId.value);
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : t('ontology.edit.writeFailed');
  } finally {
    busy.value = '';
  }
}
</script>

<template>
  <Card data-testid="ontology-concept-editor" style="margin-bottom: 16px">
    <Space direction="vertical" style="width: 100%">
      <Typography.Text strong>{{ t('ontology.edit.conceptEditorTitle') }}</Typography.Text>
      <Typography.Text v-if="errorMessage" type="danger">{{ errorMessage }}</Typography.Text>
      <Form layout="inline" data-testid="ontology-concept-create-form">
        <Form.Item :label="t('ontology.edit.name')"><Input v-model:value="conceptForm.name" data-testid="ontology-concept-name" /></Form.Item>
        <Form.Item :label="t('ontology.edit.displayName')"><Input v-model:value="conceptForm.displayName" data-testid="ontology-concept-display-name" /></Form.Item>
        <Form.Item :label="t('ontology.edit.description')"><Input v-model:value="conceptForm.description" data-testid="ontology-concept-description" /></Form.Item>
        <Form.Item :label="t('ontology.edit.iri')"><Input v-model:value="conceptForm.iri" data-testid="ontology-concept-iri" /></Form.Item>
        <Form.Item :label="t('ontology.edit.conceptType')">
          <Select v-model:value="conceptForm.conceptType" style="width: 150px" data-testid="ontology-concept-type">
            <Select.Option value="SKOS_CONCEPT">SKOS_CONCEPT</Select.Option>
            <Select.Option value="OWL_CLASS">OWL_CLASS</Select.Option>
            <Select.Option value="BOTH">BOTH</Select.Option>
          </Select>
        </Form.Item>
        <Form.Item :label="t('ontology.edit.synonyms')"><Input v-model:value="conceptForm.synonyms" data-testid="ontology-concept-synonyms" /></Form.Item>
        <Form.Item>
          <Button type="primary" :disabled="!canEdit || !conceptForm.name" :loading="busy === 'concept'" data-testid="ontology-concept-create" @click="onCreateConcept">
            {{ t('ontology.edit.createConcept') }}
          </Button>
        </Form.Item>
      </Form>
      <Form layout="inline" data-testid="ontology-concept-patch-form">
        <Form.Item :label="t('ontology.edit.conceptId')"><Input v-model:value="patchForm.id" data-testid="ontology-concept-patch-id" /></Form.Item>
        <Form.Item :label="t('ontology.edit.displayName')"><Input v-model:value="patchForm.displayName" data-testid="ontology-concept-patch-display-name" /></Form.Item>
        <Form.Item :label="t('ontology.edit.description')"><Input v-model:value="patchForm.description" data-testid="ontology-concept-patch-description" /></Form.Item>
        <Form.Item :label="t('ontology.edit.synonyms')"><Input v-model:value="patchForm.synonyms" data-testid="ontology-concept-patch-synonyms" /></Form.Item>
        <Form.Item>
          <Button :disabled="!canEdit || !patchForm.id" :loading="busy === 'patch'" data-testid="ontology-concept-patch" @click="onPatchConcept">
            {{ t('ontology.edit.patchConcept') }}
          </Button>
        </Form.Item>
      </Form>
      <Form layout="inline" data-testid="ontology-property-create-form">
        <Form.Item :label="t('ontology.edit.name')"><Input v-model:value="propertyForm.name" data-testid="ontology-property-name" /></Form.Item>
        <Form.Item :label="t('ontology.edit.displayName')"><Input v-model:value="propertyForm.displayName" data-testid="ontology-property-display-name" /></Form.Item>
        <Form.Item :label="t('ontology.edit.kind')"><Input v-model:value="propertyForm.kind" data-testid="ontology-property-kind" /></Form.Item>
        <Form.Item :label="t('ontology.edit.domain')"><Input v-model:value="propertyForm.domain" data-testid="ontology-property-domain" /></Form.Item>
        <Form.Item :label="t('ontology.edit.range')"><Input v-model:value="propertyForm.range" data-testid="ontology-property-range" /></Form.Item>
        <Form.Item>
          <Button :disabled="!canEdit || !propertyForm.name" :loading="busy === 'property'" data-testid="ontology-property-create" @click="onCreateProperty">
            {{ t('ontology.edit.createProperty') }}
          </Button>
        </Form.Item>
      </Form>
      <Form layout="inline" data-testid="ontology-axiom-create-form">
        <Form.Item :label="t('ontology.edit.name')"><Input v-model:value="axiomForm.name" data-testid="ontology-axiom-name" /></Form.Item>
        <Form.Item :label="t('ontology.edit.axiomType')"><Input v-model:value="axiomForm.axiomType" data-testid="ontology-axiom-type" /></Form.Item>
        <Form.Item :label="t('ontology.edit.subjectIri')"><Input v-model:value="axiomForm.subjectIri" data-testid="ontology-axiom-subject" /></Form.Item>
        <Form.Item :label="t('ontology.edit.targetIri')"><Input v-model:value="axiomForm.targetIri" data-testid="ontology-axiom-target" /></Form.Item>
        <Form.Item>
          <Button :disabled="!canEdit || !axiomForm.name" :loading="busy === 'axiom'" data-testid="ontology-axiom-create" @click="onCreateAxiom">
            {{ t('ontology.edit.createAxiom') }}
          </Button>
        </Form.Item>
      </Form>
      <Form layout="inline" data-testid="ontology-impact-form">
        <Form.Item :label="t('ontology.edit.impactTermId')"><Input v-model:value="impactTermId" data-testid="ontology-impact-term-id" /></Form.Item>
        <Form.Item>
          <Button :disabled="!impactTermId" :loading="busy === 'impact'" data-testid="ontology-impact-preview" @click="onPreviewImpact">
            {{ t('ontology.edit.previewImpact') }}
          </Button>
        </Form.Item>
      </Form>
      <div v-if="impact" data-testid="ontology-impact-result">
        <Typography.Text>
          {{ t('ontology.edit.impactSummary', { bound: impact.boundAssetCount ?? 0, children: impact.children?.length ?? 0, mappings: impact.mappingCount ?? 0 }) }}
        </Typography.Text>
        <Typography.Text v-if="impact.boundAssetsTruncated" type="warning">
          {{ t('ontology.edit.impactTruncated') }}
        </Typography.Text>
        <ul>
          <li v-for="asset in impact.boundAssets" :key="asset.id ?? asset.name">
            {{ asset.fullyQualifiedName || asset.name }} ({{ asset.type }})
          </li>
        </ul>
      </div>
    </Space>
  </Card>
</template>
