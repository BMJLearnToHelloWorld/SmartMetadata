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
  ApartmentOutlined,
  AppstoreOutlined,
  CloudOutlined,
  CommentOutlined,
  DatabaseOutlined,
  PieChartOutlined,
} from '@ant-design/icons-vue';
import type { Component } from 'vue';

const DASHBOARD = /superset|tableau|looker|metabase|powerbi|quicksight|mode|redash/;
const PIPELINE = /airflow|dagster|prefect|glue|pipeline|nifi|fivetran|dbt/;
const STORAGE = /s3|gcs|azure|storage|minio|adls/;
const MESSAGING = /kafka|kinesis|pubsub|pulsar|redpanda|rabbit/;

export function serviceTypeIcon(serviceType: string): Component {
  const key = serviceType.trim().toLowerCase();
  if (DASHBOARD.test(key)) {
    return PieChartOutlined;
  }
  if (PIPELINE.test(key)) {
    return ApartmentOutlined;
  }
  if (STORAGE.test(key)) {
    return CloudOutlined;
  }
  if (MESSAGING.test(key)) {
    return CommentOutlined;
  }
  if (key) {
    return DatabaseOutlined;
  }
  return AppstoreOutlined;
}
