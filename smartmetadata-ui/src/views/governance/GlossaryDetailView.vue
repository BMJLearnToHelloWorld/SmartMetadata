<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import {
  BookOutlined,
  CopyOutlined,
  DownOutlined,
  PlusOutlined,
  RightOutlined,
  SearchOutlined,
  TableOutlined,
} from '@ant-design/icons-vue';
import {
  Alert,
  Breadcrumb,
  Button,
  Checkbox,
  Collapse,
  Empty,
  Form,
  Input,
  Modal,
  Pagination,
  Select,
  Space,
  Spin,
  Table,
  Tag,
  Tabs,
  Typography,
  message,
} from 'ant-design-vue';
import { createGlossary, getGlossary, listGlossaries, updateGlossary } from '@/api/glossaries';
import { createGlossaryTerm, listGlossaryTerms } from '@/api/glossaryTerms';
import { governanceTabsFor } from '@/catalog/governanceTabs';
import { entityLabel, joinRefNames } from '@/features/crud/paging';
import type { EntityRef, TagRef } from '@/types/api';
import type { Glossary, GlossaryTerm } from '@/types/governance';

const props = defineProps<{ id?: string }>();
const { t } = useI18n();
const router = useRouter();

const TERMS_PAGE_SIZE = 10;

const listLoading = ref(false);
const detailLoading = ref(false);
const listError = ref('');
const detailError = ref('');
const residualNotes = ref<string[]>([]);

const glossaries = ref<Glossary[]>([]);
const glossary = ref<Glossary | null>(null);
const terms = ref<GlossaryTerm[]>([]);
const activeTab = ref('terms');
const termSearch = ref('');
const statusFilter = ref<string | undefined>();
const termPage = ref(1);
const expandAll = ref(false);

const editOpen = ref(false);
const createGlossaryOpen = ref(false);
const createTermOpen = ref(false);
const saving = ref(false);
const creatingGlossary = ref(false);
const creatingTerm = ref(false);

const editForm = reactive({
  displayName: '',
  description: '',
  mutuallyExclusive: false,
});
const glossaryForm = reactive({
  name: '',
  displayName: '',
  description: '',
  mutuallyExclusive: false,
});
const termForm = reactive({
  name: '',
  displayName: '',
  description: '',
  parent: undefined as string | undefined,
  mutuallyExclusive: false,
});

const activeId = computed(() => props.id || glossary.value?.id || '');

const filteredTerms = computed(() => {
  const q = termSearch.value.trim().toLowerCase();
  return terms.value.filter((term) => {
    if (statusFilter.value && (term.status || '') !== statusFilter.value) {
      return false;
    }
    if (!q) {
      return true;
    }
    const hay = [term.name, term.displayName, term.description, term.fullyQualifiedName]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    return hay.includes(q);
  });
});

/** Glossary tabs are data from the Stage 4 governance registry; the terms
 *  label keeps its live count, the activity label keeps its zero count,
 *  and residual panes keep their honest Empty content below. */
const glossaryTabs = computed(() =>
  governanceTabsFor('glossary').map((tab) => ({
    ...tab,
    label:
      tab.key === 'terms'
        ? termCountLabel.value
        : tab.key === 'activity'
          ? t(tab.labelKey, { count: 0 })
          : t(tab.labelKey),
  })),
);

const statusOptions = computed(() => {
  const values = new Set<string>();
  for (const term of terms.value) {
    if (term.status) {
      values.add(term.status);
    }
  }
  return [...values].sort().map((value) => ({ value, label: value }));
});

const pagedTerms = computed(() => {
  const start = (termPage.value - 1) * TERMS_PAGE_SIZE;
  return filteredTerms.value.slice(start, start + TERMS_PAGE_SIZE);
});

