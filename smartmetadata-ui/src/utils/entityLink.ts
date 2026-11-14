/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */

/**
 * Entity feed link builder, ported from official
 * utils/EntityPureUtils.ts `getEntityFeedLink` (openmetadata-ui, pin
 * a3012259ca). The AutoPilot trigger payload carries the target service
 * as an entity link (`<#E::databaseService::fqn>`); the workflow
 * instance history query filters on the same link.
 */
export const ENTITY_LINK_SEPARATOR = '::';

export function getEntityFeedLink(type?: string, fqn?: string, field?: string): string {
  if (type === undefined || fqn === undefined) {
    return '';
  }
  return `<#E${ENTITY_LINK_SEPARATOR}${type}${ENTITY_LINK_SEPARATOR}${fqn}${
    field ? `${ENTITY_LINK_SEPARATOR}${field}` : ''
  }>`;
}
