<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { EditOutlined, PlusOutlined } from '@ant-design/icons-vue';
import { Alert, Button, Checkbox, Input, message, Modal, Select, Tag, Typography } from 'ant-design-vue';
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import {
  listFirstLevelGlossaryTermsPaginated,
  listGlossaryTermChildrenLazy,
  listGlossaryTerms,
  patchGlossaryTerm,
  searchGlossaryTermsPaginated,
} from '@/api/glossaryTerms';
import { listTasks, resolveTask } from '@/api/tasks';
import { diffJsonPatch } from '@/admin/jsonPatch';
import {
  buildTree,
  getGlossaryEntityLink,
  permissionForApproveOrReject,
  updateGlossaryTermStatus,
  type ApprovalTaskRef,
  type TermTreeNode,
} from '@/catalog/glossaryTermTree';
import DescriptionCell from '@/components/shared/DescriptionCell.vue';
import NextPrevious from '@/components/shared/NextPrevious.vue';
import SmTable from '@/components/shared/SmTable.vue';
import { useEntityPermissions } from '@/composables/useEntityPermissions';
import { joinRefNames } from '@/features/crud/paging';
import { useAuthStore } from '@/stores/auth';
import { usePermissionStore } from '@/stores/permissions';
import type { Glossary, GlossaryTerm } from '@/types/governance';
import type { TableProps } from 'ant-design-vue';
import type { Paging, PagingHandlerParams } from '@/utils/pagination';

/**
 * TermsTable (pin GlossaryTermTab.component.tsx, isGlossary=true): the
 * terms of a glossary. Self-fetches — first-level cursor pages by
 * default, offset search while a query is active — with a multi-select
 * status filter, expand-all whole-tree fetch, lazy row expansion with
 * load-more pseudo rows, HTML5 drag-move with a confirmation modal,
 * approve/reject of open approval tasks, and bulk edit.
 *
 * Permissions: glossary entity-level via useEntityPermissions. The
 * actions column is gated on raw `Create` (pin: permissions.Create,
 * no deleted gate — canCreate is the raw flag); bulk edit on
 * `canEditAll` OR admin (the frozen derived flag, deleted-gated via
 * the composable — D-7: pin's expression passes no deleted, the
 * product's frozen derivation stacks !deleted). Approve/reject do not
 * use canEdit* at all: permissionForApproveOrReject (assignee or
 * reviewer, a task must exist). Drag-move requires glossary
 * canEditAll (D-10: pin's drag gate was not separately verified).
 * While the permission load is unresolved the flags are all-false, so
 * every gated action stays hidden (fail-closed).
 *
 * Not built here (residuals R-1/R-2): proposal-source / AI-draft
 * badges (no GlossaryReview proposal infra in the product) and the
 * WorkflowHistory popover on the status badge.
 */
const props = withDefaults(
  defineProps<{
    glossary: Glossary;
    deleted?: boolean;
    refreshKey?: number;
  }>(),
  { deleted: false, refreshKey: 0 },
);

const emit = defineEmits<{
  'add-term': [parent?: TermTreeNode];
  'edit-term': [term: TermTreeNode];
}>();

const { t } = useI18n();
const router = useRouter();
const permissionStore = usePermissionStore();
const authStore = useAuthStore();

const PAGE_SIZE = 50;
const SEARCH_DEBOUNCE_MS = 500;
const EXPAND_ALL_PAGE_CAP = 20;
const STATUS_OPTIONS = ['Approved', 'Draft', 'InReview', 'Rejected'] as const;

const perms = useEntityPermissions(
  'glossary',
  () => props.glossary.fullyQualifiedName ?? props.glossary.name,
  { deleted: () => props.deleted ?? props.glossary.deleted === true },
);
const isAdminUser = computed(() => permissionStore.isAdminUser);
const currentUserId = computed(() => authStore.user?.id);
const canCreateRowActions = computed(() => isAdminUser.value || perms.canCreate.value);
const canBulkEdit = computed(() => isAdminUser.value || perms.canEditAll.value);
const canMove = computed(() => isAdminUser.value || perms.canEditAll.value);

const rows = ref<TermTreeNode[]>([]);
const loading = ref(false);
const error = ref('');
const paging = ref<Paging>({ total: 0 });
const currentPage = ref(1);
const searchInput = ref('');
const searchValue = ref('');
const selectedStatus = ref<string[]>(['all']);
const totalTermsCount = ref<number | undefined>(undefined);

