<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { Button, Empty, Spin, Tree } from 'ant-design-vue';
import type { EventDataNode } from 'ant-design-vue/es/tree';
import { listDomainChildren, searchDomains } from '@/api/domains';
import { entityLabel } from '@/features/crud/paging';
import type { Domain } from '@/types/governance';

/**
 * G2 tree (pin DomainTreeView,
 * components/DomainListing/components/DomainTreeView.tsx): roots from GET
 * /v1/domains/hierarchy, children lazy-loaded per node (directChildrenOf),
 * 15 per page, search through the ES domain index. Named deviations from
 * pin are in b2/g2-domains/PIN-MEMO.md §6: node click navigates to the
 * existing detail page (pin renders an inline DomainDetails panel); tree
 * search shows flat matches, each expandable (pin renders ancestor
 * chains via getHierarchy); root load-more is an explicit button, not
 * pin's scroll trigger; follow/unfollow and quick filters are not ported.
 * antd Tree usage follows ExploreEstateTree.vue (E5b).
 */
const TREE_PAGE_SIZE = 15;

const props = defineProps<{
  searchQuery?: string;
  refreshToken?: number;
}>();

const emit = defineEmits<{
  open: [domain: Domain];
}>();

const { t } = useI18n();

interface DomainTreeNode {
  key: string;
  title: string;
  domainType: string;
  isLeaf: boolean;
  isLoadMore?: boolean;
  loadMoreParent?: string;
  children?: DomainTreeNode[];
}

const LOAD_MORE_SUFFIX = '__load_more';

const roots = ref<Domain[]>([]);
const rootTotal = ref(0);
const rootOffset = ref(0);
const rootHasMore = computed(() => rootOffset.value + TREE_PAGE_SIZE < rootTotal.value);
const loadingRoots = ref(false);
const loadingMoreRoots = ref(false);

const searchResults = ref<Domain[]>([]);
const searching = ref(false);

const childrenMap = ref<Record<string, Domain[]>>({});
const childPaging = ref<Record<string, { offset: number; total: number }>>({});
const loadingChildren = ref<Record<string, boolean>>({});
const expandedKeys = ref<string[]>([]);
const selectedKeys = ref<string[]>([]);
const errorMessage = ref('');

const isSearching = computed(() => (props.searchQuery ?? '').trim().length > 0);
let searchGeneration = 0;

const domainByKey = computed<Record<string, Domain>>(() => {
  const map: Record<string, Domain> = {};
  const index = (domains: Domain[]): void => {
    for (const domain of domains) {
      const key = domain.fullyQualifiedName || domain.name;
      map[key] = domain;
      const kids = childrenMap.value[key];
      if (kids) {
        index(kids);
      }
    }
  };
  index(roots.value);
  index(searchResults.value);
  return map;
});

function hasMoreChildren(fqn: string): boolean {
  const paging = childPaging.value[fqn];
  return paging !== undefined && paging.offset + TREE_PAGE_SIZE < paging.total;
}

function toNode(domain: Domain): DomainTreeNode {
  const fqn = domain.fullyQualifiedName || domain.name;
  const kids = childrenMap.value[fqn];
  const loaded = kids !== undefined;
  const hasKids = (kids?.length ?? 0) > 0 || (domain.childrenCount ?? 0) > 0;
  const children = loaded
    ? [
        ...(kids ?? []).map((kid) => toNode(kid)),
        ...(hasMoreChildren(fqn)
          ? [
              {
                key: `${fqn}${LOAD_MORE_SUFFIX}`,
                title: t('governance.domains.loadMore'),
                domainType: '',
                isLeaf: true,
                isLoadMore: true,
                loadMoreParent: fqn,
              } satisfies DomainTreeNode,
            ]
          : []),
      ]
    : undefined;
  return {
    key: fqn,
    title: entityLabel(domain),
    domainType: domain.domainType,
    isLeaf: !hasKids,
    children,
  };
}

const treeData = computed<DomainTreeNode[]>(() =>
  (isSearching.value ? searchResults.value : roots.value).map((domain) => toNode(domain)),
);

async function loadRoots(append: boolean): Promise<void> {
  if (append) {
    loadingMoreRoots.value = true;
  } else {
    loadingRoots.value = true;
  }
  errorMessage.value = '';
  try {
    const offset = append ? rootOffset.value + TREE_PAGE_SIZE : 0;
    const page = await listDomainChildren(undefined, offset, TREE_PAGE_SIZE);
    roots.value = append ? [...roots.value, ...page.data] : page.data;
    rootOffset.value = offset;
    rootTotal.value = page.total ?? page.data.length;
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : t('crud.loadFailed');
  } finally {
    loadingRoots.value = false;
    loadingMoreRoots.value = false;
  }
}

