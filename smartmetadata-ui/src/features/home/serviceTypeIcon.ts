/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { navIcon } from '@/layouts/navIcons';
import type { Component } from 'vue';

const DASHBOARD = /superset|tableau|looker|metabase|powerbi|quicksight|mode|redash/;
const PIPELINE = /airflow|dagster|prefect|glue|pipeline|nifi|fivetran|dbt/;
const STORAGE = /s3|gcs|azure|storage|minio|adls/;
const MESSAGING = /kafka|kinesis|pubsub|pulsar|redpanda|rabbit/;

/**
 * Semantic resolver only: it picks a key, and the glyph itself comes from
 * the single icon map (layouts/navIcons) like every other icon, so the home
 * buckets never import Ant icons directly (R-19 convergence).
 */
export function serviceTypeIcon(serviceType: string): Component {
  const key = serviceType.trim().toLowerCase();
  if (DASHBOARD.test(key)) {
    return navIcon('service-dashboard')!;
  }
  if (PIPELINE.test(key)) {
    return navIcon('service-pipeline')!;
  }
  if (STORAGE.test(key)) {
    return navIcon('service-storage')!;
  }
  if (MESSAGING.test(key)) {
    return navIcon('service-messaging')!;
  }
  if (key) {
    return navIcon('service-database')!;
  }
  return navIcon('service-default')!;
}