const expandAll = ref(false);
const expandedTree = ref<TermTreeNode[]>([]);
const expandedAfter = ref<string | undefined>(undefined);
const expandedLoading = ref(false);
const expandedRowKeys = ref<string[]>([]);

const termTaskThreads = ref<Record<string, ApprovalTaskRef[]>>({});
const rejectTerm = ref<TermTreeNode | null>(null);
const rejectComment = ref('');
const rejecting = ref(false);

const moveState = ref<{ term: TermTreeNode; to: TermTreeNode | null } | null>(null);
const moveConfirmed = ref(false);
const moving = ref(false);

const dragging = ref<TermTreeNode | null>(null);
const dropTargetFqn = ref<string | null>(null);

let searchTimer: ReturnType<typeof setTimeout> | undefined;
let fetchSeq = 0;

const glossaryFqn = computed(() => props.glossary.fullyQualifiedName ?? props.glossary.name);
const isSearchActive = computed(() => searchValue.value.length > 0);
const isFilterActive = computed(() => !selectedStatus.value.includes('all'));
const entityStatusParam = computed(() => {
  const values = selectedStatus.value.filter((status) => status !== 'all');
  return values.length ? values.join(',') : undefined;
});
const displayedRows = computed(() => (expandAll.value ? expandedTree.value : rows.value));
const showEmptyPlaceholder = computed(
  () => !loading.value && !expandedLoading.value && !isSearchActive.value && rows.value.length === 0 && totalTermsCount.value === 0,
);
const flatExpandedCount = computed(() => {
  let count = 0;
  const walk = (nodes: TermTreeNode[]): void => {
    for (const node of nodes) {
      if (!node.isLoadMoreButton) {
        count += 1;
      }
      if (node.children?.length) {
        walk(node.children);
      }
    }
  };
  walk(expandedTree.value);
  return count;
});

const columns = computed<TableProps['columns']>(() => {
  const base: TableProps['columns'] = [
    { title: t('lists.termPlural'), dataIndex: 'name', key: 'name', width: 320 },
    { title: t('label.description'), dataIndex: 'description', key: 'description' },
    { title: t('governance.glossaries.status'), dataIndex: 'status', key: 'status', width: 160 },
    { title: t('terms.reviewers'), dataIndex: 'reviewers', key: 'reviewers' },
    { title: t('lists.synonymPlural'), dataIndex: 'synonyms', key: 'synonyms' },
    { title: t('label.owner-plural'), dataIndex: 'owners', key: 'owners' },
    ...(canCreateRowActions.value
      ? [{ title: '', dataIndex: 'actions', key: 'actions', width: 120 } as const]
      : []),
  ];
  return base;
});

function toTreeNode(term: GlossaryTerm, expandable: boolean): TermTreeNode {
  const { children: _embedded, ...rest } = term;
  return {
    ...rest,
    children: expandable && (term.childrenCount ?? 0) > 0 ? [] : undefined,
  };
}

function statusColor(status?: string): string | undefined {
  switch (status) {
    case 'Approved':
      return 'green';
    case 'Draft':
      return undefined;
    case 'InReview':
      return 'gold';
    case 'Rejected':
      return 'red';
    default:
      return undefined;
  }
}

function canDecide(row: TermTreeNode): { permission: boolean; taskId: string } {
  return permissionForApproveOrReject(row, currentUserId.value, termTaskThreads.value);
}

function isExpanded(row: TermTreeNode): boolean {
  return expandedRowKeys.value.includes(row.fullyQualifiedName ?? '');
}

function loadedChildrenCount(row: TermTreeNode): number {
  return (row.children ?? []).filter((child) => !child.isLoadMoreButton).length;
}

function remainingChildrenCount(row: TermTreeNode): number {
  return Math.max(0, (row.childrenCount ?? 0) - loadedChildrenCount(row));
}

function onSearchInput(value: string): void {
  searchInput.value = value;
  if (searchTimer) {
    clearTimeout(searchTimer);
  }
  searchTimer = setTimeout(() => {
    searchValue.value = value.trim();
    currentPage.value = 1;
    paging.value = { total: 0 };
    void fetchTerms();
  }, SEARCH_DEBOUNCE_MS);
}

function onStatusChange(values: string[]): void {
  const previous = selectedStatus.value;
  if (values.includes('all') && !previous.includes('all')) {
    selectedStatus.value = ['all'];
  } else if (values.includes('all') && previous.includes('all')) {
    selectedStatus.value = values.filter((value) => value !== 'all');
  } else if (values.length === 0) {
    selectedStatus.value = ['all'];
  } else {
    selectedStatus.value = values;
  }
  currentPage.value = 1;
  paging.value = { total: 0 };
  void fetchTerms();
}

