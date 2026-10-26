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
}

export interface ConversationReply {
  id: string;
  conversationId?: string;
  message: string;
  createdAt?: number;
  author?: EntityRef;
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
}

export interface ResolveTaskRequest {
  resolutionType: TaskResolution;
  comment?: string;
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

export interface CustomPropertyDef {
  name: string;
  displayName?: string;
  description?: string;
  propertyType?: string;
}

export interface MetadataType {
  id?: string;
  name: string;
  displayName?: string;
  description?: string;
  category?: string;
  nameSpace?: string;
  customProperties: CustomPropertyDef[];
}

export type ExtensionValues = Record<string, unknown>;
