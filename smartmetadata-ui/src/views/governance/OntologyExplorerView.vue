<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute, useRouter } from 'vue-router';
import { Button, Card, Empty, Form, Input, Select, Space, Typography, message } from 'ant-design-vue';
import FormModal from '@/components/shared/FormModal.vue';
import PageHeader from '@/components/shared/PageHeader.vue';
import SmTable from '@/components/shared/SmTable.vue';
import {
  createOntology,
  getOntology,
  listOntologies,
  listOntologyConcepts,
  listOntologyProperties,
} from '@/api/ontology';
import type { Ontology, OntologyConcept, OntologyProperty } from '@/types/ontology';
import { entityLabel, joinRefNames } from '@/features/crud/paging';

const { t } = useI18n();
const route = useRoute();
const router = useRouter();

/**
 * Official page shape (pages/OntologyExplorerPage): the studio is selected
 * by the ?ontology= query param and loads the ontology with owners,reviewers
 * plus its concepts and properties (studio model: concepts/properties listed
 * by ontology fqn). The graph canvas, SPARQL console, edit lock and
 * release/publication flows are separate subsystems and are not faked here;
 * this page lands the studio's view-mode data surfaces plus create.
 */
const loading = ref(false);
const detailLoading = ref(false);
const errorMessage = ref('');
const ontologies = ref<Ontology[]>([]);
const selectedId = ref<string | undefined>(undefined);
const ontology = ref<Ontology | null>(null);
const concepts = ref<OntologyConcept[]>([]);
const properties = ref<OntologyProperty[]>([]);

const showCreateModal = ref(false);
const creating = ref(false);
const formError = ref('');
const createForm = ref({ name: '', displayName: '', description: '', iri: '', namespace: '' });

const conceptColumns = computed(() => [
  { title: t('ontology.concepts.name'), dataIndex: 'name', key: 'name' },
  { title: t('ontology.concepts.type'), dataIndex: 'conceptType', key: 'conceptType' },
  { title: t('ontology.concepts.iri'), dataIndex: 'iri', key: 'iri' },
  { title: t('ontology.concepts.status'), dataIndex: 'lifecycleStatus', key: 'lifecycleStatus' },
  { title: t('ontology.concepts.description'), dataIndex: 'description', key: 'description' },
]);

const propertyColumns = computed(() => [
  { title: t('ontology.properties.name'), dataIndex: 'name', key: 'name' },
  { title: t('ontology.properties.kind'), dataIndex: 'kind', key: 'kind' },
  { title: t('ontology.properties.domain'), dataIndex: 'domain', key: 'domain' },
  { title: t('ontology.properties.range'), dataIndex: 'range', key: 'range' },
  { title: t('ontology.properties.description'), dataIndex: 'description', key: 'description' },
]);

async function loadDetail(id: string): Promise<void> {
  detailLoading.value = true;
  errorMessage.value = '';
  try {
    const detail = await getOntology(id);
    ontology.value = detail;
    const fqn = detail.fullyQualifiedName || detail.name;
    const [conceptPage, propertyPage] = await Promise.all([
      listOntologyConcepts({ ontology: fqn, limit: 50 }),
      listOntologyProperties({ ontology: fqn, limit: 50 }),
    ]);
    concepts.value = conceptPage.data;
    properties.value = propertyPage.data;
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : t('crud.loadFailed');
    ontology.value = null;
    concepts.value = [];
    properties.value = [];
  } finally {
    detailLoading.value = false;
  }
}

async function loadCatalog(): Promise<void> {
  loading.value = true;
  errorMessage.value = '';
  try {
    const page = await listOntologies({ limit: 100 });
    ontologies.value = page.data;
    const requested = typeof route.query.ontology === 'string' ? route.query.ontology : undefined;
    const target = page.data.find((item) => item.id === requested) ?? page.data[0];
    if (target) {
      selectedId.value = target.id;
      if (requested !== target.id) {
        void router.replace({ query: { ...route.query, ontology: target.id } });
      }
      await loadDetail(target.id);
    }
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : t('crud.loadFailed');
  } finally {
    loading.value = false;
  }
}

