/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import type { AdminUser } from '@/types/admin';
import type { EntityRef } from '@/types/api';
import type {
  CreateDataProductRequest,
  CreateDomainRequest,
  EntityStyle,
} from '@/types/governance';

/** The marketplace create-modal fields beyond name/description/displayName. */
export interface MarketplaceCreateFields {
  ownerNames: string[];
  expertNames: string[];
  iconURL: string;
  color: string;
}

/**
 * Resolve picked owner login names to entity references. Official create
 * owners are references; the picker is backed by the user list, so a
 * picked name normally resolves to id + displayName, and an unmatched
 * name still yields a type-only reference rather than dropping the owner.
 */
export function buildOwnerRefs(ownerNames: string[], users: AdminUser[]): EntityRef[] {
  return ownerNames.map((name) => {
    const user = users.find((candidate) => candidate.name === name);
    return {
      id: user?.id,
      name,
      type: 'user',
      displayName: user?.displayName || undefined,
    };
  });
}

/** Style is sent only when at least one of icon/color is filled in. */
export function buildEntityStyle(iconURL: string, color: string): EntityStyle | undefined {
  const icon = iconURL.trim();
  const hex = color.trim();
  if (!icon && !hex) {
    return undefined;
  }
  return { iconURL: icon || undefined, color: hex || undefined };
}

function optionalList<T>(values: T[]): T[] | undefined {
  return values.length > 0 ? values : undefined;
}

export function buildDataProductCreateBody(
  base: Omit<CreateDataProductRequest, 'owners' | 'experts' | 'style'>,
  fields: MarketplaceCreateFields,
  users: AdminUser[],
): CreateDataProductRequest {
  return {
    ...base,
    owners: optionalList(buildOwnerRefs(fields.ownerNames, users)),
    experts: optionalList(fields.expertNames.map((name) => name.trim()).filter(Boolean)),
    style: buildEntityStyle(fields.iconURL, fields.color),
  };
}

export function buildDomainCreateBody(
  base: Omit<CreateDomainRequest, 'owners' | 'experts' | 'style'>,
  fields: MarketplaceCreateFields,
  users: AdminUser[],
): CreateDomainRequest {
  return {
    ...base,
    owners: optionalList(buildOwnerRefs(fields.ownerNames, users)),
    experts: optionalList(fields.expertNames.map((name) => name.trim()).filter(Boolean)),
    style: buildEntityStyle(fields.iconURL, fields.color),
  };
}