async function fetchTotalTermsCount(): Promise<void> {
  try {
    const page = await listFirstLevelGlossaryTermsPaginated(glossaryFqn.value, 0);
    totalTermsCount.value = page.total ?? 0;
  } catch {
    totalTermsCount.value = undefined;
  }
}

async function fetchTerms(cursor?: { cursorType: 'after' | 'before'; cursorValue?: string }): Promise<void> {
  const seq = ++fetchSeq;
  loading.value = true;
  error.value = '';
  try {
    if (isSearchActive.value) {
      const page = await searchGlossaryTermsPaginated({
        q: searchValue.value,
        glossaryFqn: glossaryFqn.value,
        limit: PAGE_SIZE,
        offset: (currentPage.value - 1) * PAGE_SIZE,
        entityStatus: entityStatusParam.value,
      });
      if (seq !== fetchSeq) {
        return;
      }
      rows.value = page.data.map((term) => toTreeNode(term, false));
      paging.value = { total: page.total ?? page.data.length };
      totalTermsCount.value = page.total ?? page.data.length;
    } else {
      const page = await listFirstLevelGlossaryTermsPaginated(
        glossaryFqn.value,
        PAGE_SIZE,
        cursor?.cursorType === 'after' ? cursor.cursorValue : undefined,
        entityStatusParam.value,
        cursor?.cursorType === 'before' ? cursor.cursorValue : undefined,
      );
      if (seq !== fetchSeq) {
        return;
      }
      rows.value = page.data.map((term) => toTreeNode(term, true));
      paging.value = { total: page.total ?? page.data.length, after: page.after, before: page.before };
      totalTermsCount.value = page.total ?? page.data.length;
      if (rows.value.length === 0 && isFilterActive.value) {
        void fetchTotalTermsCount();
      }
    }
  } catch (err) {
    if (seq !== fetchSeq) {
      return;
    }
    rows.value = [];
    error.value = err instanceof Error ? err.message : t('crud.loadFailed');
  } finally {
    if (seq === fetchSeq) {
      loading.value = false;
    }
  }
}

async function fetchExpandedTree(after?: string): Promise<void> {
  expandedLoading.value = true;
  error.value = '';
  try {
    const flat: TermTreeNode[] = [];
    let cursor = after;
    let pages = 0;
    let nextAfter: string | undefined;
    do {
      const page = await listGlossaryTerms({ glossary: props.glossary.id, limit: PAGE_SIZE, after: cursor });
      flat.push(...page.data.map((term) => toTreeNode(term, true)));
      nextAfter = page.after;
      cursor = page.after;
      pages += 1;
    } while (cursor && pages < EXPAND_ALL_PAGE_CAP);
    expandedTree.value = buildTree(flat, glossaryFqn.value);
    expandedAfter.value = nextAfter;
    expandedRowKeys.value = collectExpandableFqns(expandedTree.value);
  } catch (err) {
    expandedTree.value = [];
    error.value = err instanceof Error ? err.message : t('crud.loadFailed');
  } finally {
    expandedLoading.value = false;
  }
}

function collectExpandableFqns(nodes: TermTreeNode[]): string[] {
  const fqns: string[] = [];
  const walk = (items: TermTreeNode[]): void => {
    for (const item of items) {
      if ((item.childrenCount ?? 0) > 0 && item.fullyQualifiedName) {
        fqns.push(item.fullyQualifiedName);
      }
      if (item.children?.length) {
        walk(item.children);
      }
    }
  };
  walk(nodes);
  return fqns;
}

async function toggleExpandAll(): Promise<void> {
  if (expandAll.value) {
    expandAll.value = false;
    expandedTree.value = [];
    expandedAfter.value = undefined;
    expandedRowKeys.value = [];
    await fetchTerms();
    return;
  }
  expandAll.value = true;
  await fetchExpandedTree();
}

