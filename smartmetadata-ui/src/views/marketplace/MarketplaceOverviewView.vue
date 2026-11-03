<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { Button, Card, Col, Empty, Form, Input, List, Row, Select, Space, Typography, message } from 'ant-design-vue';
import FormModal from '@/components/shared/FormModal.vue';
import PageHeader from '@/components/shared/PageHeader.vue';
import { listAnnouncements } from '@/api/announcements';
import { createDataProduct } from '@/api/dataProducts';
import { DOMAIN_TYPES } from '@/types/governance';
import { createDomain, listDomains } from '@/api/domains';
import { searchAssets } from '@/api/search';
import type { SearchHit } from '@/types/api';
import type { Announcement } from '@/types/collaboration';
import type { Domain } from '@/types/governance';
import { entityLabel } from '@/features/crud/paging';
import { useAuthStore } from '@/stores/auth';

const { t } = useI18n();
const router = useRouter();
const authStore = useAuthStore();

/**
 * Official page shape (pages/DataMarketplacePage + DataMarketplaceClassBase):
 * a greeting + search hero, an announcements widget, then the default widget
 * column — data products first, domains second. The official widgets search
 * the search index (dataProduct / domain, updatedAt desc, 3 cards); the
 * persona-customized layout is a customization layer this console does not
 * ship, so the default column is what lands here.
 */
const DISPLAY_COUNT = 3;

const loading = ref(false);
const errorMessage = ref('');
const searchText = ref('');
const searching = ref(false);
const searchResults = ref<SearchHit[]>([]);
const announcements = ref<Announcement[]>([]);
const dataProducts = ref<SearchHit[]>([]);
const dataProductsTotal = ref(0);
const domains = ref<SearchHit[]>([]);
const domainsTotal = ref(0);
const domainOptions = ref<Domain[]>([]);

const showDataProductModal = ref(false);
const creatingDataProduct = ref(false);
const dataProductForm = ref({ name: '', displayName: '', description: '', domainFqns: [] as string[] });
const showDomainModal = ref(false);
const creatingDomain = ref(false);
const domainForm = ref({
  name: '',
  displayName: '',
  description: '',
  domainType: 'Source-aligned',
  parent: undefined as string | undefined,
});
const formError = ref('');

const greeting = computed(() => {
  const name = authStore.displayName;
  return name ? t('marketplace.greeting', { name }) : '';
});

async function loadWidgets(): Promise<void> {
  loading.value = true;
  errorMessage.value = '';
  try {
    const [productPage, domainPage, announcementPage, domainList] = await Promise.all([
      searchAssets('', 0, DISPLAY_COUNT, { index: 'dataProduct', sortField: 'updatedAt', sortOrder: 'desc' }),
      searchAssets('', 0, DISPLAY_COUNT, { index: 'domain', sortField: 'updatedAt', sortOrder: 'desc' }),
      listAnnouncements({ active: true, limit: 50 }),
      listDomains({ limit: 100 }),
    ]);
    dataProducts.value = productPage.hits;
    dataProductsTotal.value = productPage.total;
    domains.value = domainPage.hits;
    domainsTotal.value = domainPage.total;
    // Official announcements widget keeps only domain / data-product items.
    announcements.value = announcementPage.data.filter((item) =>
      (item.entityLink ?? '').includes('::domain::') || (item.entityLink ?? '').includes('::dataProduct::'),
    );
    domainOptions.value = domainList.data;
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : t('crud.loadFailed');
  } finally {
    loading.value = false;
  }
}

let searchTimer: ReturnType<typeof setTimeout> | undefined;
function scheduleSearch(): void {
  if (searchTimer) {
    clearTimeout(searchTimer);
  }
  searchTimer = setTimeout(() => {
    void runSearch();
  }, 400);
}

async function runSearch(): Promise<void> {
  const query = searchText.value.trim();
  if (!query) {
    searchResults.value = [];
    return;
  }
  searching.value = true;
  try {
    const [productPage, domainPage] = await Promise.all([
      searchAssets(query, 0, 10, { index: 'dataProduct' }),
      searchAssets(query, 0, 10, { index: 'domain' }),
    ]);
    searchResults.value = [...productPage.hits, ...domainPage.hits];
  } catch {
    searchResults.value = [];
  } finally {
    searching.value = false;
  }
}

function openHit(hit: SearchHit): void {
  if (!hit.id) {
    return;
  }
  if (hit.entityType === 'domain') {
    void router.push({ name: 'governance-domain', params: { id: hit.id } });
  } else {
    void router.push({ name: 'governance-data-product', params: { id: hit.id } });
  }
}

function hitLabel(hit: SearchHit): string {
  return hit.displayName || hit.name;
}