function onSelect(value: string | number | undefined): void {
  if (value === undefined) {
    return;
  }
  const id = String(value);
  selectedId.value = id;
  void router.replace({ query: { ...route.query, ontology: id } });
  void loadDetail(id);
}

async function onCreate(): Promise<void> {
  const name = createForm.value.name.trim();
  const iri = createForm.value.iri.trim();
  const namespace = createForm.value.namespace.trim();
  if (!name || !iri || !namespace) {
    formError.value = t('ontology.createRequired');
    return;
  }
  formError.value = '';
  creating.value = true;
  try {
    const created = await createOntology({
      name,
      iri,
      namespace,
      displayName: createForm.value.displayName.trim() || undefined,
      description: createForm.value.description.trim() || undefined,
    });
    showCreateModal.value = false;
    message.success(t('ontology.created', { name: created.name }));
    await loadCatalog();
    if (created.id) {
      onSelect(created.id);
    }
  } catch (error) {
    formError.value = error instanceof Error ? error.message : t('crud.loadFailed');
  } finally {
    creating.value = false;
  }
}

watch(
  () => route.query.ontology,
  (value) => {
    if (typeof value === 'string' && value && value !== selectedId.value) {
      selectedId.value = value;
      void loadDetail(value);
    }
  },
);

onMounted(() => {
  void loadCatalog();
});
</script>

