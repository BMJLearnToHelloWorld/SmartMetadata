<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { Button, Card, Col, Empty, Form, Input, List, Row, Select, Space, Switch, Typography, message } from 'ant-design-vue';
import FormModal from '@/components/shared/FormModal.vue';
import PageHeader from '@/components/shared/PageHeader.vue';
import { listAnnouncements, parseAnnouncementEntityLink } from '@/api/announcements';
import { createDataProduct, getDataProductByName } from '@/api/dataProducts';
import { DOMAIN_TYPES } from '@/types/governance';
import { createDomain, getDomainByName, listDomains } from '@/api/domains';
import { getNLPEnabledStatus, nlqSearch, searchAssets } from '@/api/search';
import { listUsers } from '@/api/users';
import type { AdminUser } from '@/types/admin';
import type { SearchHit } from '@/types/api';
import type { Announcement } from '@/types/collaboration';
import type { Domain } from '@/types/governance';
import { entityLabel } from '@/features/crud/paging';
import { useAuthStore } from '@/stores/auth';
import { buildDataProductCreateBody, buildDomainCreateBody } from './marketplaceCreate';

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
const searchProductResults = ref<SearchHit[]>([]);
const searchDomainResults = ref<SearchHit[]>([]);
const hasSearchResults = computed(
  () => searchProductResults.value.length > 0 || searchDomainResults.value.length > 0,
);
// NLQ is offered only when the server reports it enabled (official
// MarketplaceSearchBar isNLPEnabled gate); the switch itself is the
// isNLPActive gate, and NLQ fires on Enter, never on debounced typing.
const nlqEnabled = ref(false);
const nlqActive = ref(false);
const announcements = ref<Announcement[]>([]);
const dataProducts = ref<SearchHit[]>([]);
const dataProductsTotal = ref(0);
const domains = ref<SearchHit[]>([]);
const domainsTotal = ref(0);
const domainOptions = ref<Domain[]>([]);
const userOptions = ref<AdminUser[]>([]);
let userOptionsLoaded = false;

async function ensureUserOptions(): Promise<void> {
  if (userOptionsLoaded) {
    return;
  }
  userOptionsLoaded = true;
  try {
    const page = await listUsers({ limit: 100, isBot: false });
    userOptions.value = page.data;
  } catch {
    userOptions.value = [];
  }
}

const showDataProductModal = ref(false);
const creatingDataProduct = ref(false);
const dataProductForm = ref({
  name: '',
  displayName: '',
  description: '',
  domainFqns: [] as string[],
  ownerNames: [] as string[],
  expertNames: [] as string[],
  iconURL: '',
  color: '',
});
const showDomainModal = ref(false);
const creatingDomain = ref(false);
const domainForm = ref({
  name: '',
  displayName: '',
  description: '',
  domainType: 'Source-aligned',
  parent: undefined as string | undefined,
  ownerNames: [] as string[],
  expertNames: [] as string[],
  iconURL: '',
  color: '',
});
const formError = ref('');

watch(showDataProductModal, (open) => {
  if (open) {
    void ensureUserOptions();
  }
});
watch(showDomainModal, (open) => {
  if (open) {
    void ensureUserOptions();
  }
});

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
  // NLQ fires on Enter only, matching the official search bar; keyword
  // search keeps the 400ms debounce.
  if (nlqActive.value) {
    return;
  }
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
    searchProductResults.value = [];
    searchDomainResults.value = [];
    return;
  }
  searching.value = true;
  try {
    if (nlqActive.value) {
      const [productPage, domainPage] = await Promise.all([
        nlqSearch(query, 0, 10, { index: 'dataProduct' }),
        nlqSearch(query, 0, 10, { index: 'domain' }),
      ]);
      searchProductResults.value = productPage.hits;
      searchDomainResults.value = domainPage.hits;
    } else {
      const [productPage, domainPage] = await Promise.all([
        searchAssets(query, 0, 10, { index: 'dataProduct' }),
        searchAssets(query, 0, 10, { index: 'domain' }),
      ]);
      searchProductResults.value = productPage.hits;
      searchDomainResults.value = domainPage.hits;
    }
  } catch {
    searchProductResults.value = [];
    searchDomainResults.value = [];
  } finally {
    searching.value = false;
  }
}

function onNlqToggle(): void {
  if (searchText.value.trim()) {
    void runSearch();
  }
}

/**
 * Official announcements widget click: parse the entityLink and navigate
 * to the entity. Official lands on the entity's activity-feed tab, but
 * this console's detail pages have no feed tab, so the landing is the
 * detail page itself; the fqn→id step is what the widget previously
 * lacked, resolved here via the /name endpoints.
 */
