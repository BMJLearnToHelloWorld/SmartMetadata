/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import type { EntityRef } from './api';

export interface ActivityReaction {
  reactionType: string;
  user?: EntityRef;
}

export interface ActivityEvent {
  id: string;
  eventType: string;
  timestamp?: number;
  summary?: string;
  fieldName?: string;
  oldValue?: string;
  newValue?: string;
  about?: string;
  entity?: EntityRef;
  actor?: EntityRef;
  reactions?: ActivityReaction[];
}

export interface ConversationReply {
  id: string;
  conversationId?: string;
  message: string;
  createdAt?: number;
  author?: EntityRef;
  reactions?: ActivityReaction[];
}

export interface Conversation {
  id: string;
  source?: string;
  about: string;
  message?: string;
  createdAt?: number;
  updatedAt?: number;
  resolved?: boolean;
  replyCount?: number;
  entityRef?: EntityRef;
  createdBy?: EntityRef;
  replies: ConversationReply[];
  reactions?: ActivityReaction[];
}

export interface CreateConversationRequest {
  message: string;
  about: string;
}

export interface CreatePostRequest {
  message: string;
}

export const TASK_CATEGORIES = [
  'Approval',
  'DataAccess',
  'MetadataUpdate',
  'Incident',
  'Review',
  'Custom',
] as const;

export const CREATABLE_TASK_TYPES = [
  'RequestApproval',
  'DataAccessRequest',
  'DescriptionUpdate',
  'TagUpdate',
  'OwnershipUpdate',
  'TierUpdate',
  'DomainUpdate',
  'CustomTask',
] as const;

export const TASK_RESOLUTIONS = ['Approved', 'Rejected', 'Completed', 'Cancelled'] as const;

export type TaskCategory = (typeof TASK_CATEGORIES)[number];
export type CreatableTaskType = (typeof CREATABLE_TASK_TYPES)[number];
export type TaskResolution = (typeof TASK_RESOLUTIONS)[number];

export interface TaskComment {
  id?: string;
  message: string;
  createdAt?: number;
  author?: EntityRef;
}

/**
 * Data access request payload, mirroring openmetadata-spec
 * type/dataAccessRequestPayload.json field for field: accessType and
 * reason are required; columns only scopes a ColumnLevel request;
 * manualGrantReason is system-generated and never sent by the client.
 */
export const DATA_ACCESS_TYPES = ['FullAccess', 'ColumnLevel', 'Masked'] as const;
export type DataAccessType = (typeof DATA_ACCESS_TYPES)[number];

export const DATA_ACCESS_PERMISSIONS = ['Read', 'Write', 'Admin'] as const;
export type DataAccessPermission = (typeof DATA_ACCESS_PERMISSIONS)[number];

export interface DataAccessRequestPayload {
  accessType: string;
  requestedAccess?: string;
  columns?: string[];
  duration?: string;
  reason?: string;
  assets?: EntityRef[];
  ticketId?: string;
  expirationDate?: number;
  manualGrantReason?: string;
}

/**
 * Generic suggestion payload, mirroring openmetadata-ui
 * utils/TaskPayloadUtils.ts getNormalizedTaskPayload inputs: the raw
 * task payload carries either description fields (currentDescription /
 * currentValue, newDescription / suggestedValue) or tag fields
 * (currentTags, tagsToAdd, tagsToRemove, legacy suggestedValue), plus
 * fieldPath / field for column-scoped tasks.
 */
export interface TaskSuggestionPayload {
  fieldPath?: string;
  currentDescription?: string;
  newDescription?: string;
  currentTags?: string[];
  tagsToAdd?: string[];
  tagsToRemove?: string[];
  suggestedValue?: string;
}

/**
 * Workflow transition, mirroring openmetadata-spec entity/tasks/task.json
 * TaskAvailableTransition: id + label are required; resolutionType is
 * present only on terminal transitions (non-terminal ack/assign must
 * NOT default to Approved — the server treats a non-null resolutionType
 * as a terminal resolution, per TaskTabNew.getTransitionResolutionType).
 */
export interface TaskAvailableTransition {
  id: string;
  label: string;
  formRef?: string;
  requiresComment?: boolean;
  resolutionType?: string;
  targetStageId: string;
  targetTaskStatus: string;
}

export interface CollaborationTask {
  id: string;
  name?: string;
  displayName?: string;
  description?: string;
  category?: string;
  type?: string;
  status?: string;
  priority?: string;
  about?: EntityRef;
  assignees: EntityRef[];
  createdBy?: EntityRef;
  comments: TaskComment[];
  payload?: DataAccessRequestPayload;
  suggestionPayload?: TaskSuggestionPayload;
  availableTransitions?: TaskAvailableTransition[];
}

export interface CreateTaskRequest {
  category: TaskCategory;
  type: CreatableTaskType;
  name?: string;
  displayName?: string;
  description?: string;
  about?: string;
  assignees?: string[];
  priority?: string;
  payload?: DataAccessRequestPayload;
}

/**
 * Official ResolveTask (generated/api/tasks/resolveTask.ts): resolutionType
 * + comment + newValue (update tasks) + payload (schema-driven forms) +
 * transitionId (workflow tasks). resolutionType is optional here because
 * a non-terminal workflow transition resolves with transitionId alone.
 */
export interface ResolveTaskRequest {
  resolutionType?: TaskResolution;
  comment?: string;
  newValue?: string;
  payload?: Record<string, unknown>;
  transitionId?: string;
}

export const ANNOUNCEMENT_TYPES = ['Critical', 'Notice', 'Warning', 'Deprecation', 'Custom'] as const;

export type AnnouncementType = (typeof ANNOUNCEMENT_TYPES)[number];

export interface Announcement {
  id: string;
  name?: string;
  displayName?: string;
  description?: string;
  type?: string;
  entityLink?: string;
  startTime?: number;
  endTime?: number;
  announcementStatus?: string;
}

export interface CreateAnnouncementRequest {
  description: string;
  startTime: number;
  endTime: number;
  name?: string;
  displayName?: string;
  type?: AnnouncementType;
  entityLink?: string;
}

/**
 * Read-side shape of CustomProperty.customPropertyConfig (official
 * generated/type/customProperty.ts). Stage 2 (Wave 1 W1-2) only parses it so
 * the Configuration column can render server-side config; the write-side
 * form fields belong to stage 3. ADR:2026-11-07-custom-properties-s12.
 */
export interface CustomPropertyConfig {
  config?: string | string[] | { values?: string[]; columns?: string[]; multiSelect?: boolean };
}

export interface CustomPropertyDef {
  name: string;
  displayName?: string;
  description?: string;
  propertyType?: string;
  customPropertyConfig?: CustomPropertyConfig;
}

export interface MetadataType {
  id?: string;
  name: string;
  displayName?: string;
  description?: string;
  category?: string;
  nameSpace?: string;
  /** JSON-encoded JSON Schema string, as returned by fields=schema. */
  schema?: string;
  customProperties: CustomPropertyDef[];
}

/** Apache CustomProperty body for PUT /v1/metadata/types/{id}. */
export interface CreateCustomPropertyRequest {
  name: string;
  description: string;
  propertyType: { id: string; type: string; name: string };
  displayName?: string;
}

export type ExtensionValues = Record<string, unknown>;

