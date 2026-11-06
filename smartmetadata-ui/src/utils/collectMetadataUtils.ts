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
 * Official CollectMetadataForm.utils (pin a3012259ca), ported 1:1.
 * Owners and reviewers are asset fields too: a stage that asks one of them
 * while also requiring it may find it empty, and the task then goes to the
 * admins until it is set.
 */
export function asksARequiredGroup(
  assignees: string,
  fields: { field: string }[] = [],
): boolean {
  return (
    assignees !== 'candidates' &&
    fields.some(({ field }) => field === assignees)
  );
}