<template>
  <div data-testid="ontology-explorer" data-tour-step="ontology-studio" data-tour-page>
    <PageHeader :header="t('ontology.title')" :sub-header="t('ontology.lead')" />
    <Typography.Text v-if="errorMessage" type="danger" data-testid="ontology-error">
      {{ errorMessage }}
    </Typography.Text>
    <Space style="margin-bottom: 16px" data-testid="ontology-controls">
      <Select
        v-model:value="selectedId"
        data-testid="ontology-select"
        :placeholder="t('ontology.selectPlaceholder')"
        style="min-width: 260px"
        :loading="loading"
        @change="onSelect"
      >
        <Select.Option v-for="item in ontologies" :key="item.id" :value="item.id">
          {{ entityLabel(item) }}
        </Select.Option>
      </Select>
      <Button type="primary" data-testid="ontology-create" @click="showCreateModal = true">
        {{ t('ontology.create') }}
      </Button>
    </Space>
    <Empty
      v-if="!loading && ontologies.length === 0 && !errorMessage"
      :description="t('ontology.empty')"
      data-testid="ontology-empty"
    >
      <Button type="primary" data-testid="ontology-empty-create" @click="showCreateModal = true">
        {{ t('ontology.create') }}
      </Button>
    </Empty>
    <div v-if="ontology" data-testid="ontology-detail">
      <Card :loading="detailLoading" :title="entityLabel(ontology)" style="margin-bottom: 16px">
        <Typography.Paragraph v-if="ontology.description" type="secondary">
          {{ ontology.description }}
        </Typography.Paragraph>
        <Space direction="vertical">
          <Typography.Text v-if="ontology.iri">{{ t('ontology.iri') }}: {{ ontology.iri }}</Typography.Text>
          <Typography.Text v-if="ontology.namespace">{{ t('ontology.namespace') }}: {{ ontology.namespace }}</Typography.Text>
          <Typography.Text v-if="ontology.layer">{{ t('ontology.layer') }}: {{ ontology.layer }}</Typography.Text>
          <Typography.Text v-if="ontology.publicationStatus">{{ t('ontology.publicationStatus') }}: {{ ontology.publicationStatus }}</Typography.Text>
          <Typography.Text v-if="ontology.owners.length > 0">{{ t('ontology.owners') }}: {{ joinRefNames(ontology.owners) }}</Typography.Text>
          <Typography.Text v-if="ontology.reviewers.length > 0">{{ t('ontology.reviewers') }}: {{ joinRefNames(ontology.reviewers) }}</Typography.Text>
        </Space>
      </Card>
      <Card :title="`${t('ontology.concepts.title')} (${concepts.length})`" style="margin-bottom: 16px" data-testid="ontology-concepts">
        <SmTable
          row-key="id"
          test-id="ontology-concepts-table"
          size="small"
          :columns="conceptColumns"
          :data-source="concepts"
          :loading="detailLoading"
          :pagination="false"
          :empty-text="t('ontology.concepts.empty')"
        >
          <template #bodyCell="{ column, record }">
            <template v-if="column.key === 'name'">
              {{ entityLabel(record as OntologyConcept) }}
            </template>
            <template v-else-if="column.key === 'description'">
              {{ (record as OntologyConcept).description || '—' }}
            </template>
            <template v-else-if="column.key === 'conceptType'">
              {{ (record as OntologyConcept).conceptType || '—' }}
            </template>
            <template v-else-if="column.key === 'iri'">
              {{ (record as OntologyConcept).iri || '—' }}
            </template>
            <template v-else-if="column.key === 'lifecycleStatus'">
              {{ (record as OntologyConcept).lifecycleStatus || '—' }}
            </template>
          </template>
        </SmTable>
      </Card>
      <Card :title="`${t('ontology.properties.title')} (${properties.length})`" data-testid="ontology-properties">
        <SmTable
          row-key="id"
          test-id="ontology-properties-table"
          size="small"
          :columns="propertyColumns"
          :data-source="properties"
          :loading="detailLoading"
          :pagination="false"
          :empty-text="t('ontology.properties.empty')"
        >
          <template #bodyCell="{ column, record }">
            <template v-if="column.key === 'name'">
              {{ entityLabel(record as OntologyProperty) }}
            </template>
            <template v-else-if="column.key === 'description'">
              {{ (record as OntologyProperty).description || '—' }}
            </template>
            <template v-else-if="column.key === 'kind'">
              {{ (record as OntologyProperty).kind || '—' }}
            </template>
            <template v-else-if="column.key === 'domain'">
              {{ (record as OntologyProperty).domain || '—' }}
            </template>
            <template v-else-if="column.key === 'range'">
              {{ (record as OntologyProperty).range || '—' }}
            </template>
          </template>
        </SmTable>
      </Card>
    </div>
    <FormModal
      :get-container="false"
      :open="showCreateModal"
      :title="t('ontology.create')"
      :ok-text="t('crud.create')"
      :cancel-text="t('crud.cancel')"
      :confirm-loading="creating"
      @ok="onCreate"
      @cancel="showCreateModal = false"
    >
      <Typography.Text v-if="formError" type="danger" data-testid="ontology-form-error">{{ formError }}</Typography.Text>
      <Form layout="vertical">
        <Form.Item :label="t('crud.name')" required>
          <Input v-model:value="createForm.name" data-testid="ontology-create-name" />
        </Form.Item>
        <Form.Item :label="t('crud.displayName')" :extra="t('crud.displayNameHelp')">
          <Input v-model:value="createForm.displayName" />
        </Form.Item>
        <Form.Item :label="t('crud.description')">
          <Input.TextArea v-model:value="createForm.description" :rows="3" data-testid="ontology-create-description" />
        </Form.Item>
        <Form.Item :label="t('ontology.iri')" required>
          <Input v-model:value="createForm.iri" data-testid="ontology-create-iri" />
        </Form.Item>
        <Form.Item :label="t('ontology.namespace')" required>
          <Input v-model:value="createForm.namespace" data-testid="ontology-create-namespace" />
        </Form.Item>
      </Form>
    </FormModal>
  </div>
</template>
