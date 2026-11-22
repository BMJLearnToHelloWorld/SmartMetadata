/**
 * Copyright 2026 SmartMetadata authors.
 * Licensed under the Apache License, Version 2.0.
 */

/**
 * Delete/Backspace handling on the lineage canvas, mapped from pin
 * a3012259ca (`components/Lineage/LineageMap/LineageMap.utils.ts`
 * `getDeleteKeyAction`, used by `EntityLineageCanvas`).
 *
 * Only Delete/Backspace, only when editing is allowed, only while focus
 * is on the page or the canvas — never while typing in an input, textarea
 * or contenteditable, and never from a drawer, modal or menu stacked over
 * the canvas. A selected node wins over a selected edge.
 */

export interface DeleteKeyActionContext {
  canEdit: boolean;
  hasSelectedNode: boolean;
  hasSelectedEdge: boolean;
}

export type DeleteKeyAction = 'node' | 'edge';

export function getDeleteKeyAction(
  event: { key: string; target?: unknown },
  context: DeleteKeyActionContext,
): DeleteKeyAction | undefined {
  if (!context.canEdit || (event.key !== 'Delete' && event.key !== 'Backspace')) {
    return undefined;
  }
  const target = event.target;
  if (target instanceof HTMLElement) {
    // The product canvas is Vue Flow (`.vue-flow`); pin guards `.react-flow`.
    if (
      target.closest('input, textarea, [contenteditable="true"]') ||
      (target !== document.body && !target.closest('.vue-flow'))
    ) {
      return undefined;
    }
  }
  if (context.hasSelectedNode) {
    return 'node';
  }
  return context.hasSelectedEdge ? 'edge' : undefined;
}
