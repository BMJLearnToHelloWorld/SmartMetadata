/**
 * Copyright 2026 SmartMetadata authors.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { describe, expect, it } from 'vitest';
import {
  buildOntologyGraphData,
  createGraphEditState,
  HIERARCHICAL_RELATION_NAMES,
} from './ontologyGraph';
import type { OntologyConcept } from '@/types/ontology';

function concept(partial: Partial<OntologyConcept>): OntologyConcept {
  return {
    id: 'c1',
    name: 'Concept',
    owners: [],
    ...partial,
  } as OntologyConcept;
}

describe('buildOntologyGraphData', () => {
  it('maps superClasses to subClassOf edges and skips id-less refs', () => {
    const data = buildOntologyGraphData([
      concept({ id: 'child', name: 'Child', superClasses: [{ id: 'parent', name: 'Parent' }, { name: 'NoId' }] }),
      concept({ id: 'parent', name: 'Parent', displayName: 'Parent Display' }),
    ]);
    expect(data.nodes.map((node) => node.id)).toEqual(['child', 'parent']);
    expect(data.nodes[1]?.label).toBe('Parent Display');
    expect(data.edges).toEqual([
      { id: 'parent->child:subClassOf', source: 'parent', target: 'child', relationType: 'subClassOf' },
    ]);
  });

  it('collapses duplicate super-class edges', () => {
    const data = buildOntologyGraphData([
      concept({ id: 'child', name: 'Child', superClasses: [{ id: 'p', name: 'P' }, { id: 'p', name: 'P' }] }),
    ]);
    expect(data.edges).toHaveLength(1);
  });
});

describe('createGraphEditState', () => {
  it('arms, pends, and confirms a relation; self-click cancels', () => {
    const edit = createGraphEditState(true);
    edit.startArm('a');
    expect(edit.armedFromId()).toBe('a');
    edit.selectTarget('a');
    expect(edit.pendingRelation()).toBeNull();
    edit.startArm('a');
    edit.selectTarget('b');
    expect(edit.pendingRelation()).toEqual({ fromId: 'a', toId: 'b' });
    expect(edit.confirmRelationType('subClassOf')).toEqual({ fromId: 'a', toId: 'b', relationType: 'subClassOf' });
    expect(edit.pendingRelation()).toBeNull();
    expect(edit.confirmRelationType('isA')).toBeNull();
  });

  it('does not arm when edit mode is off and offers the official hierarchical names', () => {
    const edit = createGraphEditState(false);
    edit.startArm('a');
    expect(edit.armedFromId()).toBeNull();
    expect(HIERARCHICAL_RELATION_NAMES).toContain('subClassOf');
    expect(HIERARCHICAL_RELATION_NAMES).toHaveLength(9);
  });
});
