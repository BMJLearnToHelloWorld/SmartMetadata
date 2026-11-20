/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import type { TagRef } from '@/types/api';
import type { AssetTagOption } from '@/types/governance';

/**
 * Port of the pin chart-tag merge (DashboardChartTable.tsx
 * `handleChartTagSelection`): tags of other sources are untouched; within
 * the edited source the selection replaces the previous tags. Tags that
 * stay selected keep their server shape; newly selected FQNs are built
 * as Manual/Confirmed labels from the tag options.
 */
export function mergeChartTags(
  current: TagRef[],
  source: 'Classification' | 'Glossary',
  selectedFqns: string[],
  options: AssetTagOption[],
): TagRef[] {
  const otherSource = current.filter((tag) => tag.source !== source);
  const previous = current.filter((tag) => tag.source === source && selectedFqns.includes(tag.tagFQN));
  const previousFqns = new Set(previous.map((tag) => tag.tagFQN));
  const added: TagRef[] = selectedFqns
    .filter((fqn) => !previousFqns.has(fqn))
    .map((fqn) => {
      const option = options.find((item) => item.tagFQN === fqn && item.source === source);
      return {
        tagFQN: fqn,
        name: option?.name ?? fqn.split('.').pop() ?? fqn,
        source,
        labelType: 'Manual',
        state: 'Confirmed',
      } satisfies TagRef;
    });
  return [...otherSource, ...previous, ...added];
}
