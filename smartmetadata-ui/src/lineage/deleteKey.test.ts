/**
 * Copyright 2026 SmartMetadata authors.
 * Licensed under the Apache License, Version 2.0.
 */
import { describe, expect, it } from 'vitest';
import { getDeleteKeyAction } from './deleteKey';

describe('getDeleteKeyAction (pin LineageMap.utils)', () => {
  it('returns undefined when editing is not allowed, whatever the key', () => {
    expect(
      getDeleteKeyAction(
        { key: 'Delete', target: document.body },
        { canEdit: false, hasSelectedNode: true, hasSelectedEdge: true },
      ),
    ).toBeUndefined();
  });

  it('returns undefined for other keys', () => {
    expect(
      getDeleteKeyAction(
        { key: 'Enter', target: document.body },
        { canEdit: true, hasSelectedNode: true, hasSelectedEdge: true },
      ),
    ).toBeUndefined();
  });

  it('prefers the node over the edge, for Delete and Backspace', () => {
    for (const key of ['Delete', 'Backspace']) {
      expect(
        getDeleteKeyAction(
          { key, target: document.body },
          { canEdit: true, hasSelectedNode: true, hasSelectedEdge: true },
        ),
      ).toBe('node');
      expect(
        getDeleteKeyAction(
          { key, target: document.body },
          { canEdit: true, hasSelectedNode: false, hasSelectedEdge: true },
        ),
      ).toBe('edge');
      expect(
        getDeleteKeyAction(
          { key, target: document.body },
          { canEdit: true, hasSelectedNode: false, hasSelectedEdge: false },
        ),
      ).toBeUndefined();
    }
  });

  it('never acts while typing in an input, textarea or contenteditable', () => {
    const input = document.createElement('input');
    document.body.appendChild(input);
    const textarea = document.createElement('textarea');
    document.body.appendChild(textarea);
    const editable = document.createElement('div');
    editable.setAttribute('contenteditable', 'true');
    document.body.appendChild(editable);
    for (const target of [input, textarea, editable]) {
      expect(
        getDeleteKeyAction(
          { key: 'Delete', target },
          { canEdit: true, hasSelectedNode: true, hasSelectedEdge: false },
        ),
      ).toBeUndefined();
    }
    input.remove();
    textarea.remove();
    editable.remove();
  });

  it('never acts from outside the flow (e.g. a drawer or modal over the canvas)', () => {
    const outside = document.createElement('div');
    document.body.appendChild(outside);
    expect(
      getDeleteKeyAction(
        { key: 'Delete', target: outside },
        { canEdit: true, hasSelectedNode: true, hasSelectedEdge: false },
      ),
    ).toBeUndefined();
    outside.remove();
  });

  it('acts from inside the flow', () => {
    const flow = document.createElement('div');
    flow.className = 'vue-flow';
    const child = document.createElement('button');
    flow.appendChild(child);
    document.body.appendChild(flow);
    expect(
      getDeleteKeyAction(
        { key: 'Delete', target: child },
        { canEdit: true, hasSelectedNode: true, hasSelectedEdge: false },
      ),
    ).toBe('node');
    flow.remove();
  });
});
