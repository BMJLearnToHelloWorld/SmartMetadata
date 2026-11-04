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
  getOntologyConcept,
  getOntologyConceptBindings,
  getOntologyPackSample,
  listOntologies,
  listOntologyAxioms,
  listOntologyConcepts,
  listOntologyProperties,
  listOntologyPacks,
  listOntologyReleases,
} from '@/api/ontology';
import type {
  Ontology,
  OntologyAxiom,
  OntologyConcept,
  OntologyConceptBinding,
  OntologyPack,
  OntologyPackSample,
  OntologyProperty,
  OntologyRelease,
} from '@/types/ontology';
import { entityLabel, joinRefNames } from '@/features/crud/paging';
import type { EntityRef } from '@/types/api';

const { t } = useI18n();
const route = useRoute();
const router = useRouter();

/**
 * Official page shape (pages/OntologyExplorerPage): the studio is selected
 * by the ?ontology= query param and loads the ontology with owners,reviewers
 * plus its concepts and properties (studio model: concepts/properties listed
 * by ontology fqn). This page lands the studio's view-mode data surfaces
 * plus create: concept detail with hierarchy navigation and bindings,
 * concept/property search and paging, axioms, sealed releases, and the
 * library-pack catalogue with sample previews. The graph canvas, edit
 * mode with locks, drafts/changesets, publication, reviews, AI assistant,
 * import and pack install are separate subsystems and are not faked here.
 */
const loading = ref(false);
const detailLoading = ref(false);
const errorMessage = ref('');
const ontologies = ref<Ontology[]>([]);
const selectedId = ref<string | undefined>(undefined);
const ontology = ref<Ontology | null>(null);
const concepts = ref<OntologyConcept[]>([]);
const properties = ref<OntologyProperty[]>([]);
const conceptFilter = ref('');
const propertyFilter = ref('');
const conceptAfter = ref<string | undefined>(undefined);
const propertyAfter = ref<string | undefined>(undefined);
const loadingMoreConcepts = ref(false);
const loadingMoreProperties = ref(false);
const selectedConcept = ref<OntologyConcept | null>(null);
const conceptDetailLoading = ref(false);
const conceptBindings = ref<OntologyConceptBinding[]>([]);
const axioms = ref<OntologyAxiom[]>([]);
const releases = ref<OntologyRelease[]>([]);
const packs = ref<OntologyPack[]>([]);
const packsError = ref('');
const sampleByPack = ref<Record<string, OntologyPackSample>>({});
const samplingPack = ref<string | null>(null);

const filteredConcepts = computed(() => {
  const q = conceptFilter.value.trim().toLowerCase();
  if (!q) {
    return concepts.value;
  }
  return concepts.value.filter((item) =>
    [item.displayName, item.name, item.iri, item.description]
      .filter(Boolean)
      .some((text) => (text as string).toLowerCase().includes(q)),
  );
});

const filteredProperties = computed(() => {
  const q = propertyFilter.value.trim().toLowerCase();
  if (!q) {
    return properties.value;
  }
  return properties.value.filter((item) =>
    [item.displayName, item.name, item.iri, item.kind, item.domain, item.range]
      .filter(Boolean)
      .some((text) => (text as string).toLowerCase().includes(q)),
  );
});

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
  selectedConcept.value = null;
  conceptBindings.value = [];
  try {
    const detail = await getOntology(id);
    ontology.value = detail;
    const fqn = detail.fullyQualifiedName || detail.name;
    const [conceptPage, propertyPage, axiomPage, releasePage] = await Promise.all([
      listOntologyConcepts({ ontology: fqn, limit: 50 }),
      listOntologyProperties({ ontology: fqn, limit: 50 }),
      listOntologyAxioms({ ontologyId: id, limit: 50 }).catch(() => ({ data: [], after: undefined })),
      listOntologyReleases({ ontologyId: id, limit: 50 }).catch(() => ({ data: [], after: undefined })),
    ]);
    concepts.value = conceptPage.data;
    conceptAfter.value = conceptPage.after;
    properties.value = propertyPage.data;
    propertyAfter.value = propertyPage.after;
    axioms.value = axiomPage.data;
    releases.value = releasePage.data;
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : t('crud.loadFailed');
    ontology.value = null;
    concepts.value = [];
    properties.value = [];
    axioms.value = [];
    releases.value = [];
  } finally {
    detailLoading.value = false;
  }
}

