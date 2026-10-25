/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * you may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */

export interface LineageTarget {
  entityType: string;
  fqn: string;
}

export function lineageTargetFromHit(hit: {
  entityType?: string;
  fullyQualifiedName?: string;
}): LineageTarget | null {
  const entityType = hit.entityType?.trim() ?? '';
  const fqn = hit.fullyQualifiedName?.trim() ?? '';
  if (!entityType || !fqn) {
    return null;
  }
  return { entityType, fqn };
}

export function lineageTargetFromTypedFqn(entityType: string, fqn: string): LineageTarget | null {
  const type = entityType.trim();
  const name = fqn.trim();
  if (!type || !name) {
    return null;
  }
  return { entityType: type, fqn: name };
}
