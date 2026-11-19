/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may
 * not use this file except in compliance with the License. You may obtain
 * a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */

/**
 * The official `getCustomizePagePath` equivalent
 * (`U/utils/RouterUtils.ts:850-856`, `ROUTES.CUSTOMIZE_PAGE`
 * `/customize-page/:fqn/:pageFqn`, `U/constants/constants.ts:313`):
 * replaces `:fqn` with the encoded persona FQN and `:pageFqn`
 * verbatim. No mapping, no branching. The encoding is
 * `encodeURIComponent`, exactly the official `getEncodedFqn` default
 * (`U/utils/StringUtils.ts:274-282`, `spaceAsPlus = false`).
 *
 * Production callers are the same two call sites as official
 * (`CustomizeUI.tsx:48` and `HomeLandingPage.tsx:219`): the customize
 * grid (leaf cards) and the home page customize entry. Any other
 * construction of a customize-page URL must go through this function
 * rather than duplicating the template.
 */
const CUSTOMIZE_PAGE_TEMPLATE = '/customize-page/:fqn/:pageFqn';

export function getCustomizePagePath(personaFqn: string, pageFqn: string): string {
  return CUSTOMIZE_PAGE_TEMPLATE.replaceAll(':fqn', encodeURIComponent(personaFqn)).replace(
    ':pageFqn',
    pageFqn,
  );
}