async function loadMoreConcepts(): Promise<void> {
  if (!ontology.value || !conceptAfter.value || loadingMoreConcepts.value) {
    return;
  }
  loadingMoreConcepts.value = true;
  try {
    const page = await listOntologyConcepts({
      ontology: ontology.value.fullyQualifiedName || ontology.value.name,
      limit: 50,
      after: conceptAfter.value,
    });
    concepts.value = [...concepts.value, ...page.data];
    conceptAfter.value = page.after;
  } finally {
    loadingMoreConcepts.value = false;
  }
}

async function loadMoreProperties(): Promise<void> {
  if (!ontology.value || !propertyAfter.value || loadingMoreProperties.value) {
    return;
  }
  loadingMoreProperties.value = true;
  try {
    const page = await listOntologyProperties({
      ontology: ontology.value.fullyQualifiedName || ontology.value.name,
      limit: 50,
      after: propertyAfter.value,
    });
    properties.value = [...properties.value, ...page.data];
    propertyAfter.value = page.after;
  } finally {
    loadingMoreProperties.value = false;
  }
}

async function openConceptDetail(id: string): Promise<void> {
  conceptDetailLoading.value = true;
  try {
    const [detail, bindings] = await Promise.all([
      getOntologyConcept(id),
      getOntologyConceptBindings(id).catch(() => ({ assets: [], after: undefined })),
    ]);
    selectedConcept.value = detail;
    conceptBindings.value = bindings.assets;
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('crud.loadFailed'));
  } finally {
    conceptDetailLoading.value = false;
  }
}

function openConceptRef(ref: EntityRef): void {
  if (ref.id) {
    void openConceptDetail(ref.id);
  }
}

async function loadPacks(): Promise<void> {
  try {
    packs.value = await listOntologyPacks();
    packsError.value = '';
  } catch (error) {
    packs.value = [];
    packsError.value = error instanceof Error ? error.message : t('crud.loadFailed');
  }
}

