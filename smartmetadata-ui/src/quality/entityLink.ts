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

/**
 * Parse a MessageParser entity link back into its parts. Segment-based,
 * mirroring pin `utils/EntityLink.ts split()`: the link is `type`, `fqn`,
 * then an optional `columns` field segment. A feed's `about` may carry a
 * field the grammar does not list (for example `entityStatus`); pin
 * returns the split of what did parse, so an unlisted `::field::value`
 * tail is ignored — never absorbed into the FQN, as the old regex did
 * (`fqn::entityStatus::active` came back as the FQN, R-L3).
 */
export function parseEntityLink(link: string): { entityType: string; fqn: string; column?: string } | null {
  const trimmed = link.trim();
  if (!trimmed.startsWith('<#E::') || !trimmed.endsWith('>')) {
    return null;
  }
  // '<#E::' is five characters; the body runs to the closing '>'.
  const parts = trimmed.slice(5, -1).split('::');
  const [entityType, fqn] = parts;
  if (!entityType || !fqn) {
    return null;
  }
  const result: { entityType: string; fqn: string; column?: string } = { entityType, fqn };
  if (parts[2] === 'columns' && parts[3]) {
    result.column = parts[3];
  }
  return result;
}