async function loadChildren(fqn: string, append: boolean): Promise<void> {
  loadingChildren.value = { ...loadingChildren.value, [fqn]: true };
  try {
    const offset = append ? (childPaging.value[fqn]?.offset ?? 0) + TREE_PAGE_SIZE : 0;
    const page = await listDomainChildren(fqn, offset, TREE_PAGE_SIZE);
    childrenMap.value = {
      ...childrenMap.value,
      [fqn]: append ? [...(childrenMap.value[fqn] ?? []), ...page.data] : page.data,
    };
    childPaging.value = {
      ...childPaging.value,
      [fqn]: { offset, total: page.total ?? page.data.length },
    };
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : t('crud.loadFailed');
  } finally {
    loadingChildren.value = { ...loadingChildren.value, [fqn]: false };
  }
}

async function runSearch(query: string): Promise<void> {
  const generation = ++searchGeneration;
  searching.value = true;
  errorMessage.value = '';
  try {
    const page = await searchDomains(query, 0, 25);
    if (generation !== searchGeneration) {
      return;
    }
    searchResults.value = page.data;
  } catch (error) {
    if (generation !== searchGeneration) {
      return;
    }
    searchResults.value = [];
    errorMessage.value = error instanceof Error ? error.message : t('crud.loadFailed');
  } finally {
    if (generation === searchGeneration) {
      searching.value = false;
    }
  }
}

async function reload(): Promise<void> {
  if (isSearching.value) {
    await runSearch(props.searchQuery ?? '');
  } else {
    await loadRoots(false);
  }
}

function resetAndReload(): void {
  childrenMap.value = {};
  childPaging.value = {};
  expandedKeys.value = [];
  selectedKeys.value = [];
  void reload();
}

async function onLoadData(treeNode: EventDataNode): Promise<void> {
  // antd stores the tree-data item as dataRef, so this is our node.
  const node = treeNode.dataRef as DomainTreeNode | undefined;
  if (!node || node.isLeaf || node.isLoadMore || childrenMap.value[node.key] !== undefined) {
    return;
  }
  await loadChildren(node.key, false);
}

function onLoadMoreChildren(fqn: string): void {
  void loadChildren(fqn, true);
}

function onLoadMoreRoots(): void {
  void loadRoots(true);
}

function onSelect(keys: string[]): void {
  const key = keys[0];
  if (!key || key.endsWith(LOAD_MORE_SUFFIX)) {
    return;
  }
  selectedKeys.value = [key];
  const domain = domainByKey.value[key];
  if (domain) {
    emit('open', domain);
  }
}

watch(
  () => props.searchQuery,
  (query) => {
    if ((query ?? '').trim().length > 0) {
      void runSearch(query ?? '');
    } else if (roots.value.length === 0 && !loadingRoots.value) {
      // Mounted while searching: the hierarchy was never loaded.
      void loadRoots(false);
    }
  },
);

watch(
  () => props.refreshToken,
  () => {
    resetAndReload();
  },
);

onMounted(() => {
  if (isSearching.value) {
    void runSearch(props.searchQuery ?? '');
  } else {
    void loadRoots(false);
  }
});
</script>

<template>
  <div data-testid="domains-tree" class="domains-tree">
    <Spin v-if="loadingRoots || searching" :spinning="true" data-testid="domains-tree-loading" />
    <div v-else-if="errorMessage" class="domains-tree__error">
      <p>{{ errorMessage }}</p>
      <Button data-testid="domains-tree-retry" @click="reload">{{ t('crud.retry') }}</Button>
    </div>
    <Empty
      v-else-if="treeData.length === 0"
      :description="isSearching ? t('governance.domains.noSearchResults') : t('governance.domains.noDomains')"
    />
    <template v-else>
      <Tree
        :tree-data="treeData"
        :expanded-keys="expandedKeys"
        :selected-keys="selectedKeys"
        :load-data="onLoadData"
        @update:expanded-keys="expandedKeys = $event as string[]"
        @select="onSelect($event as string[])"
      >
        <template #title="{ title, domainType, isLoadMore, loadMoreParent }">
          <Button
            v-if="isLoadMore"
            type="link"
            size="small"
            :loading="loadingChildren[loadMoreParent as string]"
            data-testid="domains-tree-load-more-children"
            @click.stop="onLoadMoreChildren(loadMoreParent as string)"
          >
            {{ t('governance.domains.loadMore') }}
          </Button>
          <span v-else :data-testid="`domain-tree-node-${title}`">
            {{ title }}
            <span class="domains-tree__type">{{ domainType }}</span>
          </span>
        </template>
      </Tree>
      <div v-if="!isSearching && rootHasMore" class="domains-tree__more">
        <Button
          :loading="loadingMoreRoots"
          data-testid="domains-tree-load-more"
          @click="onLoadMoreRoots"
        >
          {{ t('governance.domains.loadMore') }}
        </Button>
      </div>
    </template>
  </div>
</template>

<style scoped>
.domains-tree__type {
  margin-left: 8px;
  color: var(--sm-color-text-secondary);
  font-size: 12px;
}

.domains-tree__more {
  margin-top: 12px;
  text-align: center;
}

.domains-tree__error {
  padding: 16px;
  text-align: center;
}
</style>
