/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import type { WorkflowDefinitionFull } from '@/types/governance';

/**
 * Official WorkflowClassBase (pin a3012259ca), ported 1:1 — except
 * allowCreateWorkflow (see below). The OSS build ships the restrictive
 * defaults and NO subclass exists in the OSS repo, so this is the single
 * source of builder capability flags. The Collate-only surface (editor link,
 * list tabs, card footer, page section, workflow path) returns null / [] /
 * undefined in OSS — ported as such.
 */
export interface WorkflowCapabilities {
  allowCreateWorkflow: boolean;
  allowDeleteWorkflow: boolean;
  allowStructuralGraphEdits: boolean;
  showWorkflowNodePalette: boolean;
  allowFullStartNodeConfiguration: boolean;
  allowStartNodeFilterScheduleAndBatchEdit: boolean;
  allowScheduledTrigger: boolean;
  allowViewModeDrag: boolean;
}

export interface WorkflowEditorLink {
  path: string;
  labelKey: string;
}

export interface WorkflowsPageTab {
  id: string;
  labelKey: string;
  includes?: (workflow: WorkflowDefinitionFull) => boolean;
}

/**
 * The capability set. Every flag matches WorkflowClassBase.getCapabilities
 * (pin a3012259ca) EXCEPT allowCreateWorkflow, which is true by product
 * decision (Bai 2026-11-07, option B): the product keeps the list-page
 * create button and completes the create payload per official
 * handleModalSubmit, instead of hiding creation as OSS does. Official OSS
 * has this flag false (creation is Collate-only).
 */
export function getWorkflowCapabilities(
  _workflow?: WorkflowDefinitionFull | null,
): WorkflowCapabilities {
  return {
    allowCreateWorkflow: true,
    allowDeleteWorkflow: false,
    allowStructuralGraphEdits: false,
    showWorkflowNodePalette: false,
    allowFullStartNodeConfiguration: false,
    allowStartNodeFilterScheduleAndBatchEdit: true,
    allowScheduledTrigger: false,
    allowViewModeDrag: true,
  };
}

/** Content shown above the workflow list; OpenMetadata has none. */
export function getWorkflowsPageSection(): null {
  return null;
}

/** Content shown at the bottom of each workflow's card; OpenMetadata has none. */
export function getWorkflowCardFooter(): null {
  return null;
}

/** Tabs that narrow the workflow list; OpenMetadata lists every workflow untabbed. */
export function getWorkflowsPageTabs(): WorkflowsPageTab[] {
  return [];
}

/** The editor that owns this workflow's shape, if the builder is not that editor. */
export function getWorkflowEditorLink(
  _workflow?: WorkflowDefinitionFull | null,
): WorkflowEditorLink | undefined {
  return undefined;
}

/** Where opening a workflow leads; undefined keeps the workflow details page. */
export function getWorkflowPath(
  _workflow: WorkflowDefinitionFull,
): string | undefined {
  return undefined;
}