async function fetchChildTerms(parent: TermTreeNode, after?: string): Promise<void> {
  try {
    const page = await listGlossaryTermChildrenLazy(parent.fullyQualifiedName ?? '', PAGE_SIZE, after);
    const newChildren = page.data.map((term) => toTreeNode(term, true));
    const merged = insertChildren(expandAll.value ? expandedTree.value : rows.value, parent.fullyQualifiedName ?? '', newChildren, page.after);
    if (expandAll.value) {
      expandedTree.value = merged;
    } else {
      rows.value = merged;
    }
    if (parent.fullyQualifiedName && !expandedRowKeys.value.includes(parent.fullyQualifiedName)) {
      expandedRowKeys.value = [...expandedRowKeys.value, parent.fullyQualifiedName];
    }
  } catch (err) {
    message.error(err instanceof Error ? err.message : t('crud.loadFailed'));
  }
}

function insertChildren(
  nodes: TermTreeNode[],
  parentFqn: string,
  newChildren: TermTreeNode[],
  after: string | undefined,
): TermTreeNode[] {
  return nodes.map((node) => {
    if (node.fullyQualifiedName === parentFqn) {
      const existing = (node.children ?? []).filter((child) => !child.isLoadMoreButton);
      const children = [...existing, ...newChildren];
      if (after) {
        children.push(loadMorePseudoRow(node, after));
      }
      return { ...node, children, childrenPagingAfter: after, hasMoreChildren: Boolean(after) };
    }
    if (node.children?.length) {
      return { ...node, children: insertChildren(node.children, parentFqn, newChildren, after) };
    }
    return node;
  });
}

function loadMorePseudoRow(parent: TermTreeNode, after: string): TermTreeNode {
  return {
    id: `load-more-${parent.fullyQualifiedName ?? ''}`,
    name: '',
    fullyQualifiedName: `load-more:${parent.fullyQualifiedName ?? ''}:${after}`,
    relatedTerms: [],
    owners: [],
    reviewers: [],
    domains: [],
    synonyms: [],
    references: [],
    tags: [],
    isLoadMoreButton: true,
    // The click handler reads the cursor off the parent record: capture
    // it here, or the click re-fetches the first page and duplicates
    // the rows already loaded.
    parentRecord: { ...parent, childrenPagingAfter: after, hasMoreChildren: true },
  };
}

function onExpand(expanded: boolean, record: unknown): void {
  const row = record as TermTreeNode;
  if (row.isLoadMoreButton || !row.fullyQualifiedName) {
    return;
  }
  if (expanded) {
    if (!expandedRowKeys.value.includes(row.fullyQualifiedName)) {
      expandedRowKeys.value = [...expandedRowKeys.value, row.fullyQualifiedName];
    }
    if ((row.children ?? []).length === 0 && (row.childrenCount ?? 0) > 0) {
      void fetchChildTerms(row);
    }
    return;
  }
  expandedRowKeys.value = expandedRowKeys.value.filter((fqn) => fqn !== row.fullyQualifiedName);
}

function onPagingChange({ cursorType, currentPage: nextPage }: PagingHandlerParams): void {
  currentPage.value = nextPage;
  if (isSearchActive.value) {
    void fetchTerms();
    return;
  }
  if (!cursorType) {
    void fetchTerms();
    return;
  }
  const cursorValue = cursorType === 'before' ? paging.value.before : paging.value.after;
  void fetchTerms({ cursorType, cursorValue });
}

async function fetchTasks(): Promise<void> {
  try {
    const page = await listTasks({
      aboutEntity: glossaryFqn.value,
      status: 'Open',
      category: 'Approval',
      type: 'RequestApproval',
      limit: PAGE_SIZE,
      fields: 'about,assignees,createdBy',
    });
    const grouped: Record<string, ApprovalTaskRef[]> = {};
    for (const task of page.data) {
      if (task.about?.type !== 'glossaryTerm' || !task.about.fullyQualifiedName) {
        continue;
      }
      const link = getGlossaryEntityLink(task.about.fullyQualifiedName);
      (grouped[link] ??= []).push({ id: task.id, assignees: task.assignees });
    }
    termTaskThreads.value = grouped;
  } catch {
    termTaskThreads.value = {};
  }
}

function removeTermFromTree(nodes: TermTreeNode[], targetFqn: string): TermTreeNode[] {
  return nodes
    .filter((node) => node.fullyQualifiedName !== targetFqn)
    .map((node) =>
      node.children?.length ? { ...node, children: removeTermFromTree(node.children, targetFqn) } : node,
    );
}

