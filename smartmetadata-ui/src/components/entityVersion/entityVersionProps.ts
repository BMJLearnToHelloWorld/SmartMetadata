/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import type { EntityVersion } from '@/api/entities';
import type { OperationPermissions } from '@/api/permissions';
import type { AssetDetail, EntityRef } from '@/types/api';

export interface ParentEntityVersionProps {
  backHandler: () => void;
  currentVersionData: AssetDetail;
  dataProducts?: EntityRef[];
  deleted?: boolean;
  domains?: EntityRef[];
  entityPermissions: OperationPermissions;
  isVersionLoading: boolean;
  owners?: EntityRef[];
  tab?: string;
  version: string;
  versionHandler: (version: string) => void;
  versionList: EntityVersion[];
}
