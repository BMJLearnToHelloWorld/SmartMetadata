/**
 * Copyright 2026 SmartMetadata authors.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
/**
 * Port of official `AddIngestion.component.tsx:168-186` (owners seeding):
 * prefer what is saved, then the service's owners, then the current user.
 * Edit has to fall back too, not just create: pipelines created through
 * the API carry no owners, and a mandatory field starting empty would make
 * those impossible to save at all.
 */
import type { EntityRef } from '@/types/api';

export function effectiveOwnersForPipeline({
  savedOwners,
  serviceOwners,
  currentUser,
}: {
  savedOwners?: EntityRef[];
  serviceOwners?: EntityRef[];
  currentUser?: { id?: string; name?: string; displayName?: string } | null;
}): EntityRef[] {
  if (savedOwners && savedOwners.length > 0) {
    return savedOwners;
  }
  if (serviceOwners && serviceOwners.length > 0) {
    return serviceOwners;
  }
  return currentUser?.id
    ? [
        {
          id: currentUser.id,
          type: 'user',
          name: currentUser.name ?? currentUser.displayName ?? currentUser.id,
          displayName: currentUser.displayName,
          fullyQualifiedName: currentUser.name,
        },
      ]
    : [];
}

/** Settings pipelines (Data Insight / Search Index) have no parent service to inherit owners from. */
export function isSettingsPipelineType(pipelineType: string): boolean {
  return pipelineType === 'dataInsight' || pipelineType === 'elasticSearchReindex';
}