function applyResolution(row: TermTreeNode, taskId: string, newStatus: string): void {
  const stillFilteredOut =
    isFilterActive.value && !selectedStatus.value.includes(newStatus);
  const update = (nodes: TermTreeNode[]): TermTreeNode[] => {
    const updated = updateGlossaryTermStatus(nodes, row.fullyQualifiedName ?? '', newStatus);
    return stillFilteredOut ? removeTermFromTree(updated, row.fullyQualifiedName ?? '') : updated;
  };
  if (expandAll.value) {
    expandedTree.value = update(expandedTree.value);
  } else {
    rows.value = update(rows.value);
  }
  const link = getGlossaryEntityLink(row.fullyQualifiedName ?? '');
  const remaining = (termTaskThreads.value[link] ?? []).filter((task) => task.id !== taskId);
  if (remaining.length) {
    termTaskThreads.value = { ...termTaskThreads.value, [link]: remaining };
  } else {
    const { [link]: _removed, ...rest } = termTaskThreads.value;
    termTaskThreads.value = rest;
  }
}

async function approveTerm(row: TermTreeNode): Promise<void> {
  const { permission, taskId } = canDecide(row);
  if (!permission || !taskId) {
    return;
  }
  try {
    const updated = await resolveTask(taskId, { newValue: 'approved', resolutionType: 'Approved' });
    // A task that is not Closed still awaits further approval: only the
    // task record changes, the term status stays (pin
    // isTaskPendingFurtherApproval).
    if (updated.status !== 'Closed') {
      const link = getGlossaryEntityLink(row.fullyQualifiedName ?? '');
      termTaskThreads.value = { ...termTaskThreads.value, [link]: [{ id: updated.id, assignees: updated.assignees }] };
      return;
    }
    applyResolution(row, taskId, 'Approved');
  } catch (err) {
    message.error(err instanceof Error ? err.message : t('message.something-went-wrong'));
  }
}

function openRejectTerm(row: TermTreeNode): void {
  rejectTerm.value = row;
  rejectComment.value = '';
}

function closeRejectTerm(): void {
  rejectTerm.value = null;
  rejectComment.value = '';
}

async function confirmRejectTerm(): Promise<void> {
  const row = rejectTerm.value;
  const { permission, taskId } = row ? canDecide(row) : { permission: false, taskId: '' };
  if (!row || !permission || !taskId || rejecting.value || !rejectComment.value.trim()) {
    return;
  }
  rejecting.value = true;
  try {
    const updated = await resolveTask(taskId, {
      comment: rejectComment.value.trim(),
      newValue: 'rejected',
      resolutionType: 'Rejected',
    });
    closeRejectTerm();
    if (updated.status !== 'Closed') {
      const link = getGlossaryEntityLink(row.fullyQualifiedName ?? '');
      termTaskThreads.value = { ...termTaskThreads.value, [link]: [{ id: updated.id, assignees: updated.assignees }] };
      return;
    }
    applyResolution(row, taskId, 'Rejected');
  } catch (err) {
    message.error(err instanceof Error ? err.message : t('message.something-went-wrong'));
  } finally {
    rejecting.value = false;
  }
}

function goBulkEdit(): void {
  void router.push({
    name: 'bulk-edit',
    params: { entityType: 'glossaryTerm', fqn: glossaryFqn.value },
  });
}

function openTerm(row: TermTreeNode): void {
  void router.push({ name: 'governance-term', params: { id: row.id } });
}

function isDescendantOf(ancestor: TermTreeNode, targetFqn: string): boolean {
  const walk = (nodes: TermTreeNode[] | undefined): boolean => {
    for (const node of nodes ?? []) {
      if (node.fullyQualifiedName === targetFqn) {
        return true;
      }
      if (walk(node.children)) {
        return true;
      }
    }
    return false;
  };
  return walk(ancestor.children);
}

function onDragStart(row: TermTreeNode, event: DragEvent): void {
  dragging.value = row;
  event.dataTransfer?.setData('text/plain', row.fullyQualifiedName ?? '');
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move';
  }
}

function onDragEnd(): void {
  dragging.value = null;
  dropTargetFqn.value = null;
}

function onRowDragOver(row: TermTreeNode, event: DragEvent): void {
  if (!dragging.value || row.isLoadMoreButton || row.fullyQualifiedName === dragging.value.fullyQualifiedName) {
    return;
  }
  event.preventDefault();
  dropTargetFqn.value = row.fullyQualifiedName ?? null;
}

