<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { Button, Select, Spin, Tag, Typography, message } from 'ant-design-vue';
import NoDataPlaceholder from '@/components/shared/NoDataPlaceholder.vue';
import NextPrevious from '@/components/shared/NextPrevious.vue';
import SmTable from '@/components/shared/SmTable.vue';
import { listGlossaryTermChildrenLazy, listGlossaryTerms } from '@/api/glossaryTerms';
import { entityLabel, joinRefNames } from '@/features/crud/paging';
import { PAGE_SIZE_LARGE, type CursorType, type Paging } from '@/utils/pagination';
import type { GlossaryTerm } from '@/types/governance';

/**
 * Pin GlossaryTermTab (components/Glossary/GlossaryTermTab/
 * GlossaryTermTab.component.tsx), term-view subset — the GlossaryTerm
 * #glossary_terms tab (utils/Glossary/GlossaryTermUtils.tsx:144-163,
 * buildTermsTab, isGlossary={false}).
 *
 * - First-level page: getFirstLevelGlossaryTermsPaginated
 *   (directChildrenOf + limit PAGE_SIZE_LARGE + entityStatus, cursor
 *   before/after paging); the embedded `children` refs of the parent
 *   payload are NOT used — they carry no status/owners, and pin reads
 *   its rows from the paged endpoint.
 * - Nested expand: expanding a row with childrenCount > 0 and no loaded
 *   children lazy-loads them (getGlossaryTermChildrenLazy, 50/page);
 *   re-expand never refetches.
 * - Load more: a synthetic row at the end of a parent's children
 *   (pin load-more-children-button) fetches the next page with the
 *   stored after cursor and appends it.
 * - Name cell: collapsed shows the whole-subtree total
 *   (label.count-term-plural), expanded shows "x of y loaded"
 *   (label.count-of-total-loaded, loaded count walked recursively —
 *   the API's childrenCount is the whole subtree size, pin :626-633).
 * - Status filter: Approved / Draft / InReview, all selected by
 *   default; a partial selection is sent as a comma-joined
 *   entityStatus parameter (pin :655-658).
 *
 * Product adaptations, stated not silent:
 * - The lazy-children machinery (synthetic loading / error / more rows,
 *   normalizeTermChildren, updateTermTree) is the GlossaryDetailView
 *   pattern (views/governance/GlossaryDetailView.vue:360-470), not a
 *   second invention: same CHILD_PAGE_SIZE, same row ids, same retry.
 * - No text search: pin searches via GET /glossaryTerms/search
 *   (searchGlossaryTermsPaginated), which the product has no equivalent
 *   for; recorded as residual D-G2-1 instead of an invented ES filter.
 * - No ACTIONS column (pin bulk edit / move / delete) and no drag
 *   reorder or Expand All: recorded as residual D-G2-2. Row-level
 *   edit/delete stay on the page header.
 * - First-level paging is NextPrevious in cursor mode with a local
 *   page number (utils/pagination.ts cursor contract); the generic
 *   useCursorPagedList hook is not pulled in — a single filtered list
 *   has no cross-page jumps to walk.
 */

type TermTreeNode = Omit<GlossaryTerm, 'children'> & { children?: TermTreeNode[] };

const props = defineProps<{ term: GlossaryTerm }>();

const { t } = useI18n();
const router = useRouter();

/** Pin PAGE_SIZE_LARGE (constants.ts:62). */
const PAGE_SIZE = PAGE_SIZE_LARGE;
/** Pin default status selection (GlossaryTermTab.component.tsx:655-658). */
const ALL_STATUSES = ['Approved', 'Draft', 'InReview'] as const;

const termFqn = computed(() => props.term.fullyQualifiedName || props.term.name);

const rows = ref<TermTreeNode[]>([]);
const paging = ref<Paging>({ total: 0 });
const currentPage = ref(1);
const topLoading = ref(false);
const selectedStatus = ref<string[]>([...ALL_STATUSES]);
const expandedRowKeys = ref<string[]>([]);

// Lazy term-children state, keyed by parent term FQN — the
// GlossaryDetailView pattern, verbatim in shape.
const CHILD_PAGE_SIZE = 50;
const loadingChildren = reactive(new Set<string>());
const enrichedChildren = reactive(new Set<string>());
const childPageAfter = reactive(new Map<string, string | undefined>());
const childErrors = reactive(new Map<string, string>());

type SyntheticChildKind = 'loading' | 'error' | 'more';

function syntheticKind(record: TermTreeNode): SyntheticChildKind | null {
  const id = record.id || '';
  if (id.startsWith('__gterm-loading__:')) {
    return 'loading';
  }
  if (id.startsWith('__gterm-error__:')) {
    return 'error';
  }
  if (id.startsWith('__gterm-more__:')) {
    return 'more';
  }
  return null;
}

