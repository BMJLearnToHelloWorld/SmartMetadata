/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0.
 */
import { toCanvas } from 'html-to-image';

/**
 * Lineage PNG export, adapted from the official ExportUtils mechanism
 * (html-to-image toCanvas, white background, 20px padding, pixelRatio caps,
 * non-visual subtree pruning, failure surfaced to the caller).
 *
 * Two deliberate VueFlow adaptations, both structural, not invented
 * parameters:
 * - Single capture, no edges-overlay compositing: VueFlow keeps nodes and
 *   the edges SVG inside one `.vue-flow__viewport` transform container, so
 *   one toCanvas keeps them aligned. ReactFlow's split edge layer is what
 *   forced the official overlay path.
 * - Container client size, no 1000x800 minimum inflation: the official flow
 *   element scrolls to the graph extent, while VueFlow's `.vue-flow` element
 *   is a fixed container; inflating the clone would break the fitView
 *   transform and crop the graph.
 */
export const EXPORT_PIXEL_RATIO = 2;
const MAX_PHYSICAL_PIXELS = 64_000_000;
const MAX_PHYSICAL_DIM = 16_384;
const EXPORT_PADDING = 20;

export function computeSafePixelRatio(logicalWidth: number, logicalHeight: number): number {
  if (!(logicalWidth > 0) || !(logicalHeight > 0)) {
    return 1;
  }
  const byArea = Math.sqrt(MAX_PHYSICAL_PIXELS / (logicalWidth * logicalHeight));
  const byDim = Math.min(MAX_PHYSICAL_DIM / logicalWidth, MAX_PHYSICAL_DIM / logicalHeight);
  return Math.min(EXPORT_PIXEL_RATIO, byArea, byDim);
}

export function shouldIncludeInLineageExport(node: Element): boolean {
  if (!(node instanceof HTMLElement)) {
    return true;
  }
  const classList = node.classList;
  if (
    classList?.contains('vue-flow__background') ||
    classList?.contains('vue-flow__controls') ||
    classList?.contains('vue-flow__minimap') ||
    classList?.contains('vue-flow__attribution')
  ) {
    return false;
  }
  if (node.dataset?.exportHide === 'true') {
    return false;
  }
  return true;
}

export function lineagePngFileName(entityType: string, fqn: string): string {
  return `lineage-${entityType}-${fqn.replace(/[^A-Za-z0-9_.-]/g, '_')}.png`;
}

export async function captureLineagePng(flowElement: HTMLElement, fileName: string): Promise<void> {
  const imageWidth = flowElement.clientWidth;
  const imageHeight = flowElement.clientHeight;
  if (!(imageWidth > 0) || !(imageHeight > 0)) {
    throw new Error('Lineage flow element has no size to export');
  }
  const fullWidth = imageWidth + EXPORT_PADDING * 2;
  const fullHeight = imageHeight + EXPORT_PADDING * 2;
  const pixelRatio = computeSafePixelRatio(fullWidth, fullHeight);
  const canvas = await toCanvas(flowElement, {
    backgroundColor: '#ffffff',
    width: fullWidth,
    height: fullHeight,
    pixelRatio,
    filter: shouldIncludeInLineageExport,
    style: {
      width: `${imageWidth}px`,
      height: `${imageHeight}px`,
      margin: `${EXPORT_PADDING}px`,
    },
  });
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (result) => (result ? resolve(result) : reject(new Error('canvas.toBlob returned null'))),
      'image/png',
      1.0,
    );
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.style.visibility = 'hidden';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