async function onSamplePack(pack: OntologyPack): Promise<void> {
  const moduleIds = pack.modules.map((item) => item.id ?? item.name).filter(Boolean);
  if (!pack.id && !pack.name) {
    return;
  }
  samplingPack.value = pack.name;
  try {
    sampleByPack.value = {
      ...sampleByPack.value,
      [pack.name]: await getOntologyPackSample(pack.id ?? pack.name, moduleIds),
    };
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('crud.loadFailed'));
  } finally {
    samplingPack.value = null;
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
  void loadPacks();
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
      <Card
        v-if="selectedConcept"
        :loading="conceptDetailLoading"
        :title="entityLabel(selectedConcept)"
        style="margin-bottom: 16px"
        data-testid="ontology-concept-detail"
      >
        <template #extra>
          <Button size="small" data-testid="ontology-concept-close" @click="selectedConcept = null">
            {{ t('crud.close') }}
          </Button>
        </template>
        <Typography.Paragraph v-if="selectedConcept.description" type="secondary">
          {{ selectedConcept.description }}
        </Typography.Paragraph>
        <Space direction="vertical">
          <Typography.Text v-if="selectedConcept.iri">
            {{ t('ontology.iri') }}: {{ selectedConcept.iri }}
          </Typography.Text>
          <Typography.Text v-if="selectedConcept.conceptType">
            {{ t('ontology.concepts.type') }}: {{ selectedConcept.conceptType }}
          </Typography.Text>
          <Typography.Text v-if="selectedConcept.lifecycleStatus">
            {{ t('ontology.concepts.status') }}: {{ selectedConcept.lifecycleStatus }}
          </Typography.Text>
          <Typography.Text v-if="selectedConcept.synonyms?.length">
            {{ t('ontology.concepts.synonyms') }}: {{ selectedConcept.synonyms.join(', ') }}
          </Typography.Text>
          <Typography.Text v-if="selectedConcept.superClasses?.length">
            {{ t('ontology.concepts.superClasses') }}:
            <span v-for="(ref, index) in selectedConcept.superClasses" :key="ref.id || ref.name">
              <a v-if="ref.id" href="#" @click.prevent="openConceptRef(ref)">{{ entityLabel(ref) }}</a>
              <span v-else>{{ entityLabel(ref) }}</span>
              <span v-if="index < (selectedConcept.superClasses?.length ?? 0) - 1">, </span>
            </span>
          </Typography.Text>
          <Typography.Text v-if="selectedConcept.subClasses?.length">
            {{ t('ontology.concepts.subClasses') }}:
            <span v-for="(ref, index) in selectedConcept.subClasses" :key="ref.id || ref.name">
              <a v-if="ref.id" href="#" @click.prevent="openConceptRef(ref)">{{ entityLabel(ref) }}</a>
              <span v-else>{{ entityLabel(ref) }}</span>
              <span v-if="index < (selectedConcept.subClasses?.length ?? 0) - 1">, </span>
            </span>
          </Typography.Text>
          <Typography.Text v-if="selectedConcept.owners.length">
            {{ t('ontology.owners') }}: {{ joinRefNames(selectedConcept.owners) }}
          </Typography.Text>
        </Space>
        <div v-if="conceptBindings.length" style="margin-top: 12px" data-testid="ontology-concept-bindings">
          <Typography.Title :level="5">{{ t('ontology.concepts.bindingsTitle') }}</Typography.Title>
          <SmTable
            row-key="assetId"
            size="small"
            :columns="[
              { title: t('crud.name'), key: 'name' },
              { title: t('crud.type'), key: 'type', width: 140 },
              { title: t('ontology.concepts.bindingColumns'), key: 'columns', width: 110 },
            ]"
            :data-source="conceptBindings"
            :pagination="false"
          >
            <template #bodyCell="{ column, record }">
              <template v-if="column.key === 'name'">
                {{ entityLabel((record as OntologyConceptBinding).asset) }}
              </template>
              <template v-else-if="column.key === 'type'">
                {{ (record as OntologyConceptBinding).assetType || '—' }}
              </template>
              <template v-else-if="column.key === 'columns'">
                {{ (record as OntologyConceptBinding).columnCount ?? '—' }}
              </template>
            </template>
          </SmTable>
        </div>
      </Card>
      <Card :title="`${t('ontology.concepts.title')} (${concepts.length})`" style="margin-bottom: 16px" data-testid="ontology-concepts">
        <Input
          v-model:value="conceptFilter"
          allow-clear
          data-testid="ontology-concepts-search"
          :placeholder="t('ontology.concepts.searchPlaceholder')"
          style="margin-bottom: 12px"
        />
        <SmTable
          row-key="id"
          test-id="ontology-concepts-table"
          size="small"
          :columns="conceptColumns"
          :data-source="filteredConcepts"
          :loading="detailLoading"
          :pagination="false"
          :empty-text="t('ontology.concepts.empty')"
        >
          <template #bodyCell="{ column, record }">
            <template v-if="column.key === 'name'">
              <a href="#" @click.prevent="openConceptDetail((record as OntologyConcept).id)">
                {{ entityLabel(record as OntologyConcept) }}
              </a>
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
        <Button
          v-if="conceptAfter"
          style="margin-top: 12px"
          data-testid="ontology-concepts-load-more"
          :loading="loadingMoreConcepts"
          @click="loadMoreConcepts"
        >
          {{ t('ontology.loadMore') }}
        </Button>
      </Card>
      <Card :title="`${t('ontology.properties.title')} (${properties.length})`" style="margin-bottom: 16px" data-testid="ontology-properties">
        <Input
          v-model:value="propertyFilter"
          allow-clear
          data-testid="ontology-properties-search"
          :placeholder="t('ontology.properties.searchPlaceholder')"
          style="margin-bottom: 12px"
        />
        <SmTable
          row-key="id"
          test-id="ontology-properties-table"
          size="small"
          :columns="propertyColumns"
          :data-source="filteredProperties"
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
        <Button
          v-if="propertyAfter"
          style="margin-top: 12px"
          data-testid="ontology-properties-load-more"
          :loading="loadingMoreProperties"
          @click="loadMoreProperties"
        >
          {{ t('ontology.loadMore') }}
        </Button>
      </Card>
      <Card :title="`${t('ontology.axioms.title')} (${axioms.length})`" style="margin-bottom: 16px" data-testid="ontology-axioms">
        <SmTable
          row-key="id"
          test-id="ontology-axioms-table"
          size="small"
          :columns="[
            { title: t('ontology.axioms.name'), key: 'name' },
            { title: t('ontology.axioms.type'), key: 'axiomType', width: 160 },
            { title: t('ontology.axioms.subject'), key: 'subject' },
            { title: t('ontology.axioms.target'), key: 'target' },
          ]"
          :data-source="axioms"
          :loading="detailLoading"
          :pagination="false"
          :empty-text="t('ontology.axioms.empty')"
        >
          <template #bodyCell="{ column, record }">
            <template v-if="column.key === 'name'">
              {{ entityLabel(record as OntologyAxiom) }}
            </template>
            <template v-else-if="column.key === 'axiomType'">
              {{ (record as OntologyAxiom).axiomType || '—' }}
            </template>
            <template v-else-if="column.key === 'subject'">
              {{ (record as OntologyAxiom).subjectIri || '—' }}
            </template>
            <template v-else-if="column.key === 'target'">
              {{ (record as OntologyAxiom).targetIri || (record as OntologyAxiom).literal || '—' }}
            </template>
          </template>
        </SmTable>
      </Card>
      <Card :title="`${t('ontology.releases.title')} (${releases.length})`" style="margin-bottom: 16px" data-testid="ontology-releases">
        <SmTable
          row-key="id"
          test-id="ontology-releases-table"
          size="small"
          :columns="[
            { title: t('ontology.releases.name'), key: 'name' },
            { title: t('ontology.releases.version'), key: 'version', width: 140 },
            { title: t('ontology.releases.members'), key: 'members', width: 110 },
            { title: t('ontology.releases.status'), key: 'status', width: 140 },
          ]"
          :data-source="releases"
          :loading="detailLoading"
          :pagination="false"
          :empty-text="t('ontology.releases.empty')"
        >
          <template #bodyCell="{ column, record }">
            <template v-if="column.key === 'name'">
              {{ entityLabel(record as OntologyRelease) }}
            </template>
            <template v-else-if="column.key === 'version'">
              {{ (record as OntologyRelease).semanticVersion || '—' }}
            </template>
            <template v-else-if="column.key === 'members'">
              {{ (record as OntologyRelease).memberCount ?? '—' }}
            </template>
            <template v-else-if="column.key === 'status'">
              {{ (record as OntologyRelease).entityStatus || '—' }}
            </template>
          </template>
        </SmTable>
      </Card>
      <Card :title="t('ontology.packs.title')" data-testid="ontology-packs">
        <Typography.Text v-if="packsError" type="danger" data-testid="ontology-packs-error">
          {{ packsError }}
        </Typography.Text>
        <SmTable
          row-key="name"
          test-id="ontology-packs-table"
          size="small"
          :columns="[
            { title: t('ontology.packs.name'), key: 'name' },
            { title: t('ontology.packs.standard'), key: 'standard', width: 160 },
            { title: t('ontology.packs.modules'), key: 'modules', width: 110 },
            { title: '', key: 'actions', width: 130 },
          ]"
          :data-source="packs"
          :pagination="false"
          :empty-text="t('ontology.packs.empty')"
        >
          <template #bodyCell="{ column, record }">
            <template v-if="column.key === 'name'">
              {{ entityLabel(record as OntologyPack) }}
            </template>
            <template v-else-if="column.key === 'standard'">
              {{ (record as OntologyPack).standard || '—' }}
            </template>
            <template v-else-if="column.key === 'modules'">
              {{ (record as OntologyPack).modules.length }}
            </template>
            <template v-else-if="column.key === 'actions'">
              <Button
                size="small"
                :data-testid="`ontology-pack-sample-${(record as OntologyPack).name}`"
                :loading="samplingPack === (record as OntologyPack).name"
                :disabled="!(record as OntologyPack).modules.length"
                @click="onSamplePack(record as OntologyPack)"
              >
                {{ t('ontology.packs.sample') }}
              </Button>
            </template>
          </template>
        </SmTable>
        <template v-for="pack in packs" :key="pack.name">
          <div v-if="sampleByPack[pack.name]" style="margin-top: 12px" :data-testid="`ontology-pack-sample-result-${pack.name}`">
            <Typography.Title :level="5">
              {{ t('ontology.packs.sampleTitle', { name: pack.name }) }}
            </Typography.Title>
            <Typography.Paragraph type="secondary">
              {{
                t('ontology.packs.sampleSummary', {
                  concepts: sampleByPack[pack.name]?.conceptCount ?? sampleByPack[pack.name]?.concepts.length ?? 0,
                  relations: sampleByPack[pack.name]?.relationCount ?? 0,
                })
              }}
            </Typography.Paragraph>
            <ul>
              <li v-for="concept in sampleByPack[pack.name]?.concepts ?? []" :key="concept.name">
                {{ concept.name }}<span v-if="concept.iri"> ({{ concept.iri }})</span>
              </li>
            </ul>
          </div>
        </template>
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