function syntheticParentId(record: TermTreeNode): string {
  const id = record.id || '';
  return id.slice(id.indexOf(':') + 1);
}

/**
 * GlossaryDetailView.normalizeTermChildren, same rule: a term that
 * reports childrenCount but arrived without embedded refs gets an
 * empty array (the expand icon appears; expanding lazy-loads the
 * page), childless terms keep no children key (no icon).
 */
function normalizeTermChildren(term: GlossaryTerm): TermTreeNode {
  if ((term.childrenCount ?? 0) > 0 && !term.children?.length) {
    return { ...term, children: [] };
  }
  return term as TermTreeNode;
}

/** Recursively replace one term (by FQN, at any tree depth) with its update. */
function updateTermTree(
  list: TermTreeNode[],
  fqn: string,
  update: (term: TermTreeNode) => TermTreeNode,
): TermTreeNode[] {
  return list.map((term) => {
    if (term.fullyQualifiedName === fqn) {
      return update(term);
    }
    const children = term.children;
    if (children?.length) {
      return { ...term, children: updateTermTree(children, fqn, update) };
    }
    return term;
  });
}

function findTerm(list: TermTreeNode[], fqn: string): TermTreeNode | undefined {
  for (const term of list) {
    if (term.fullyQualifiedName === fqn) {
      return term;
    }
    const found = term.children?.length ? findTerm(term.children, fqn) : undefined;
    if (found) {
      return found;
    }
  }
  return undefined;
}

/**
 * Loaded-descendant count for one row (pin loadedNestedCountByFqn,
 * :626-633): the API's childrenCount is the whole subtree size, so
 * the "x of y loaded" numerator must be walked recursively, skipping
 * synthetic rows.
 */
function loadedDescendantCount(term: TermTreeNode): number {
  const children = (term.children ?? []).filter((child) => !syntheticKind(child));
  return children.reduce((sum, child) => sum + 1 + loadedDescendantCount(child), 0);
}

const statusParam = computed(() =>
  selectedStatus.value.length === ALL_STATUSES.length ? undefined : selectedStatus.value.join(','),
);

/**
 * Pager total: the server's direct-children total when present, else
 * the current page size — never the term's childrenCount, which counts
 * the whole subtree (pin GlossaryTermTab :626-633).
 */
const totalTerms = computed(() => paging.value.total || rows.value.length);

const columns = computed(() => [
  { title: t('governance.glossaries.termsCol'), dataIndex: 'name', key: 'name' },
  { title: t('crud.description'), dataIndex: 'description', key: 'description' },
  { title: t('governance.glossaries.status'), key: 'status', width: 120 },
  { title: t('crud.owners'), key: 'owners', width: 140 },
  { title: t('terms.reviewers'), key: 'reviewers', width: 140 },
  { title: t('terms.synonyms'), key: 'synonyms', width: 160 },
]);

const statusOptions = ALL_STATUSES.map((value) => ({ value, label: value }));

let fetchSeq = 0;

async function fetchTopLevel(after?: string, before?: string): Promise<void> {
  const fqn = termFqn.value;
  if (!fqn) {
    return;
  }
  const id = ++fetchSeq;
  topLoading.value = true;
  try {
    const page = await listGlossaryTerms({
      directChildrenOf: fqn,
      limit: PAGE_SIZE,
      after,
      before,
      entityStatus: statusParam.value,
    });
    if (id !== fetchSeq) {
      return;
    }
    rows.value = page.data.map(normalizeTermChildren);
    paging.value = {
      after: page.after,
      before: page.before,
      total: page.total ?? rows.value.length,
    };
    // A freshly loaded page starts with every row collapsed (pin
    // fetchAllTerms).
    expandedRowKeys.value = [];
  } catch (error) {
    if (id !== fetchSeq) {
      return;
    }
    // Pin shows an error toast and keeps the previous page in place.
    message.error(error instanceof Error ? error.message : t('crud.loadFailed'));
  } finally {
    if (id === fetchSeq) {
      topLoading.value = false;
    }
  }
}

function onPaging(params: { currentPage: number; cursorType?: CursorType }): void {
  currentPage.value = params.currentPage;
  if (params.cursorType === 'after') {
    void fetchTopLevel(paging.value.after, undefined);
  } else if (params.cursorType === 'before') {
    void fetchTopLevel(undefined, paging.value.before);
  }
}

/**
 * Lazy-load a term's direct children (official
 * getGlossaryTermChildrenLazy: directChildrenOf + after cursor, 50 per
 * page). First expand replaces the embedded EntityRefs — which carry no
 * status or owners — with full terms; later pages append. A failed page
 * leaves previously loaded children in place and appends a retry row
 * instead of an empty tree.
 */