const termColumns = computed(() => [
  { title: t('governance.glossaries.termsCol'), dataIndex: 'name', key: 'name' },
  { title: t('crud.description'), dataIndex: 'description', key: 'description' },
  { title: t('governance.glossaries.status'), key: 'status', width: 120 },
  { title: t('crud.owners'), key: 'owners', width: 140 },
]);

const termCountLabel = computed(() => {
  const n = glossary.value?.termCount ?? terms.value.length;
  return t('governance.glossaries.termsTabCount', { count: n });
});

function refLabel(ref: EntityRef): string {
  return ref.displayName || ref.name || ref.fullyQualifiedName || '—';
}

function tagLabel(tag: TagRef): string {
  return tag.name || tag.tagFQN;
}

async function loadGlossaryList(): Promise<void> {
  listLoading.value = true;
  listError.value = '';
  try {
    const page = await listGlossaries({ limit: 100 });
    glossaries.value = page.data;
  } catch (error) {
    glossaries.value = [];
    listError.value = error instanceof Error ? error.message : t('crud.loadFailed');
  } finally {
    listLoading.value = false;
  }
}

async function loadDetail(id: string): Promise<void> {
  detailLoading.value = true;
  detailError.value = '';
  residualNotes.value = [];
  try {
    glossary.value = await getGlossary(id);
    try {
      const page = await listGlossaryTerms({ glossary: id, limit: 100 });
      terms.value = page.data;
    } catch (error) {
      terms.value = [];
      residualNotes.value.push('governance.glossaries.residualTerms');
      if (!detailError.value) {
        detailError.value = error instanceof Error ? error.message : t('crud.loadFailed');
      }
    }
    termPage.value = 1;
  } catch (error) {
    glossary.value = null;
    terms.value = [];
    detailError.value = error instanceof Error ? error.message : t('crud.loadFailed');
  } finally {
    detailLoading.value = false;
  }
}

async function ensureSelection(): Promise<void> {
  await loadGlossaryList();
  if (props.id) {
    await loadDetail(props.id);
    return;
  }
  const first = glossaries.value[0];
  if (first?.id) {
    await router.replace({ name: 'governance-glossary', params: { id: first.id } });
    return;
  }
  glossary.value = null;
  terms.value = [];
}

function selectGlossary(item: Glossary): void {
  if (!item.id || item.id === props.id) {
    return;
  }
  void router.push({ name: 'governance-glossary', params: { id: item.id } });
}

async function copyFqn(): Promise<void> {
  const fqn = glossary.value?.fullyQualifiedName || glossary.value?.name;
  if (!fqn || !navigator.clipboard?.writeText) {
    message.info(t('governance.glossaries.copyUnavailable'));
    return;
  }
  try {
    await navigator.clipboard.writeText(fqn);
    message.success(t('governance.glossaries.copied'));
  } catch {
    message.info(t('governance.glossaries.copyUnavailable'));
  }
}

function openEdit(): void {
  if (!glossary.value) {
    return;
  }
  editForm.displayName = glossary.value.displayName || '';
  editForm.description = glossary.value.description || '';
  editForm.mutuallyExclusive = Boolean(glossary.value.mutuallyExclusive);
  editOpen.value = true;
}

async function onSave(): Promise<void> {
  if (!glossary.value) {
    return;
  }
  saving.value = true;
  try {
    await updateGlossary({
      name: glossary.value.name,
      description: editForm.description.trim(),
      displayName: editForm.displayName.trim() || undefined,
      mutuallyExclusive: editForm.mutuallyExclusive,
    });
    editOpen.value = false;
    message.success(t('governance.glossaries.updated'));
    await loadDetail(glossary.value.id);
    await loadGlossaryList();
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('crud.updateFailed'));
  } finally {
    saving.value = false;
  }
}

