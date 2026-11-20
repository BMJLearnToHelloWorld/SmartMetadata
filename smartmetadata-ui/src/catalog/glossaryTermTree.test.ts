/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { describe, expect, it } from 'vitest';
import {
  buildTree,
  getGlossaryEntityLink,
  permissionForApproveOrReject,
  updateGlossaryTermStatus,
  type TermTreeNode,
} from './glossaryTermTree';

function term(fqn: string, parentFqn?: string, parentType = 'glossaryTerm'): TermTreeNode {
  return {
    id: fqn,
    name: fqn.split('.').pop() ?? fqn,
    fullyQualifiedName: fqn,
    relatedTerms: [],
    owners: [],
    reviewers: [],
    domains: [],
    synonyms: [],
    references: [],
    tags: [],
    parent: parentFqn ? { name: parentFqn.split('.').pop() ?? parentFqn, fullyQualifiedName: parentFqn, type: parentType } : undefined,
  };
}

describe('glossaryTermTree (pin GlossaryPureUtils ports)', () => {
  it('builds a tree from a flat list', () => {
    const tree = buildTree(
      [term('g.a'), term('g.a.b', 'g.a'), term('g.a.b.c', 'g.a.b'), term('g.d')],
      'g',
    );
    expect(tree).toHaveLength(2);
    expect(tree[0].children).toHaveLength(1);
    expect(tree[0].children?.[0].children).toHaveLength(1);
  });

  it('holds back orphans of not-yet-loaded parents but keeps glossary roots', () => {
    const tree = buildTree(
      [term('g.a.b', 'g.a'), term('g.x', 'g', 'glossary')],
      'g',
    );
    expect(tree.map((t) => t.fullyQualifiedName)).toEqual(['g.x']);
  });

  it('replaces one term status deep in the tree', () => {
    const tree = buildTree([term('g.a'), term('g.a.b', 'g.a')], 'g');
    const updated = updateGlossaryTermStatus(
      tree.map((t) => ({ ...t, status: 'Draft' })),
      'g.a.b',
      'Approved',
    );
    expect(updated[0].status).toBe('Draft');
    expect(updated[0].children?.[0].status).toBe('Approved');
  });

  it('builds the pin entity link', () => {
    expect(getGlossaryEntityLink('g.a')).toBe('<#E::glossaryTerm::g.a>');
  });

  it('permissionForApproveOrReject: assignees gate on assignee only', () => {
    const threads = { '<#E::glossaryTerm::g.a>': [{ id: 'task-1', assignees: [{ id: 'u-assignee' }] }] };
    expect(
      permissionForApproveOrReject({ fullyQualifiedName: 'g.a', reviewers: [{ id: 'u-reviewer' }] }, 'u-assignee', threads),
    ).toEqual({ permission: true, taskId: 'task-1' });
    expect(
      permissionForApproveOrReject({ fullyQualifiedName: 'g.a', reviewers: [{ id: 'u-reviewer' }] }, 'u-reviewer', threads),
    ).toEqual({ permission: false, taskId: 'task-1' });
  });

  it('permissionForApproveOrReject: without assignees a reviewer may decide, a stranger may not', () => {
    const threads = { '<#E::glossaryTerm::g.a>': [{ id: 'task-1', assignees: [] }] };
    expect(
      permissionForApproveOrReject({ fullyQualifiedName: 'g.a', reviewers: [{ id: 'u-reviewer' }] }, 'u-reviewer', threads).permission,
    ).toBe(true);
    expect(
      permissionForApproveOrReject({ fullyQualifiedName: 'g.a', reviewers: [{ id: 'u-reviewer' }] }, 'u-stranger', threads).permission,
    ).toBe(false);
  });

  it('permissionForApproveOrReject: no task means no permission', () => {
    expect(
      permissionForApproveOrReject({ fullyQualifiedName: 'g.a', reviewers: [{ id: 'u-reviewer' }] }, 'u-reviewer', {}),
    ).toEqual({ permission: false, taskId: '' });
  });
});
