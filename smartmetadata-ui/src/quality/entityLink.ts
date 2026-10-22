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
 * Build a MessageParser entity link. Swagger examples still show
 * `<E#/{type}/{fqn}>`; the server parser only accepts `<#E::type::fqn>`.
 * ADR:2026-10-22-dq-entity-links-use-message-parser-format
 */
export function toEntityLink(entityType: string, fqn: string, column?: string): string {
  const type = entityType.trim();
  const name = fqn.trim();
  if (!type || !name) {
    throw new Error('Entity link requires entity type and FQN');
  }
  if (column?.trim()) {
    return `<#E::${type}::${name}::columns::${column.trim()}>`;
  }
  return `<#E::${type}::${name}>`;
}

export function parseEntityLink(link: string): { entityType: string; fqn: string; column?: string } | null {
  const match = /^<#E::([^:]+)::([^>]+?)(?:::columns::([^>]+))?>$/.exec(link.trim());
  if (!match) {
    return null;
  }
  return {
    entityType: match[1],
    fqn: match[2],
    column: match[3] || undefined,
  };
}