function onRowDrop(row: TermTreeNode, event: DragEvent): void {
  event.preventDefault();
  const dragged = dragging.value;
  dropTargetFqn.value = null;
  dragging.value = null;
  if (!dragged || row.isLoadMoreButton || row.fullyQualifiedName === dragged.fullyQualifiedName) {
    return;
  }
  if (isDescendantOf(dragged, row.fullyQualifiedName ?? '')) {
    return;
  }
  moveState.value = { term: dragged, to: row };
  moveConfirmed.value = false;
}

function onRootDragOver(event: DragEvent): void {
  if (!dragging.value) {
    return;
  }
  event.preventDefault();
}

function onRootDrop(event: DragEvent): void {
  event.preventDefault();
  const dragged = dragging.value;
  dragging.value = null;
  dropTargetFqn.value = null;
  if (!dragged) {
    return;
  }
  // Already top-level: dropping on the root is a no-op (pin).
  if (!dragged.parent || dragged.parent.type === 'glossary') {
    return;
  }
  moveState.value = { term: dragged, to: null };
  moveConfirmed.value = false;
}

function closeMove(): void {
  moveState.value = null;
  moveConfirmed.value = false;
}

async function confirmMove(): Promise<void> {
  const state = moveState.value;
  if (!state || moving.value) {
    return;
  }
  moving.value = true;
  try {
    const patch = diffJsonPatch(state.term, {
      ...state.term,
      parent: state.to ? { fullyQualifiedName: state.to.fullyQualifiedName } : null,
    });
    await patchGlossaryTerm(state.term.id, patch);
    closeMove();
    if (expandAll.value) {
      await fetchExpandedTree();
    } else {
      await fetchTerms();
    }
  } catch (err) {
    message.error(err instanceof Error ? err.message : t('message.something-went-wrong'));
  } finally {
    moving.value = false;
  }
}

function customRow(row: TermTreeNode) {
  if (row.isLoadMoreButton) {
    return {};
  }
  if (!canMove.value) {
    return {};
  }
  return {
    draggable: true,
    onDragstart: (event: DragEvent) => onDragStart(row, event),
    onDragend: () => onDragEnd(),
    onDragover: (event: DragEvent) => onRowDragOver(row, event),
    onDrop: (event: DragEvent) => onRowDrop(row, event),
    class: dropTargetFqn.value === row.fullyQualifiedName ? 'lists-widget__drop-target' : undefined,
  };
}

function resetAndReload(): void {
  searchInput.value = '';
  searchValue.value = '';
  selectedStatus.value = ['all'];
  expandAll.value = false;
  expandedTree.value = [];
  expandedAfter.value = undefined;
  expandedRowKeys.value = [];
  currentPage.value = 1;
  paging.value = { total: 0 };
  void fetchTerms();
  void fetchTasks();
}

onMounted(() => {
  void fetchTerms();
  void fetchTasks();
});

watch(
  () => props.refreshKey,
  () => {
    void fetchTerms();
  },
);

watch(glossaryFqn, () => {
  resetAndReload();
});

onBeforeUnmount(() => {
  if (searchTimer) {
    clearTimeout(searchTimer);
  }
});
</script>