async function onCreateGlossary(): Promise<void> {
  creatingGlossary.value = true;
  try {
    const created = await createGlossary({
      name: glossaryForm.name.trim(),
      description: glossaryForm.description.trim(),
      displayName: glossaryForm.displayName.trim() || undefined,
      mutuallyExclusive: glossaryForm.mutuallyExclusive,
    });
    createGlossaryOpen.value = false;
    glossaryForm.name = '';
    glossaryForm.displayName = '';
    glossaryForm.description = '';
    glossaryForm.mutuallyExclusive = false;
    message.success(t('governance.glossaries.created', { name: created.name }));
    await loadGlossaryList();
    if (created.id) {
      await router.push({ name: 'governance-glossary', params: { id: created.id } });
    }
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('crud.createFailed'));
  } finally {
    creatingGlossary.value = false;
  }
}

async function onCreateTerm(): Promise<void> {
  if (!glossary.value) {
    return;
  }
  creatingTerm.value = true;
  try {
    const created = await createGlossaryTerm({
      glossary: glossary.value.fullyQualifiedName || glossary.value.name,
      name: termForm.name.trim(),
      description: termForm.description.trim(),
      displayName: termForm.displayName.trim() || undefined,
      parent: termForm.parent,
      mutuallyExclusive: termForm.mutuallyExclusive,
    });
    createTermOpen.value = false;
    termForm.name = '';
    termForm.displayName = '';
    termForm.description = '';
    termForm.parent = undefined;
    termForm.mutuallyExclusive = false;
    message.success(t('governance.glossaries.termCreated', { name: created.name }));
    await loadDetail(glossary.value.id);
    await loadGlossaryList();
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('governance.glossaries.termCreateFailed'));
  } finally {
    creatingTerm.value = false;
  }
}

function onTermPageChange(page: number): void {
  termPage.value = page;
}

function openTerm(term: GlossaryTerm): void {
  if (!term.id) {
    return;
  }
  void router.push({ name: 'governance-term', params: { id: term.id } });
}

function onRailAdd(kind: string): void {
  message.info(t('governance.glossaries.railAddResidual', { kind }));
}

function onCustomize(): void {
  message.info(t('governance.glossaries.customizeResidual'));
}

watch(
  () => props.id,
  (id) => {
    if (id) {
      void loadDetail(id);
      if (!glossaries.value.length) {
        void loadGlossaryList();
      }
    } else {
      void ensureSelection();
    }
  },
);

watch([termSearch, statusFilter], () => {
  termPage.value = 1;
});

onMounted(() => {
  void ensureSelection();
});
</script>