async function ensureChildrenLoaded(term: TermTreeNode, after?: string): Promise<void> {
  const fqn = term.fullyQualifiedName || term.name;
  const isLoadMore = after !== undefined;
  if (!fqn || loadingChildren.has(fqn)) {
    return;
  }
  // Re-expand never refetches; a zero subtree count is authoritative empty.
  if (!isLoadMore && (enrichedChildren.has(fqn) || term.childrenCount === 0)) {
    return;
  }
  loadingChildren.add(fqn);
  if (!isLoadMore) {
    childErrors.delete(fqn);
    rows.value = updateTermTree(rows.value, fqn, (current) => {
      const kept = (current.children ?? []).filter(
        (child) => syntheticKind(child) !== 'error',
      );
      const loadingRow: TermTreeNode = {
        id: `__gterm-loading__:${current.id}`,
        name: '',
        fullyQualifiedName: fqn,
        relatedTerms: [],
        owners: [],
        reviewers: [],
        domains: [],
        synonyms: [],
        references: [],
        tags: [],
      };
      return { ...current, children: kept.length ? kept : [loadingRow] };
    });
  }
  try {
    const page = await listGlossaryTermChildrenLazy(fqn, CHILD_PAGE_SIZE, after);
    enrichedChildren.add(fqn);
    childPageAfter.set(fqn, page.after);
    rows.value = updateTermTree(rows.value, fqn, (current) => {
      const prev = (current.children ?? []).filter((child) => !syntheticKind(child));
      const fresh = page.data.map(normalizeTermChildren);
      const next = isLoadMore ? [...prev, ...fresh] : [...fresh];
      const moreRow: TermTreeNode | null = page.after
        ? {
            id: `__gterm-more__:${current.id}`,
            name: '',
            fullyQualifiedName: fqn,
            relatedTerms: [],
            owners: [],
            reviewers: [],
            domains: [],
            synonyms: [],
            references: [],
            tags: [],
          }
        : null;
      return { ...current, children: moreRow ? [...next, moreRow] : next };
    });
  } catch (error) {
    childErrors.set(fqn, error instanceof Error ? error.message : t('crud.loadFailed'));
    rows.value = updateTermTree(rows.value, fqn, (current) => {
      const prev = (current.children ?? []).filter((child) => !syntheticKind(child));
      const errorRow: TermTreeNode = {
        id: `__gterm-error__:${current.id}`,
        name: '',
        fullyQualifiedName: fqn,
        relatedTerms: [],
        owners: [],
        reviewers: [],
        domains: [],
        synonyms: [],
        references: [],
        tags: [],
      };
      return { ...current, children: [...prev, errorRow] };
    });
  } finally {
    loadingChildren.delete(fqn);
  }
}

/** Load the next children page (or retry the failed page) for a synthetic row. */
function fetchMoreChildren(row: TermTreeNode): void {
  const fqn = row.fullyQualifiedName || '';
  if (!fqn) {
    return;
  }
  const stub: TermTreeNode = {
    id: syntheticParentId(row),
    name: '',
    fullyQualifiedName: fqn,
    relatedTerms: [],
    owners: [],
    reviewers: [],
    domains: [],
    synonyms: [],
    references: [],
    tags: [],
  };
  void ensureChildrenLoaded(stub, childPageAfter.get(fqn));
}

function onTermExpand(expanded: boolean, record: unknown): void {
  const term = record as TermTreeNode;
  const key = term.id;
  expandedRowKeys.value = expanded
    ? [...new Set([...expandedRowKeys.value, key])]
    : expandedRowKeys.value.filter((item) => item !== key);
  if (expanded && !syntheticKind(term)) {
    void ensureChildrenLoaded(term);
  }
}

function isRowExpanded(record: TermTreeNode): boolean {
  return expandedRowKeys.value.includes(record.id);
}

function nestedCountText(record: TermTreeNode): string {
  const totalNested = record.childrenCount ?? 0;
  if (totalNested === 0) {
    return '';
  }
  if (isRowExpanded(record)) {
    return t('label.count-of-total-loaded', {
      count: loadedDescendantCount(record),
      total: totalNested,
    });
  }
  return t(totalNested === 1 ? 'label.count-term' : 'label.count-term-plural', {
    count: totalNested,
  });
}

function remainingChildren(record: TermTreeNode): number {
  const parent = findTerm(rows.value, record.fullyQualifiedName || '') ?? record;
  return Math.max(0, (parent.childrenCount ?? 0) - loadedDescendantCount(parent));
}