<template>
  <div data-testid="glossary-terms-widget">
    <div class="lists-widget__toolbar">
      <Input
        :value="searchInput"
        data-testid="search-terms-input"
        class="lists-widget__search"
        :placeholder="t('lists.searchTerms')"
        @update:value="onSearchInput(String($event))"
      />
      <Select
        mode="multiple"
        data-testid="glossary-status-dropdown"
        class="lists-widget__status-filter"
        :value="selectedStatus"
        :placeholder="t('lists.statusFilter')"
        :options="[
          { label: t('lists.all'), value: 'all' },
          ...STATUS_OPTIONS.map((status) => ({ label: status, value: status })),
        ]"
        @change="(values) => onStatusChange(values as string[])"
      />
      <Button
        data-testid="expand-collapse-all-button"
        :disabled="expandedLoading"
        @click="toggleExpandAll"
      >
        {{ expandedLoading ? t('lists.loading') : expandAll ? t('lists.collapseAll') : t('lists.expandAll') }}
      </Button>
      <span class="lists-widget__spacer" />
      <Button
        v-if="canBulkEdit"
        data-testid="bulk-edit-table"
        type="link"
        @click="goBulkEdit"
      >
        {{ t('crud.edit') }}
      </Button>
      <Button
        v-if="canCreateRowActions"
        type="primary"
        data-testid="add-term"
        @click="emit('add-term')"
      >
        {{ t('lists.addTerm') }}
      </Button>
    </div>
    <div
      v-if="dragging"
      data-testid="move-to-root-dropzone"
      class="lists-widget__root-dropzone"
      @dragover="onRootDragOver"
      @drop="onRootDrop"
    >
      {{ t('lists.moveTermToGlossary', { from: dragging.displayName || dragging.name }) }}
    </div>
    <Alert v-if="error" type="error" show-icon :message="error" class="lists-widget__alert" />
    <div v-if="showEmptyPlaceholder" class="lists-widget__empty">
      <Typography.Text>{{ t('lists.noTerms') }}</Typography.Text>
      <Button
        v-if="canCreateRowActions"
        type="primary"
        data-testid="add-term"
        @click="emit('add-term')"
      >
        {{ t('lists.addTerm') }}
      </Button>
    </div>
    <SmTable
      v-else
      row-key="fullyQualifiedName"
      test-id="glossary-terms-table"
      :columns="columns"
      :data-source="displayedRows"
      :loading="loading || expandedLoading"
      :pagination="false"
      size="small"
      :empty-text="isSearchActive ? t('label.no-matching-result-plural') : isFilterActive ? t('lists.filterNoMatchingTerms') : t('lists.noEntityDataAvailable', { entity: t('lists.termPlural') })"
      :expanded-row-keys="expandedRowKeys"
      :row-expandable="(row: TermTreeNode) => row.children !== undefined"
      :on-expand="onExpand"
      :custom-row="customRow"
    >
      <template #bodyCell="{ column, record }">
        <template v-if="column.key === 'name'">
          <span v-if="(record as TermTreeNode).isLoadMoreButton">
            <Button
              type="link"
              data-testid="load-more-children"
              @click.stop="fetchChildTerms((record as TermTreeNode).parentRecord as TermTreeNode, (record as TermTreeNode).parentRecord?.childrenPagingAfter)"
            >
              {{ t('lists.viewMoreCount', { countValue: remainingChildrenCount((record as TermTreeNode).parentRecord as TermTreeNode) }) }}
            </Button>
          </span>
          <span v-else class="lists-widget__term-name">
            <a href="#" @click.prevent="openTerm(record as TermTreeNode)">
              {{ (record as TermTreeNode).displayName || (record as TermTreeNode).name }}
            </a>
            <Typography.Text v-if="((record as TermTreeNode).childrenCount ?? 0) > 0" type="secondary">
              {{
                isExpanded(record as TermTreeNode)
                  ? t('lists.countOfTotalLoaded', { count: loadedChildrenCount(record as TermTreeNode), total: (record as TermTreeNode).childrenCount })
                  : ((record as TermTreeNode).childrenCount === 1
                    ? t('lists.countTerm', { count: (record as TermTreeNode).childrenCount })
                    : t('lists.countTermPlural', { count: (record as TermTreeNode).childrenCount }))
              }}
            </Typography.Text>
          </span>
        </template>
        <template v-else-if="column.key === 'description'">
          <DescriptionCell :markdown="(record as TermTreeNode).description" />
        </template>
        <template v-else-if="column.key === 'status'">
          <span class="lists-widget__status-cell">
            <Tag v-if="(record as TermTreeNode).status" :color="statusColor((record as TermTreeNode).status)">
              {{ (record as TermTreeNode).status }}
            </Tag>
            <span v-else>—</span>
            <template v-if="(record as TermTreeNode).status === 'InReview' && canDecide(record as TermTreeNode).permission">
              <Button
                type="link"
                size="small"
                :data-testid="`approve-term-${(record as TermTreeNode).name}`"
                @click.stop="approveTerm(record as TermTreeNode)"
              >
                {{ t('lists.approve') }}
              </Button>
              <Button
                type="link"
                size="small"
                danger
                :data-testid="`reject-term-${(record as TermTreeNode).name}`"
                @click.stop="openRejectTerm(record as TermTreeNode)"
              >
                {{ t('lists.reject') }}
              </Button>
            </template>
          </span>
        </template>
        <template v-else-if="column.key === 'reviewers'">
          {{ joinRefNames((record as TermTreeNode).reviewers) || '—' }}
        </template>
        <template v-else-if="column.key === 'synonyms'">
          <Tag v-for="synonym in (record as TermTreeNode).synonyms ?? []" :key="synonym">{{ synonym }}</Tag>
          <span v-if="((record as TermTreeNode).synonyms ?? []).length === 0">—</span>
        </template>
        <template v-else-if="column.key === 'owners'">
          {{ joinRefNames((record as TermTreeNode).owners) || '—' }}
        </template>
        <template v-else-if="column.key === 'actions'">
          <Button
            v-if="(record as TermTreeNode).status === 'Approved'"
            type="text"
            size="small"
            :data-testid="`add-sub-term-${(record as TermTreeNode).name}`"
            :aria-label="t('lists.addTerm')"
            @click.stop="emit('add-term', record as TermTreeNode)"
          >
            <PlusOutlined />
          </Button>
          <Button
            type="text"
            size="small"
            :data-testid="`edit-term-${(record as TermTreeNode).name}`"
            :aria-label="t('crud.edit')"
            @click.stop="emit('edit-term', record as TermTreeNode)"
          >
            <EditOutlined />
          </Button>
        </template>
      </template>
    </SmTable>
    <div v-if="expandAll && expandedAfter" class="lists-widget__load-more-bar">
      <Button type="link" :loading="expandedLoading" @click="fetchExpandedTree(expandedAfter)">
        {{ t('lists.showingCountOfTotalNestedTerms', { current: flatExpandedCount, total: glossary.termCount ?? flatExpandedCount }) }}
      </Button>
    </div>
    <div v-if="!expandAll && (paging.total ?? 0) > PAGE_SIZE" class="lists-widget__pager">
      <NextPrevious
        :paging="paging"
        :page-size="PAGE_SIZE"
        :current-page="currentPage"
        :is-number-based="isSearchActive"
        :is-loading="loading"
        :paging-handler="onPagingChange"
      />
    </div>
    <Modal
      :open="rejectTerm !== null"
      data-testid="glossary-term-reject-dialog"
      :title="t('lists.rejectTermTitle')"
      :confirm-loading="rejecting"
      :ok-button-props="{ disabled: !rejectComment.trim() }"
      :ok-text="t('lists.reject')"
      :cancel-text="t('crud.cancel')"
      :destroy-on-close="true"
      @ok="confirmRejectTerm"
      @cancel="closeRejectTerm"
    >
      <Typography.Text>{{ t('lists.rejectCommentLabel') }}</Typography.Text>
      <Input.TextArea
        v-model:value="rejectComment"
        data-testid="reject-comment"
        :rows="3"
        :placeholder="t('lists.rejectCommentLabel')"
      />
    </Modal>
    <Modal
      :open="moveState !== null"
      :title="t('lists.moveTermTitle')"
      :confirm-loading="moving"
      :ok-button-props="{ disabled: (glossary.reviewers?.length ?? 0) > 0 && !moveConfirmed }"
      :ok-text="t('lists.move')"
      :cancel-text="t('crud.cancel')"
      :destroy-on-close="true"
      @ok="confirmMove"
      @cancel="closeMove"
    >
      <Typography.Paragraph>
        {{
          moveState?.to
            ? t('lists.moveTermMessage', { from: moveState.term.displayName || moveState.term.name, to: moveState.to.displayName || moveState.to.name })
            : t('lists.moveTermToGlossary', { from: moveState?.term.displayName || moveState?.term.name || '' })
        }}
      </Typography.Paragraph>
      <div v-if="(glossary.reviewers?.length ?? 0) > 0" class="lists-widget__move-confirm">
        <Checkbox v-model:checked="moveConfirmed">
          {{ t('lists.entityTransferConfirmationMessage', { from: moveState?.term.displayName || moveState?.term.name || '' }) }}
        </Checkbox>
        <Tag color="gold">InReview</Tag>
      </div>
    </Modal>
  </div>
</template>

<style scoped>
.lists-widget__toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
  flex-wrap: wrap;
}
.lists-widget__search {
  max-width: 320px;
}
.lists-widget__status-filter {
  min-width: 180px;
}
.lists-widget__spacer {
  flex: 1;
}
.lists-widget__alert {
  margin-bottom: 12px;
}
.lists-widget__empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 32px 0;
}
.lists-widget__pager {
  display: flex;
  justify-content: flex-end;
  margin-top: 12px;
}
.lists-widget__load-more-bar {
  display: flex;
  justify-content: center;
  margin-top: 8px;
}
.lists-widget__term-name {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.lists-widget__status-cell {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
.lists-widget__root-dropzone {
  border: 1px dashed var(--ant-primary-color, #1890ff);
  border-radius: 4px;
  padding: 8px 12px;
  margin-bottom: 12px;
  text-align: center;
}
.lists-widget__move-confirm {
  display: flex;
  align-items: center;
  gap: 8px;
}
</style>
