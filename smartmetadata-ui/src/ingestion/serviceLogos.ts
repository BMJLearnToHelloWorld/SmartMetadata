/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { SERVICE_TYPES_BY_KIND } from '@/ingestion/connections';
import type { ServiceKind } from '@/types/ingestion';

/**
 * Service logo resolution (01-services.md §2.2): pin
 * `getServiceTypeLogo` (utils/ServiceUtilClassBase.ts:338-370) with
 * `getServiceIcon` (utils/ServiceIconUtils.ts:302-307) and
 * `getDefaultLogoForServiceType` (:312-332).
 *
 * Resolution order, copied verbatim:
 * 1. the source's own `style.iconURL`;
 * 2. the parent service's `style.iconURL` (`service.style.iconURL`);
 * 3. with no serviceType, the entity-specific icon (services pages
 *    always carry a serviceType, so this lands on the default icon);
 * 4. the icon table, keyed by the normalized type
 *    (lowercase, `_`/`-` stripped);
 * 5. the category default icon (first matching category wins, in the
 *    pin order messaging/dashboard/pipeline/database/mlmodel/storage/
 *    search/security/drive/api);
 * 6. `defaultservice`.
 *
 * Icon resources: pin's table maps to connector brand artwork, which
 * the product does not ship (shell §13 icon resources are the
 * dependency). The type-level table below is therefore empty today —
 * the lookup step still runs in order, and every type falls through
 * to its category default, rendered through the existing `service-*`
 * navIcon glyphs. No brand artwork is invented and no slot is left
 * empty. When brand assets land, only SERVICE_TYPE_ICON_KEYS and the
 * category-default adapter change; the resolution order does not.
 */

export type ServiceLogoRef =
  | { kind: 'url'; url: string }
  | { kind: 'icon'; iconKey: string };

export interface ServiceLogoSource {
  serviceType?: string;
  entityType?: string;
  style?: { iconURL?: string };
  service?: { style?: { iconURL?: string } };
}

/** Pin getServiceIcon key normalization: lowercase, strip `_`/`-`. */
export function normalizeServiceIconKey(iconKey: string): string {
  return iconKey.toLowerCase().replaceAll(/[_-]/g, '');
}

/**
 * Pin SERVICE_ICON_LOADERS, product side: normalized type key ->
 * navIcon key. Empty until brand assets exist (see the module doc);
 * the lookup itself is part of the resolution order.
 */
export const SERVICE_TYPE_ICON_KEYS: Readonly<Record<string, string>> = {};

/**
 * Pin category-default icon names -> the closest existing navIcon
 * glyphs. Categories without a dedicated glyph use `service-default`
 * (the `defaultservice` rendering).
 */
const CATEGORY_DEFAULT_ICON_KEYS: Readonly<Record<string, string>> = {
  topicdefault: 'service-messaging',
  dashboarddefault: 'service-dashboard',
  pipelinedefault: 'service-pipeline',
  databasedefault: 'service-database',
  mlmodeldefault: 'service-default',
  storagedefault: 'service-storage',
  searchdefault: 'service-default',
  securitydefault: 'service-default',
  drivedefault: 'service-default',
  restservice: 'service-default',
  defaultservice: 'service-default',
};

/** Pin getDefaultLogoForServiceType category order. */
const CATEGORY_DEFAULT_ORDER: ReadonlyArray<{ kind: ServiceKind; iconName: string }> = [
  { kind: 'messaging', iconName: 'topicdefault' },
  { kind: 'dashboard', iconName: 'dashboarddefault' },
  { kind: 'pipeline', iconName: 'pipelinedefault' },
  { kind: 'database', iconName: 'databasedefault' },
  { kind: 'mlmodel', iconName: 'mlmodeldefault' },
  { kind: 'storage', iconName: 'storagedefault' },
  { kind: 'search', iconName: 'searchdefault' },
  { kind: 'security', iconName: 'securitydefault' },
  { kind: 'drive', iconName: 'drivedefault' },
  { kind: 'api', iconName: 'restservice' },
];

function defaultLogoForServiceType(type: string): ServiceLogoRef {
  const match = CATEGORY_DEFAULT_ORDER.find(({ kind }) =>
    SERVICE_TYPES_BY_KIND[kind].includes(type),
  );
  const iconName = match ? match.iconName : 'defaultservice';
  return { kind: 'icon', iconKey: CATEGORY_DEFAULT_ICON_KEYS[iconName] ?? 'service-default' };
}

function serviceLogoForType(type: string): ServiceLogoRef {
  const iconKey = SERVICE_TYPE_ICON_KEYS[normalizeServiceIconKey(type)];
  if (iconKey) {
    return { kind: 'icon', iconKey };
  }
  return defaultLogoForServiceType(type);
}

/** Pin getServiceTypeLogo, minus the KNOWLEDGE_PAGE branch (Explore-only). */
export function getServiceTypeLogo(source?: ServiceLogoSource): ServiceLogoRef {
  const ownIcon = source?.style?.iconURL;
  if (ownIcon) {
    return { kind: 'url', url: ownIcon };
  }
  const serviceIcon = source?.service?.style?.iconURL;
  if (serviceIcon) {
    return { kind: 'url', url: serviceIcon };
  }
  const type = source?.serviceType ?? '';
  if (!type) {
    return { kind: 'icon', iconKey: 'service-default' };
  }
  return serviceLogoForType(type);
}

/** Category-default icon for a kind, for empty states and headers. */
export function getCategoryDefaultLogo(kind: ServiceKind): ServiceLogoRef {
  const match = CATEGORY_DEFAULT_ORDER.find((entry) => entry.kind === kind);
  const iconName = match ? match.iconName : 'defaultservice';
  return { kind: 'icon', iconKey: CATEGORY_DEFAULT_ICON_KEYS[iconName] ?? 'service-default' };
}