<template>
  <div class="glossary" data-testid="glossary-workspace">
    <aside class="glossary__pane glossary__pane--list" data-testid="glossary-list-pane">
      <div class="glossary__list-head">
        <Typography.Text strong>{{ t('nav.glossary') }}</Typography.Text>
        <Button
          type="link"
          size="small"
          data-testid="create-glossary"
          @click="createGlossaryOpen = true"
        >
          <template #icon><PlusOutlined /></template>
          {{ t('governance.glossaries.add') }}
        </Button>
      </div>
      <Spin :spinning="listLoading">
        <Alert v-if="listError" type="error" show-icon :message="listError" class="glossary__alert" />
        <Empty
          v-else-if="!listLoading && !glossaries.length"
          data-testid="glossary-list-empty"
          :description="t('governance.glossaries.emptyList')"
        />
        <ul v-else class="glossary__list" data-testid="glossary-list">
          <li
            v-for="item in glossaries"
            :key="item.id"
            class="glossary__list-item"
            :class="{ 'glossary__list-item--active': item.id === activeId }"
            :data-testid="`glossary-row-${item.id}`"
            @click="selectGlossary(item)"
          >
            <BookOutlined class="glossary__list-icon" />
            <span class="glossary__list-label">{{ entityLabel(item) }}</span>
          </li>
        </ul>
      </Spin>
    </aside>

    <section class="glossary__pane glossary__pane--center" data-testid="glossary-detail-pane">
      <Spin :spinning="detailLoading">
        <Empty
          v-if="!detailLoading && !glossary && !detailError"
          data-testid="glossary-detail-empty"
          :description="t('governance.glossaries.selectOrCreate')"
        />
        <template v-else-if="glossary">
          <div class="glossary__header">
            <div class="glossary__title-block">
              <Breadcrumb class="glossary__crumb" data-testid="glossary-breadcrumb">
                <Breadcrumb.Item>
                  <a href="#" @click.prevent="router.push({ name: 'governance-glossaries' })">{{ t('nav.glossaries') }}</a>
                </Breadcrumb.Item>
                <Breadcrumb.Item>{{ entityLabel(glossary) }}</Breadcrumb.Item>
              </Breadcrumb>
              <Typography.Title :level="3" class="glossary__title">
                {{ entityLabel(glossary) }}
              </Typography.Title>
              <div class="glossary__fqn">
                <Typography.Text type="secondary" data-testid="glossary-fqn">
                  {{ glossary.fullyQualifiedName || glossary.name }}
                </Typography.Text>
                <Button
                  type="text"
                  size="small"
                  data-testid="glossary-copy-fqn"
                  :aria-label="t('governance.glossaries.copyFqn')"
                  @click="copyFqn"
                >
                  <CopyOutlined />
                </Button>
              </div>
            </div>
            <Space>
              <Button type="primary" data-testid="create-term" @click="createTermOpen = true">
                {{ t('governance.glossaries.addTerm') }}
              </Button>
              <Button data-testid="edit-glossary" @click="openEdit">{{ t('crud.edit') }}</Button>
            </Space>
          </div>

          <Alert
            v-for="note in residualNotes"
            :key="note"
            type="info"
            show-icon
            class="glossary__alert"
            :message="t(note)"
          />
          <Alert v-if="detailError" type="error" show-icon :message="detailError" class="glossary__alert" />

          <Tabs v-model:active-key="activeTab" data-testid="glossary-tabs">
            <Tabs.TabPane
              v-for="tab in glossaryTabs"
              :key="tab.key"
              :tab="tab.label"
              :data-testid="`glossary-tab-${tab.key}`"
            >
              <template v-if="tab.key === 'terms'">
              <section class="glossary__description" data-testid="glossary-description">
                <div class="glossary__section-head">
                  <Typography.Text strong>{{ t('crud.description') }}</Typography.Text>
                  <Button type="link" size="small" data-testid="edit-description" @click="openEdit">
                    {{ t('crud.edit') }}
                  </Button>
                </div>
                <Typography.Paragraph type="secondary">
                  {{ glossary.description || t('governance.glossaries.noDescription') }}
                </Typography.Paragraph>
              </section>

              <div class="glossary__terms-toolbar">
                <Input
                  v-model:value="termSearch"
                  allow-clear
                  data-testid="search-terms"
                  class="glossary__search"
                  :placeholder="t('governance.glossaries.searchTerms')"
                >
                  <template #prefix><SearchOutlined /></template>
                </Input>
                <Space wrap>
                  <Select
                    v-model:value="statusFilter"
                    allow-clear
                    data-testid="term-status-filter"
                    style="min-width: 120px"
                    :placeholder="t('governance.glossaries.status')"
                    :options="statusOptions"
                  />
                  <Button data-testid="terms-edit" @click="openEdit">{{ t('crud.edit') }}</Button>
                  <Button data-testid="terms-expand-all" @click="expandAll = !expandAll">
                    {{ expandAll ? t('governance.glossaries.collapseAll') : t('governance.glossaries.expandAll') }}
                  </Button>
                  <Button data-testid="terms-customize" @click="onCustomize">
                    <template #icon><TableOutlined /></template>
                    {{ t('governance.glossaries.customize') }}
                  </Button>
                </Space>
              </div>

              <Table
                row-key="id"
                data-testid="glossary-terms-table"
                size="small"
                :columns="termColumns"
                :data-source="pagedTerms"
                :pagination="false"
              >
                <template #bodyCell="{ column, record }">
                  <template v-if="column.key === 'name'">
                    <a
                      href="#"
                      class="glossary__term-link"
                      :data-testid="`term-row-${(record as GlossaryTerm).id}`"
                      @click.prevent="openTerm(record as GlossaryTerm)"
                    >
                      {{ entityLabel(record as GlossaryTerm) }}
                    </a>
                    <Typography.Paragraph
                      v-if="expandAll && (record as GlossaryTerm).fullyQualifiedName"
                      type="secondary"
                      class="glossary__term-fqn"
                    >
                      {{ (record as GlossaryTerm).fullyQualifiedName }}
                    </Typography.Paragraph>
                  </template>
                  <template v-else-if="column.key === 'description'">
                    {{ (record as GlossaryTerm).description || '—' }}
                  </template>
                  <template v-else-if="column.key === 'status'">
                    <Tag v-if="(record as GlossaryTerm).status" color="purple">
                      {{ (record as GlossaryTerm).status }}
                    </Tag>
                    <Typography.Text v-else type="secondary">—</Typography.Text>
                  </template>
                  <template v-else-if="column.key === 'owners'">
                    {{
                      joinRefNames((record as GlossaryTerm).owners) || t('governance.glossaries.noOwners')
                    }}
                  </template>
                </template>
              </Table>

              <div class="glossary__pager">
                <Pagination
                  data-testid="terms-pagination"
                  size="small"
                  :current="termPage"
                  :page-size="TERMS_PAGE_SIZE"
                  :total="filteredTerms.length"
                  :show-size-changer="false"
                  @change="onTermPageChange"
                />
              </div>
              </template>
              <template v-else-if="tab.key === 'relations'">
                <Empty
                  data-testid="glossary-relations-residual"
                  :description="t('governance.glossaries.relationsResidual')"
                />
              </template>
              <template v-else-if="tab.key === 'activity'">
                <Empty
                  data-testid="glossary-activity-residual"
                  :description="t('governance.glossaries.activityResidual')"
                />
              </template>
            </Tabs.TabPane>
          </Tabs>
        </template>
        <Alert v-else-if="detailError" type="error" show-icon :message="detailError" />
      </Spin>
    </section>

    <aside class="glossary__pane glossary__pane--rail" data-testid="glossary-rail">
      <Collapse
        ghost
        :bordered="false"
        expand-icon-position="end"
        :default-active-key="['domain', 'owners', 'reviewers', 'tags']"
      >
        <template #expandIcon="{ isActive }">
          <DownOutlined v-if="isActive" />
          <RightOutlined v-else />
        </template>
        <Collapse.Panel key="domain" data-testid="rail-domain">
          <template #header>
            <div class="glossary__rail-head">
              <span>{{ t('governance.glossaries.railDomain') }}</span>
              <Button
                type="text"
                size="small"
                data-testid="rail-domain-add"
                :disabled="!glossary"
                @click.stop="onRailAdd(t('governance.glossaries.railDomain'))"
              >
                <PlusOutlined />
              </Button>
            </div>
          </template>
          <Empty
            v-if="!glossary?.domains?.length"
            :image="Empty.PRESENTED_IMAGE_SIMPLE"
            :description="t('governance.glossaries.noDomains')"
          />
          <Space v-else wrap>
            <Tag v-for="domain in glossary.domains" :key="domain.id || domain.name">
              {{ refLabel(domain) }}
            </Tag>
          </Space>
        </Collapse.Panel>
        <Collapse.Panel key="owners" data-testid="rail-owners">
          <template #header>
            <div class="glossary__rail-head">
              <span>{{ t('governance.glossaries.railOwners') }}</span>
              <Button
                type="text"
                size="small"
                data-testid="rail-owners-add"
                :disabled="!glossary"
                @click.stop="onRailAdd(t('governance.glossaries.railOwners'))"
              >
                <PlusOutlined />
              </Button>
            </div>
          </template>
          <Empty
            v-if="!glossary?.owners?.length"
            :image="Empty.PRESENTED_IMAGE_SIMPLE"
            :description="t('governance.glossaries.noOwners')"
          />
          <Space v-else wrap>
            <Tag v-for="owner in glossary.owners" :key="owner.id || owner.name">
              {{ refLabel(owner) }}
            </Tag>
          </Space>
        </Collapse.Panel>
        <Collapse.Panel key="reviewers" data-testid="rail-reviewers">
          <template #header>
            <div class="glossary__rail-head">
              <span>{{ t('governance.glossaries.railReviewers') }}</span>
              <Button
                type="text"
                size="small"
                data-testid="rail-reviewers-add"
                :disabled="!glossary"
                @click.stop="onRailAdd(t('governance.glossaries.railReviewers'))"
              >
                <PlusOutlined />
              </Button>
            </div>
          </template>
          <Empty
            v-if="!glossary?.reviewers?.length"
            :image="Empty.PRESENTED_IMAGE_SIMPLE"
            :description="t('governance.glossaries.noReviewers')"
          />
          <Space v-else wrap>
            <Tag v-for="reviewer in glossary.reviewers" :key="reviewer.id || reviewer.name">
              {{ refLabel(reviewer) }}
            </Tag>
          </Space>
        </Collapse.Panel>
        <Collapse.Panel key="tags" data-testid="rail-tags">
          <template #header>
            <div class="glossary__rail-head">
              <span>{{ t('governance.glossaries.railTags') }}</span>
              <Button
                type="text"
                size="small"
                data-testid="rail-tags-add"
                :disabled="!glossary"
                @click.stop="onRailAdd(t('governance.glossaries.railTags'))"
              >
                <PlusOutlined />
              </Button>
            </div>
          </template>
          <Empty
            v-if="!glossary?.tags?.length"
            :image="Empty.PRESENTED_IMAGE_SIMPLE"
            :description="t('governance.glossaries.noTags')"
          />
          <Space v-else wrap>
            <Tag v-for="tag in glossary.tags" :key="tag.tagFQN">{{ tagLabel(tag) }}</Tag>
          </Space>
        </Collapse.Panel>
      </Collapse>
    </aside>
  </div>

  <Modal
    v-model:open="editOpen"
    :title="t('governance.glossaries.editTitle')"
    :ok-text="t('crud.edit')"
    :cancel-text="t('crud.cancel')"
    :confirm-loading="saving"
    @ok="onSave"
  >
    <Form layout="vertical">
      <Form.Item :label="t('crud.displayName')" :extra="t('crud.displayNameHelp')">
        <Input v-model:value="editForm.displayName" />
      </Form.Item>
      <Form.Item :label="t('crud.description')" required>
        <Input.TextArea v-model:value="editForm.description" :rows="3" />
      </Form.Item>
      <Form.Item>
        <Checkbox v-model:checked="editForm.mutuallyExclusive">
          {{ t('governance.glossaries.exclusiveHint') }}
        </Checkbox>
      </Form.Item>
    </Form>
  </Modal>

  <Modal
    v-model:open="createGlossaryOpen"
    :title="t('governance.glossaries.createTitle')"
    :ok-text="t('crud.create')"
    :cancel-text="t('crud.cancel')"
    :confirm-loading="creatingGlossary"
    @ok="onCreateGlossary"
  >
    <Form layout="vertical">
      <Form.Item :label="t('crud.name')" required>
        <Input v-model:value="glossaryForm.name" data-testid="create-glossary-name" />
      </Form.Item>
      <Form.Item :label="t('crud.description')" required>
        <Input.TextArea
          v-model:value="glossaryForm.description"
          data-testid="create-glossary-description"
          :rows="3"
        />
      </Form.Item>
      <Form.Item :label="t('crud.displayName')" :extra="t('crud.displayNameHelp')">
        <Input v-model:value="glossaryForm.displayName" />
      </Form.Item>
      <Form.Item>
        <Checkbox v-model:checked="glossaryForm.mutuallyExclusive">
          {{ t('governance.glossaries.exclusiveHint') }}
        </Checkbox>
      </Form.Item>
    </Form>
  </Modal>

  <Modal
    v-model:open="createTermOpen"
    :title="t('governance.glossaries.createTermTitle')"
    :ok-text="t('crud.create')"
    :cancel-text="t('crud.cancel')"
    :confirm-loading="creatingTerm"
    @ok="onCreateTerm"
  >
    <Form layout="vertical">
      <Form.Item :label="t('crud.name')" required>
        <Input v-model:value="termForm.name" data-testid="create-term-name" />
      </Form.Item>
      <Form.Item :label="t('crud.description')" required>
        <Input.TextArea v-model:value="termForm.description" data-testid="create-term-description" :rows="3" />
      </Form.Item>
      <Form.Item :label="t('crud.displayName')" :extra="t('crud.displayNameHelp')">
        <Input v-model:value="termForm.displayName" />
      </Form.Item>
      <Form.Item :label="t('governance.glossaries.parentTerm')">
        <Select v-model:value="termForm.parent" allow-clear>
          <Select.Option v-for="term in terms" :key="term.id" :value="term.fullyQualifiedName || term.name">
            {{ entityLabel(term) }}
          </Select.Option>
        </Select>
      </Form.Item>
      <Form.Item>
        <Checkbox v-model:checked="termForm.mutuallyExclusive">
          {{ t('governance.glossaries.exclusiveHint') }}
        </Checkbox>
      </Form.Item>
    </Form>
  </Modal>
