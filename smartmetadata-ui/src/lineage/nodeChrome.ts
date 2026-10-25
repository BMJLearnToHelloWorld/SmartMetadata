/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * you may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import type { LineageGraphNode } from './graphModel';

const LONG_FQN = 42;

export function lineageServiceName(fqn: string): string {
  if (!fqn) {
    return '';
  }
  return fqn.split('.')[0] ?? '';
}

export function lineagePathLabel(fqn: string): string {
  const parts = fqn.split('.').filter(Boolean);
  if (parts.length <= 1) {
    return '';
  }
  return parts.slice(0, -1).join(' / ');
}

export function truncateLineageFqn(fqn: string, max = LONG_FQN): string {
  if (!fqn || fqn.length <= max) {
    return fqn;
  }
  const parts = fqn.split('.').filter(Boolean);
  if (parts.length <= 2) {
    return `${fqn.slice(0, Math.max(1, max - 1))}…`;
  }
  return `${parts[0]}…${parts[parts.length - 1]}`;
}

export function filterCanvasNodes(nodes: LineageGraphNode[], query: string): LineageGraphNode[] {
  const needle = query.trim().toLowerCase();
  if (!needle) {
    return nodes;
  }
  return nodes.filter((node) => {
    if (node.name.toLowerCase().includes(needle) || node.displayName.toLowerCase().includes(needle)) {
      return true;
    }
    if (node.fullyQualifiedName.toLowerCase().includes(needle)) {
      return true;
    }
    return node.columns.some(
      (column) => column.name.toLowerCase().includes(needle) || column.fqn.toLowerCase().includes(needle),
    );
  });
}
