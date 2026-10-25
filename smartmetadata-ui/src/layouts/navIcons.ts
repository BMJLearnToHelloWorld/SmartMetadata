/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import {
  AlertOutlined,
  ApartmentOutlined,
  AppstoreOutlined,
  BankOutlined,
  CloudSyncOutlined,
  CommentOutlined,
  SearchOutlined,
  SettingOutlined,
} from '@ant-design/icons-vue';
import type { Component } from 'vue';

const ICONS: Record<string, Component> = {
  search: SearchOutlined,
  'lineage-home': ApartmentOutlined,
  observability: AlertOutlined,
  governance: BankOutlined,
  ingestion: CloudSyncOutlined,
  collaboration: CommentOutlined,
  admin: SettingOutlined,
  'quality-test-definitions': AppstoreOutlined,
  'quality-test-cases': AppstoreOutlined,
  'quality-test-suites': AppstoreOutlined,
  'observability-incidents': AlertOutlined,
  'observability-alerts': AlertOutlined,
};

export function navIcon(key: string): Component | undefined {
  return ICONS[key];
}
