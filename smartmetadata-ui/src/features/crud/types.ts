/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import type { RouteLocationRaw } from 'vue-router';

export interface EntityListColumn {
  title: string;
  dataIndex?: string;
  key: string;
  width?: number;
  ellipsis?: boolean;
  sorter?: boolean | ((a: unknown, b: unknown) => number);
}

export interface EntityBreadcrumb {
  label: string;
  to?: RouteLocationRaw;
}

export interface EntityDetailTab {
  key: string;
  label: string;
  testId?: string;
}