async function onCreateDataProduct(): Promise<void> {
  const name = dataProductForm.value.name.trim();
  const description = dataProductForm.value.description.trim();
  if (!name || !description) {
    formError.value = t('marketplace.createRequired');
    return;
  }
  formError.value = '';
  creatingDataProduct.value = true;
  try {
    const created = await createDataProduct({
      name,
      description,
      displayName: dataProductForm.value.displayName.trim() || undefined,
      domains: dataProductForm.value.domainFqns,
    });
    showDataProductModal.value = false;
    message.success(t('governance.dataProducts.created', { name: created.name }));
    void loadWidgets();
  } catch (error) {
    formError.value = error instanceof Error ? error.message : t('crud.loadFailed');
  } finally {
    creatingDataProduct.value = false;
  }
}

async function onCreateDomain(): Promise<void> {
  const name = domainForm.value.name.trim();
  const description = domainForm.value.description.trim();
  if (!name || !description) {
    formError.value = t('marketplace.createRequired');
    return;
  }
  formError.value = '';
  creatingDomain.value = true;
  try {
    const created = await createDomain({
      name,
      description,
      domainType: domainForm.value.domainType,
      displayName: domainForm.value.displayName.trim() || undefined,
      parent: domainForm.value.parent,
    });
    showDomainModal.value = false;
    message.success(t('governance.domains.created', { name: created.name }));
    void loadWidgets();
  } catch (error) {
    formError.value = error instanceof Error ? error.message : t('crud.loadFailed');
  } finally {
    creatingDomain.value = false;
  }
}

onMounted(() => {
  void loadWidgets();
});

onUnmounted(() => {
  if (searchTimer) {
    clearTimeout(searchTimer);
  }
});
</script>

