/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import type { GlossaryTerm } from '@/types/governance';

/**
 * Glossary-term tree pure helpers, ported from pin
 * utils/GlossaryPureUtils.ts (buildTree, updateGlossaryTermStatus,
 * permissionForApproveOrReject, getGlossaryEntityLink). The widget keeps
 * its rows in this shape: a GlossaryTerm whose children are full terms
 * (not EntityRefs), plus the pin ModifiedGlossaryTerm extras the table
 * needs (load-more pseudo rows, lazy paging cursors).
 */
export interface TermTreeNode extends Omit<GlossaryTerm, 'children'> {
  children?: TermTreeNode[];
  /** Pin ModifiedGlossaryTerm: a "load more children" pseudo row. */
  isLoadMoreButton?: boolean;
  /** The real parent term of a load-more pseudo row. */
  parentRecord?: TermTreeNode;
  /** Depth in the rendered tree (root = 0), for row styling. */
  level?: number;
  /** More children pages remain server-side for this term. */
  hasMoreChildren?: boolean;
  /** Next-page cursor for this term's children. */
  childrenPagingAfter?: string;
}

/** Pin getGlossaryEntityLink: `<#E::glossaryTerm::<fqn>>`. */
export function getGlossaryEntityLink(glossaryTermFqn: string): string {
  return `<#E::glossaryTerm::${glossaryTermFqn}>`;
}

/**
 * Pin buildTree: rebuild a tree from a flat term list. A term whose parent
 * is absent from the data is an orphan of a not-yet-loaded page (progressive
 * expand-all paginates all levels, so a descendant can arrive before its
 * parent) and is held back — except terms whose parent is the glossary
 * itself or the view's root container (`rootParentFqn`), which are genuine
 * roots. The live node object is pushed (not a copy) so children attached
 * on a later page land on the same object.
 */
export function buildTree(data: TermTreeNode[], rootParentFqn?: string): TermTreeNode[] {
  const nodes: Record<string, TermTreeNode> = {};
  for (const obj of data) {
    nodes[obj.fullyQualifiedName ?? ''] = {
      ...obj,
      children: obj.children?.length ? [] : undefined,
    };
  }
  const tree: TermTreeNode[] = [];
  for (const obj of data) {
    const current = nodes[obj.fullyQualifiedName ?? ''];
    const parentFqn = obj.parent?.fullyQualifiedName;
    const parentNode = parentFqn ? nodes[parentFqn] : undefined;
    if (parentNode) {
      (parentNode.children ??= []).push(current);
      continue;
    }
    const isOrphanOfUnloadedParent =
      Boolean(parentFqn) && obj.parent?.type !== 'glossary' && parentFqn !== rootParentFqn;
    if (!isOrphanOfUnloadedParent) {
      tree.push(current);
    }
  }
  return tree;
}

interface TermStatusNode {
  fullyQualifiedName?: string;
  /** Mapped status field (server `entityStatus`, see mapTerm in api/glossaryTerms.ts). */
  status?: string;
  children?: TermStatusNode[];
}

/** Pin updateGlossaryTermStatus: the term tree with one term's status replaced, wherever it sits. */
export function updateGlossaryTermStatus<T extends TermStatusNode>(
  terms: T[],
  targetFqn: string,
  newStatus: string,
): T[] {
  return terms.map((term) => {
    if (term.fullyQualifiedName === targetFqn) {
      return { ...term, status: newStatus };
    }
    if (term.children?.length) {
      return {
        ...term,
        children: updateGlossaryTermStatus(term.children as T[], targetFqn, newStatus),
      };
    }
    return term;
  });
}

export interface ApprovalTaskRef {
  id: string;
  assignees?: Array<{ id?: string }>;
}

/**
 * Pin permissionForApproveOrReject (GlossaryPureUtils.ts:324): who may
 * resolve the open approval task on a term. With assignees, only an
 * assignee may decide; without assignees, an assignee or a term reviewer
 * may (and a task must exist at all).
 */
export function permissionForApproveOrReject(
  record: { fullyQualifiedName?: string; reviewers?: Array<{ id?: string }> },
  currentUserId: string | undefined,
  termTaskThreads: Record<string, ApprovalTaskRef[]>,
): { permission: boolean; taskId: string } {
  const entityLink = getGlossaryEntityLink(record.fullyQualifiedName ?? '');
  const task = termTaskThreads[entityLink]?.[0];
  const isReviewer = record.reviewers?.some((reviewer) => reviewer.id === currentUserId) ?? false;
  const isTaskAssignee = task?.assignees?.some((assignee) => assignee.id === currentUserId) ?? false;
  const hasTaskAssignees = Boolean(task?.assignees?.length);
  const permission = hasTaskAssignees ? isTaskAssignee : Boolean(task && (isTaskAssignee || isReviewer));
  return { permission, taskId: task?.id ?? '' };
}
