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
 * Validates entity names. Blocks reserved FQN separator characters
 * (::, >, ") and ASCII control characters. Supports Unicode
 * characters.
 *
 * Official ENTITY_NAME_REGEX (openmetadata-ui
 * constants/regex.constants.ts:31, pin a3012259ca), verbatim. This
 * module is the single source of truth: the former per-feature
 * copies (metrics form, alert validation, team logic, access
 * validation, persona form) were converged here by the M-4 fix-up —
 * do not add another copy, import this one.
 */
// eslint-disable-next-line no-control-regex
export const ENTITY_NAME_REGEX = /^((?!::)[^>"\u0000-\u001f])*$/;