</template>

<style scoped>
.glossary {
  display: grid;
  grid-template-columns: minmax(200px, 240px) minmax(0, 1fr) minmax(220px, 280px);
  gap: 12px;
  align-items: stretch;
  min-height: calc(100vh - 120px);
}
.glossary__pane {
  border: 1px solid var(--sm-border-secondary, #f0f0f0);
  border-radius: var(--sm-border-radius, 6px);
  background: var(--sm-bg-container, #fff);
  padding: 12px;
  min-width: 0;
}
.glossary__pane--list,
.glossary__pane--rail {
  overflow: auto;
}
.glossary__list-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 8px;
}
.glossary__list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.glossary__list-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border-radius: var(--sm-border-radius, 6px);
  cursor: pointer;
  color: var(--sm-text-primary, #181d27);
}
.glossary__list-item:hover,
.glossary__list-item--active {
  background: var(--sm-color-primary-bg, #eff8ff);
  box-shadow: inset 3px 0 0 var(--sm-color-primary, #1570ef);
  color: var(--sm-color-primary, #1570ef);
}
.glossary__list-icon {
  flex-shrink: 0;
}
.glossary__list-label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.glossary__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 8px;
}
.glossary__crumb {
  margin-bottom: 4px;
}
.glossary__title {
  margin: 0 !important;
}
.glossary__fqn {
  display: flex;
  align-items: center;
  gap: 4px;
}
.glossary__alert {
  margin-bottom: 12px;
}
.glossary__description {
  margin-bottom: 12px;
}
.glossary__section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.glossary__terms-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 12px;
}
.glossary__search {
  max-width: 280px;
  flex: 1 1 200px;
}
.glossary__term-link {
  color: var(--sm-color-primary, #1570ef);
  font-weight: 500;
}
.glossary__term-fqn {
  margin: 2px 0 0;
  font-size: 12px;
}
.glossary__pager {
  display: flex;
  justify-content: center;
  margin-top: 12px;
}
.glossary__rail-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  width: 100%;
  padding-right: 4px;
}
@media (max-width: 1100px) {
  .glossary {
    grid-template-columns: 1fr;
  }
}
</style>