async function openAnnouncement(item: Announcement): Promise<void> {
  const target = parseAnnouncementEntityLink(item.entityLink);
  if (!target) {
    return;
  }
  try {
    if (target.entityType === 'domain') {
      const domain = await getDomainByName(target.fullyQualifiedName);
      if (domain.id) {
        await router.push({ name: 'governance-domain', params: { id: domain.id } });
      }
    } else {
      const product = await getDataProductByName(target.fullyQualifiedName);
      if (product.id) {
        await router.push({ name: 'governance-data-product', params: { id: product.id } });
      }
    }
  } catch {
    message.error(t('marketplace.openFailed'));
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
    const created = await createDataProduct(
      buildDataProductCreateBody(
        {
          name,
          description,
          displayName: dataProductForm.value.displayName.trim() || undefined,
          domains: dataProductForm.value.domainFqns,
        },
        dataProductForm.value,
        userOptions.value,
      ),
    );
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
    const created = await createDomain(
      buildDomainCreateBody(
        {
          name,
          description,
          domainType: domainForm.value.domainType,
          displayName: domainForm.value.displayName.trim() || undefined,
          parent: domainForm.value.parent,
        },
        domainForm.value,
        userOptions.value,
      ),
    );
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
  void getNLPEnabledStatus()
    .then((enabled) => {
      nlqEnabled.value = enabled;
    })
    .catch(() => {
      nlqEnabled.value = false;
    });
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
      <Space v-if="nlqEnabled" style="margin-top: 8px">
        <Switch v-model:checked="nlqActive" data-testid="marketplace-nlq-toggle" @change="onNlqToggle" />
        <Typography.Text type="secondary">{{ t('marketplace.nlq') }}</Typography.Text>
      </Space>
      <div
        v-if="hasSearchResults"
        data-testid="marketplace-search-results"
        style="margin-top: 12px"
      >
        <div v-if="searchProductResults.length > 0" data-testid="marketplace-search-data-products">
          <Typography.Text strong>{{ t('marketplace.dataProducts') }}</Typography.Text>
          <List :data-source="searchProductResults">
            <template #renderItem="{ item }">
              <List.Item>
                <Button type="link" @click="openHit(item as SearchHit)">
                  {{ hitLabel(item as SearchHit) }}
                </Button>
              </List.Item>
            </template>
          </List>
        </div>
        <div v-if="searchDomainResults.length > 0" data-testid="marketplace-search-domains">
          <Typography.Text strong>{{ t('marketplace.domains') }}</Typography.Text>
          <List :data-source="searchDomainResults">
            <template #renderItem="{ item }">
              <List.Item>
                <Button type="link" @click="openHit(item as SearchHit)">
                  {{ hitLabel(item as SearchHit) }}
                </Button>
              </List.Item>
            </template>
          </List>
        </div>
      </div>
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
          <List.Item
            data-testid="marketplace-announcement-item"
            style="cursor: pointer"
            @click="openAnnouncement(item as Announcement)"
          >
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
        <Form.Item :label="t('marketplace.owners')">
          <Select v-model:value="dataProductForm.ownerNames" mode="multiple" data-testid="marketplace-data-product-owners">
            <Select.Option v-for="user in userOptions" :key="user.id" :value="user.name">
              {{ user.displayName || user.name }}
            </Select.Option>
          </Select>
        </Form.Item>
        <Form.Item :label="t('marketplace.experts')">
          <Select v-model:value="dataProductForm.expertNames" mode="tags" data-testid="marketplace-data-product-experts" />
        </Form.Item>
        <Form.Item :label="t('marketplace.iconUrl')">
          <Input v-model:value="dataProductForm.iconURL" data-testid="marketplace-data-product-icon-url" />
        </Form.Item>
        <Form.Item :label="t('marketplace.color')">
          <Input v-model:value="dataProductForm.color" data-testid="marketplace-data-product-color" />
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
        <Form.Item :label="t('marketplace.owners')">
          <Select v-model:value="domainForm.ownerNames" mode="multiple" data-testid="marketplace-domain-owners">
            <Select.Option v-for="user in userOptions" :key="user.id" :value="user.name">
              {{ user.displayName || user.name }}
            </Select.Option>
          </Select>
        </Form.Item>
        <Form.Item :label="t('marketplace.experts')">
          <Select v-model:value="domainForm.expertNames" mode="tags" data-testid="marketplace-domain-experts" />
        </Form.Item>
        <Form.Item :label="t('marketplace.iconUrl')">
          <Input v-model:value="domainForm.iconURL" data-testid="marketplace-domain-icon-url" />
        </Form.Item>
        <Form.Item :label="t('marketplace.color')">
          <Input v-model:value="domainForm.color" data-testid="marketplace-domain-color" />
        </Form.Item>
      </Form>
    </FormModal>
  </div>
</template>
