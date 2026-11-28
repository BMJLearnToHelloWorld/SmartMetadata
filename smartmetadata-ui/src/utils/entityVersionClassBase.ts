/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import type { Component } from 'vue';
import type { ParentEntityVersionProps } from '@/components/entityVersion/entityVersionProps';
import TableVersion from '@/views/entityVersion/TableVersion.vue';
import TopicVersion from '@/views/entityVersion/TopicVersion.vue';
import DashboardVersion from '@/views/entityVersion/DashboardVersion.vue';
import PipelineVersion from '@/views/entityVersion/PipelineVersion.vue';
import MlModelVersion from '@/views/entityVersion/MlModelVersion.vue';
import ContainerVersion from '@/views/entityVersion/ContainerVersion.vue';
import SearchIndexVersion from '@/views/entityVersion/SearchIndexVersion.vue';
import DataModelVersion from '@/views/entityVersion/DataModelVersion.vue';
import StoredProcedureVersion from '@/views/entityVersion/StoredProcedureVersion.vue';
import APIEndpointVersion from '@/views/entityVersion/APIEndpointVersion.vue';
import MetricVersion from '@/views/entityVersion/MetricVersion.vue';
import ChartVersion from '@/views/entityVersion/ChartVersion.vue';
import DirectoryVersion from '@/views/entityVersion/DirectoryVersion.vue';
import FileVersion from '@/views/entityVersion/FileVersion.vue';
import SpreadsheetVersion from '@/views/entityVersion/SpreadsheetVersion.vue';
import WorksheetVersion from '@/views/entityVersion/WorksheetVersion.vue';
import DatabaseVersionPage from '@/views/entityVersion/DatabaseVersionPage.vue';
import DatabaseSchemaVersionPage from '@/views/entityVersion/DatabaseSchemaVersionPage.vue';
import APICollectionVersionPage from '@/views/entityVersion/APICollectionVersionPage.vue';
import DataProductVersionMount from '@/views/entityVersion/DataProductVersionMount.vue';
import AssetDetailView from '@/views/AssetDetailView.vue';

class EntityVersionClassBase {
  protected componentMap: Record<string, Component> = {
    table: TableVersion,
    topic: TopicVersion,
    dashboard: DashboardVersion,
    pipeline: PipelineVersion,
    mlmodel: MlModelVersion,
    container: ContainerVersion,
    searchIndex: SearchIndexVersion,
    dashboardDataModel: DataModelVersion,
    storedProcedure: StoredProcedureVersion,
    apiEndpoint: APIEndpointVersion,
    metric: MetricVersion,
    chart: ChartVersion,
    directory: DirectoryVersion,
    file: FileVersion,
    spreadsheet: SpreadsheetVersion,
    worksheet: WorksheetVersion,
    database: DatabaseVersionPage,
    databaseSchema: DatabaseSchemaVersionPage,
    dataProduct: DataProductVersionMount,
    apiCollection: APICollectionVersionPage,
  };

  public getEntityVersionComponent(entityType: string): Component | null {
    return this.componentMap[entityType] ?? null;
  }

  public getEntityDetailComponent(_entityType: string): Component {
    return AssetDetailView;
  }
}

const entityVersionClassBase = new EntityVersionClassBase();

export { EntityVersionClassBase };
export default entityVersionClassBase;
export type { ParentEntityVersionProps };