function openTerm(record: TermTreeNode): void {
  if (!record.id) {
    return;
  }
  void router.push({ name: 'governance-term', params: { id: record.id } });
}

watch([termFqn, selectedStatus], () => {
  currentPage.value = 1;
  void fetchTopLevel();
});

onMounted(() => {
  void fetchTopLevel();
});
</script>

<template>
  <div data-testid="term-children-table" class="glossary-term-tab">
    <div class="glossary-term-tab__filters">
      <Select
        v-model:value="selectedStatus"
        mode="multiple"
        allow-clear
        :options="statusOptions"
        :placeholder="t('governance.glossaries.status')"
        data-testid="term-children-status-filter"
        style="min-width: 240px"
      />
    </div>
    <SmTable
      row-key="id"
      :columns="columns"
      :data-source="rows"
      :loading="topLoading"
      :pagination="false"
      :expanded-row-keys="expandedRowKeys"
      :row-expandable="
        (record) =>
          !syntheticKind(record as TermTreeNode) &&
          (((record as TermTreeNode).childrenCount ?? 0) > 0 ||
            ((record as TermTreeNode).children?.length ?? 0) > 0)
      "
      :on-expand="onTermExpand"
      size="small"
    >
      <template #bodyCell="{ column, record }">
        <template v-if="syntheticKind(record as TermTreeNode)">
          <template v-if="column.key === 'name'">
            <span
              v-if="syntheticKind(record as TermTreeNode) === 'loading'"
              :data-testid="`term-children-loading-${syntheticParentId(record as TermTreeNode)}`"
            >
              <Spin size="small" /> {{ t('governance.glossaries.loadingChildren') }}
            </span>
            <span
              v-else-if="syntheticKind(record as TermTreeNode) === 'error'"
              :data-testid="`term-children-error-${syntheticParentId(record as TermTreeNode)}`"
            >
              {{ childErrors.get((record as TermTreeNode).fullyQualifiedName || '') }}
              <Button type="link" size="small" @click="fetchMoreChildren(record as TermTreeNode)">
                {{ t('shared.retry') }}
              </Button>
            </span>
            <Button
              v-else
              type="link"
              size="small"
              data-testid="load-more-children-button"
              :loading="loadingChildren.has((record as TermTreeNode).fullyQualifiedName || '')"
              @click="fetchMoreChildren(record as TermTreeNode)"
            >
              {{
                t('label.view-more-count', {
                  countValue: remainingChildren(record as TermTreeNode),
                })
              }}
            </Button>
          </template>
          <Typography.Text v-else type="secondary">—</Typography.Text>
        </template>
        <template v-else-if="column.key === 'name'">
          <a
            v-if="(record as TermTreeNode).id"
            href="#"
            :data-testid="`term-row-${(record as TermTreeNode).id}`"
            @click.prevent="openTerm(record as TermTreeNode)"
          >
            {{ entityLabel(record as TermTreeNode) }}
          </a>
          <span v-else>{{ entityLabel(record as TermTreeNode) }}</span>
          <Typography.Text
            v-if="((record as TermTreeNode).childrenCount ?? 0) > 0"
            type="secondary"
            data-testid="nested-term-count"
            style="margin-left: 8px; white-space: nowrap"
          >
            {{ nestedCountText(record as TermTreeNode) }}
          </Typography.Text>
        </template>
        <template v-else-if="column.key === 'description'">
          {{ (record as TermTreeNode).description || '—' }}
        </template>
        <template v-else-if="column.key === 'status'">
          <Tag v-if="(record as TermTreeNode).status" color="purple">
            {{ (record as TermTreeNode).status }}
          </Tag>
          <Typography.Text v-else type="secondary">—</Typography.Text>
        </template>
        <template v-else-if="column.key === 'owners'">
          {{ joinRefNames((record as TermTreeNode).owners) || '—' }}
        </template>
        <template v-else-if="column.key === 'reviewers'">
          {{ joinRefNames((record as TermTreeNode).reviewers) || '—' }}
        </template>
        <template v-else-if="column.key === 'synonyms'">
          {{ (record as TermTreeNode).synonyms.join(', ') || '—' }}
        </template>
      </template>
    </SmTable>
    <NoDataPlaceholder
      v-if="!rows.length && !topLoading"
      test-id="term-children-empty"
      :title="t('terms.noChildTerms')"
    />
    <NextPrevious
      v-if="paging.after || paging.before || totalTerms > PAGE_SIZE"
      :paging="paging"
      :paging-handler="onPaging"
      :page-size="PAGE_SIZE"
      :current-page="currentPage"
      :is-loading="topLoading"
    />
  </div>
</template>

<style scoped>
.glossary-term-tab {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.glossary-term-tab__filters {
  display: flex;
  gap: 8px;
}
</style>