<template>
  <div data-testid="marketplace-overview">
    <PageHeader :header="t('marketplace.title')" :sub-header="t('marketplace.lead')" />
    <Typography.Text v-if="errorMessage" type="danger" data-testid="marketplace-error">
      {{ errorMessage }}
    </Typography.Text>
    <Card style="margin-bottom: 16px" data-testid="marketplace-hero">
      <Typography.Paragraph v-if="greeting" type="secondary" data-testid="marketplace-greeting" style="margin: 0">
        {{ greeting }}
      </Typography.Paragraph>
      <Typography.Paragraph type="secondary" style="margin: 8px 0 16px">
        {{ t('marketplace.subtitle') }}
      </Typography.Paragraph>
      <Input.Search
        v-model:value="searchText"
        data-testid="marketplace-search"
        :placeholder="t('marketplace.searchPlaceholder')"
        :loading="searching"
        @input="scheduleSearch"
        @search="runSearch"
      />
      <List
        v-if="searchResults.length > 0"
        data-testid="marketplace-search-results"
        :data-source="searchResults"
        style="margin-top: 12px"
      >
        <template #renderItem="{ item }">
          <List.Item>
            <Button type="link" @click="openHit(item as SearchHit)">
              {{ hitLabel(item as SearchHit) }}
            </Button>
          </List.Item>
        </template>
      </List>
    </Card>
    <Card
      v-if="announcements.length > 0"
      :title="t('marketplace.announcements')"
      :loading="loading"
      style="margin-bottom: 16px"
      data-testid="marketplace-announcements"
    >
      <List :data-source="announcements">
        <template #renderItem="{ item }">
          <List.Item>
            <List.Item.Meta
              :title="(item as Announcement).displayName || (item as Announcement).name"
              :description="(item as Announcement).description"
            />
          </List.Item>
        </template>
      </List>
    </Card>
    <Row :gutter="16">
      <Col :span="12">
        <Card
          :title="`${t('marketplace.dataProducts')} (${dataProductsTotal})`"
          :loading="loading"
          data-testid="marketplace-data-products"
        >
          <template #extra>
            <Space>
              <Button type="link" data-testid="marketplace-data-products-view-all" @click="router.push({ name: 'governance-data-products' })">
                {{ t('marketplace.viewAll') }}
              </Button>
              <Button type="primary" data-testid="marketplace-add-data-product" @click="showDataProductModal = true">
                {{ t('marketplace.addDataProduct') }}
              </Button>
            </Space>
          </template>
          <List :data-source="dataProducts" :locale="{ emptyText: t('marketplace.emptyDataProducts') }">
            <template #renderItem="{ item }">
              <List.Item>
                <List.Item.Meta
                  :title="hitLabel(item as SearchHit)"
                  :description="(item as SearchHit).description"
                />
                <Button
                  v-if="(item as SearchHit).id"
                  type="link"
                  @click="openHit(item as SearchHit)"
                >
                  {{ t('marketplace.open') }}
                </Button>
              </List.Item>
            </template>
          </List>
        </Card>
      </Col>
      <Col :span="12">
        <Card
          :title="`${t('marketplace.domains')} (${domainsTotal})`"
          :loading="loading"
          data-testid="marketplace-domains"
        >
          <template #extra>
            <Space>
              <Button type="link" data-testid="marketplace-domains-view-all" @click="router.push({ name: 'governance-domains' })">
                {{ t('marketplace.viewAll') }}
              </Button>
              <Button type="primary" data-testid="marketplace-add-domain" @click="showDomainModal = true">
                {{ t('marketplace.addDomain') }}
              </Button>
            </Space>
          </template>
          <List :data-source="domains" :locale="{ emptyText: t('marketplace.emptyDomains') }">
            <template #renderItem="{ item }">
              <List.Item>
                <List.Item.Meta
                  :title="hitLabel(item as SearchHit)"
                  :description="(item as SearchHit).description"
                />
                <Button
                  v-if="(item as SearchHit).id"
                  type="link"
                  @click="openHit(item as SearchHit)"
                >
                  {{ t('marketplace.open') }}
                </Button>
              </List.Item>
            </template>
          </List>
        </Card>
      </Col>
    </Row>
    <Empty v-if="!loading && dataProducts.length === 0 && domains.length === 0 && !errorMessage" :description="t('marketplace.empty')" style="margin-top: 16px" />
    <FormModal
      :get-container="false"
      :open="showDataProductModal"
      :title="t('marketplace.addDataProduct')"
      :ok-text="t('crud.create')"
      :cancel-text="t('crud.cancel')"
      :confirm-loading="creatingDataProduct"
      @ok="onCreateDataProduct"
      @cancel="showDataProductModal = false"
    >
      <Typography.Text v-if="formError" type="danger" data-testid="marketplace-form-error">{{ formError }}</Typography.Text>
      <Form layout="vertical">
        <Form.Item :label="t('crud.name')" required>
          <Input v-model:value="dataProductForm.name" data-testid="marketplace-data-product-name" />
        </Form.Item>
        <Form.Item :label="t('crud.displayName')" :extra="t('crud.displayNameHelp')">
          <Input v-model:value="dataProductForm.displayName" />
        </Form.Item>
        <Form.Item :label="t('crud.description')" required>
          <Input.TextArea v-model:value="dataProductForm.description" :rows="3" data-testid="marketplace-data-product-description" />
        </Form.Item>
        <Form.Item :label="t('governance.dataProducts.domains')">
          <Select v-model:value="dataProductForm.domainFqns" mode="multiple" data-testid="marketplace-data-product-domains">
            <Select.Option
              v-for="domain in domainOptions"
              :key="domain.id"
              :value="domain.fullyQualifiedName || domain.name"
            >
              {{ entityLabel(domain) }}
            </Select.Option>
          </Select>
        </Form.Item>
      </Form>
    </FormModal>
    <FormModal
      :get-container="false"
      :open="showDomainModal"
      :title="t('marketplace.addDomain')"
      :ok-text="t('crud.create')"
      :cancel-text="t('crud.cancel')"
      :confirm-loading="creatingDomain"
      @ok="onCreateDomain"
      @cancel="showDomainModal = false"
    >
      <Typography.Text v-if="formError" type="danger" data-testid="marketplace-form-error">{{ formError }}</Typography.Text>
      <Form layout="vertical">
        <Form.Item :label="t('crud.name')" required>
          <Input v-model:value="domainForm.name" data-testid="marketplace-domain-name" />
        </Form.Item>
        <Form.Item :label="t('crud.displayName')" :extra="t('crud.displayNameHelp')">
          <Input v-model:value="domainForm.displayName" />
        </Form.Item>
        <Form.Item :label="t('crud.description')" required>
          <Input.TextArea v-model:value="domainForm.description" :rows="3" data-testid="marketplace-domain-description" />
        </Form.Item>
        <Form.Item :label="t('governance.domains.type')" required>
          <Select v-model:value="domainForm.domainType">
            <Select.Option v-for="type in DOMAIN_TYPES" :key="type" :value="type">{{ type }}</Select.Option>
          </Select>
        </Form.Item>
        <Form.Item :label="t('governance.domains.parentDomain')" :extra="t('governance.domains.parentDomainHelp')">
          <Select v-model:value="domainForm.parent" allow-clear>
            <Select.Option
              v-for="domain in domainOptions"
              :key="domain.id"
              :value="domain.fullyQualifiedName || domain.name"
            >
              {{ entityLabel(domain) }}
            </Select.Option>
          </Select>
        </Form.Item>
      </Form>
    </FormModal>
  </div>
</template>
