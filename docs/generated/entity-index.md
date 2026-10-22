<!-- GENERATED FILE — DO NOT EDIT. Run `make generate-entity-index`. -->

# Entity Index

One row per first-class entity schema, with the artifacts codegen and routing
derive from it. **Generated** from the JSON schemas and JAX-RS resources — do not
hand-edit; run `make generate-entity-index` (or `make generate-reference-docs`).

- **Entity** = a schema under `openmetadata-spec/src/main/resources/json/schema/entity/**`
  that declares a `javaType` and a top-level `id` property.
- **Java** is read from the schema's `javaType`. **Python** / **TypeScript** columns show `—`
  when the generated file is absent (official CCL Pydantic/React trees were purged).
- **REST resource** is joined from `extends EntityResource<Entity, …>`; `—` means no dedicated
  `EntityResource` was found (the entity may be exposed via a shared or non-`EntityResource` route).

**91 entities** · 66 with a dedicated `EntityResource`.

## entity/(root)

| Entity | Schema | Java | Python | TypeScript | REST resource |
|---|---|---|---|---|---|
| Bot | `openmetadata-spec/src/main/resources/json/schema/entity/bot.json` | `org.openmetadata.schema.entity.Bot` | — | — | `org.openmetadata.service.resources.bots.BotResource` |
| Type | `openmetadata-spec/src/main/resources/json/schema/entity/type.json` | `org.openmetadata.schema.entity.Type` | — | — | `org.openmetadata.service.resources.types.TypeResource` |

## entity/activity

| Entity | Schema | Java | Python | TypeScript | REST resource |
|---|---|---|---|---|---|
| ActivityEvent | `openmetadata-spec/src/main/resources/json/schema/entity/activity/activityEvent.json` | `org.openmetadata.schema.entity.activity.ActivityEvent` | — | — | — |
| ActivityStreamConfig | `openmetadata-spec/src/main/resources/json/schema/entity/activity/activityStreamConfig.json` | `org.openmetadata.schema.entity.activity.ActivityStreamConfig` | — | — | — |

## entity/ai

| Entity | Schema | Java | Python | TypeScript | REST resource |
|---|---|---|---|---|---|
| AIApplication | `openmetadata-spec/src/main/resources/json/schema/entity/ai/aiApplication.json` | `org.openmetadata.schema.entity.ai.AIApplication` | — | — | `org.openmetadata.service.resources.ai.AIApplicationResource` |
| AIFrameworkControl | `openmetadata-spec/src/main/resources/json/schema/entity/ai/aiFrameworkControl.json` | `org.openmetadata.schema.entity.ai.AIFrameworkControl` | — | — | `org.openmetadata.service.resources.ai.AIFrameworkControlResource` |
| AIGovernanceFramework | `openmetadata-spec/src/main/resources/json/schema/entity/ai/aiGovernanceFramework.json` | `org.openmetadata.schema.entity.ai.AIGovernanceFramework` | — | — | `org.openmetadata.service.resources.ai.AIGovernanceFrameworkResource` |
| AIGovernancePolicy | `openmetadata-spec/src/main/resources/json/schema/entity/ai/aiGovernancePolicy.json` | `org.openmetadata.schema.entity.ai.AIGovernancePolicy` | — | — | `org.openmetadata.service.resources.ai.AIGovernancePolicyResource` |
| AgentExecution | `openmetadata-spec/src/main/resources/json/schema/entity/ai/agentExecution.json` | `org.openmetadata.schema.entity.ai.AgentExecution` | — | — | — |
| AuditReport | `openmetadata-spec/src/main/resources/json/schema/entity/ai/auditReport.json` | `org.openmetadata.schema.entity.ai.AuditReport` | — | — | `org.openmetadata.service.resources.ai.AuditReportResource` |
| LLMModel | `openmetadata-spec/src/main/resources/json/schema/entity/ai/llmModel.json` | `org.openmetadata.schema.entity.ai.LLMModel` | — | — | `org.openmetadata.service.resources.ai.LLMModelResource` |
| McpExecution | `openmetadata-spec/src/main/resources/json/schema/entity/ai/mcpExecution.json` | `org.openmetadata.schema.entity.ai.McpExecution` | — | — | — |
| McpServer | `openmetadata-spec/src/main/resources/json/schema/entity/ai/mcpServer.json` | `org.openmetadata.schema.entity.ai.McpServer` | — | — | `org.openmetadata.service.resources.ai.McpServerResource` |
| PromptTemplate | `openmetadata-spec/src/main/resources/json/schema/entity/ai/promptTemplate.json` | `org.openmetadata.schema.entity.ai.PromptTemplate` | — | — | `org.openmetadata.service.resources.ai.PromptTemplateResource` |

## entity/applications

| Entity | Schema | Java | Python | TypeScript | REST resource |
|---|---|---|---|---|---|
| App | `openmetadata-spec/src/main/resources/json/schema/entity/applications/app.json` | `org.openmetadata.schema.entity.app.App` | — | — | `org.openmetadata.service.resources.apps.AppResource` |
| AppMarketPlaceDefinition | `openmetadata-spec/src/main/resources/json/schema/entity/applications/marketplace/appMarketPlaceDefinition.json` | `org.openmetadata.schema.entity.app.AppMarketPlaceDefinition` | — | — | `org.openmetadata.service.resources.apps.AppMarketPlaceResource` |

## entity/automations

| Entity | Schema | Java | Python | TypeScript | REST resource |
|---|---|---|---|---|---|
| Workflow | `openmetadata-spec/src/main/resources/json/schema/entity/automations/workflow.json` | `org.openmetadata.schema.entity.automations.Workflow` | — | — | `org.openmetadata.service.resources.automations.WorkflowResource` |

## entity/classification

| Entity | Schema | Java | Python | TypeScript | REST resource |
|---|---|---|---|---|---|
| Classification | `openmetadata-spec/src/main/resources/json/schema/entity/classification/classification.json` | `org.openmetadata.schema.entity.classification.Classification` | — | — | `org.openmetadata.service.resources.tags.ClassificationResource` |
| Tag | `openmetadata-spec/src/main/resources/json/schema/entity/classification/tag.json` | `org.openmetadata.schema.entity.classification.Tag` | — | — | `org.openmetadata.service.resources.tags.TagResource` |

## entity/context

| Entity | Schema | Java | Python | TypeScript | REST resource |
|---|---|---|---|---|---|
| ContextMemory | `openmetadata-spec/src/main/resources/json/schema/entity/context/contextMemory.json` | `org.openmetadata.schema.entity.context.ContextMemory` | — | — | `org.openmetadata.service.resources.context.ContextMemoryResource` |

## entity/data

| Entity | Schema | Java | Python | TypeScript | REST resource |
|---|---|---|---|---|---|
| APICollection | `openmetadata-spec/src/main/resources/json/schema/entity/data/apiCollection.json` | `org.openmetadata.schema.entity.data.APICollection` | — | — | `org.openmetadata.service.resources.apis.APICollectionResource` |
| APIEndpoint | `openmetadata-spec/src/main/resources/json/schema/entity/data/apiEndpoint.json` | `org.openmetadata.schema.entity.data.APIEndpoint` | — | — | `org.openmetadata.service.resources.apis.APIEndpointResource` |
| Chart | `openmetadata-spec/src/main/resources/json/schema/entity/data/chart.json` | `org.openmetadata.schema.entity.data.Chart` | — | — | `org.openmetadata.service.resources.charts.ChartResource` |
| Container | `openmetadata-spec/src/main/resources/json/schema/entity/data/container.json` | `org.openmetadata.schema.entity.data.Container` | — | — | `org.openmetadata.service.resources.storages.ContainerResource` |
| ContextFile | `openmetadata-spec/src/main/resources/json/schema/entity/data/contextFile.json` | `org.openmetadata.schema.entity.data.ContextFile` | — | — | `org.openmetadata.service.resources.drive.ContextFileResource` |
| ContextFileContent | `openmetadata-spec/src/main/resources/json/schema/entity/data/contextFileContent.json` | `org.openmetadata.schema.entity.data.ContextFileContent` | — | — | — |
| Dashboard | `openmetadata-spec/src/main/resources/json/schema/entity/data/dashboard.json` | `org.openmetadata.schema.entity.data.Dashboard` | — | — | `org.openmetadata.service.resources.dashboards.DashboardResource` |
| DashboardDataModel | `openmetadata-spec/src/main/resources/json/schema/entity/data/dashboardDataModel.json` | `org.openmetadata.schema.entity.data.DashboardDataModel` | — | — | `org.openmetadata.service.resources.datamodels.DashboardDataModelResource` |
| DataContract | `openmetadata-spec/src/main/resources/json/schema/entity/data/dataContract.json` | `org.openmetadata.schema.entity.data.DataContract` | — | — | `org.openmetadata.service.resources.data.DataContractResource` |
| Database | `openmetadata-spec/src/main/resources/json/schema/entity/data/database.json` | `org.openmetadata.schema.entity.data.Database` | — | — | `org.openmetadata.service.resources.databases.DatabaseResource` |
| DatabaseSchema | `openmetadata-spec/src/main/resources/json/schema/entity/data/databaseSchema.json` | `org.openmetadata.schema.entity.data.DatabaseSchema` | — | — | `org.openmetadata.service.resources.databases.DatabaseSchemaResource` |
| Directory | `openmetadata-spec/src/main/resources/json/schema/entity/data/directory.json` | `org.openmetadata.schema.entity.data.Directory` | — | — | `org.openmetadata.service.resources.drives.DirectoryResource` |
| File | `openmetadata-spec/src/main/resources/json/schema/entity/data/file.json` | `org.openmetadata.schema.entity.data.File` | — | — | `org.openmetadata.service.resources.drives.FileResource` |
| Folder | `openmetadata-spec/src/main/resources/json/schema/entity/data/folder.json` | `org.openmetadata.schema.entity.data.Folder` | — | — | `org.openmetadata.service.resources.drive.FolderResource` |
| Glossary | `openmetadata-spec/src/main/resources/json/schema/entity/data/glossary.json` | `org.openmetadata.schema.entity.data.Glossary` | — | — | `org.openmetadata.service.resources.glossary.GlossaryResource` |
| GlossaryTerm | `openmetadata-spec/src/main/resources/json/schema/entity/data/glossaryTerm.json` | `org.openmetadata.schema.entity.data.GlossaryTerm` | — | — | `org.openmetadata.service.resources.glossary.GlossaryTermResource` |
| Metric | `openmetadata-spec/src/main/resources/json/schema/entity/data/metric.json` | `org.openmetadata.schema.entity.data.Metric` | — | — | `org.openmetadata.service.resources.metrics.MetricResource` |
| MetricGroup | `openmetadata-spec/src/main/resources/json/schema/entity/data/metricGroup.json` | `org.openmetadata.schema.entity.data.MetricGroup` | — | — | `org.openmetadata.service.resources.metrics.MetricGroupResource` |
| MlModel | `openmetadata-spec/src/main/resources/json/schema/entity/data/mlmodel.json` | `org.openmetadata.schema.entity.data.MlModel` | — | — | `org.openmetadata.service.resources.mlmodels.MlModelResource` |
| Ontology | `openmetadata-spec/src/main/resources/json/schema/entity/data/ontology.json` | `org.openmetadata.schema.entity.data.Ontology` | — | — | `org.openmetadata.service.resources.ontology.OntologyResource` |
| OntologyAxiom | `openmetadata-spec/src/main/resources/json/schema/entity/data/ontologyAxiom.json` | `org.openmetadata.schema.entity.data.OntologyAxiom` | — | — | `org.openmetadata.service.resources.ontology.OntologyAxiomResource` |
| OntologyChangeSet | `openmetadata-spec/src/main/resources/json/schema/entity/data/ontologyChangeSet.json` | `org.openmetadata.schema.entity.data.OntologyChangeSet` | — | — | `org.openmetadata.service.resources.ontology.OntologyChangeSetResource` |
| OntologyConcept | `openmetadata-spec/src/main/resources/json/schema/entity/data/ontologyConcept.json` | `org.openmetadata.schema.entity.data.OntologyConcept` | — | — | `org.openmetadata.service.resources.ontology.OntologyConceptResource` |
| OntologyProperty | `openmetadata-spec/src/main/resources/json/schema/entity/data/ontologyProperty.json` | `org.openmetadata.schema.entity.data.OntologyProperty` | — | — | `org.openmetadata.service.resources.ontology.OntologyPropertyResource` |
| OntologyRelease | `openmetadata-spec/src/main/resources/json/schema/entity/data/ontologyRelease.json` | `org.openmetadata.schema.entity.data.OntologyRelease` | — | — | `org.openmetadata.service.resources.ontology.OntologyReleaseResource` |
| Page | `openmetadata-spec/src/main/resources/json/schema/entity/data/page.json` | `org.openmetadata.schema.entity.data.Page` | — | — | `org.openmetadata.service.resources.knowledge.KnowledgePageResource` |
| PageHierarchy | `openmetadata-spec/src/main/resources/json/schema/entity/data/pageHierarchy.json` | `org.openmetadata.schema.entity.data.PageHierarchy` | — | — | — |
| Pipeline | `openmetadata-spec/src/main/resources/json/schema/entity/data/pipeline.json` | `org.openmetadata.schema.entity.data.Pipeline` | — | — | `org.openmetadata.service.resources.pipelines.PipelineResource` |
| Query | `openmetadata-spec/src/main/resources/json/schema/entity/data/query.json` | `org.openmetadata.schema.entity.data.Query` | — | — | `org.openmetadata.service.resources.query.QueryResource` |
| QueryCostRecord | `openmetadata-spec/src/main/resources/json/schema/entity/data/queryCostRecord.json` | `org.openmetadata.schema.entity.data.QueryCostRecord` | — | — | — |
| RelationshipType | `openmetadata-spec/src/main/resources/json/schema/entity/data/relationshipType.json` | `org.openmetadata.schema.entity.data.RelationshipType` | — | — | `org.openmetadata.service.resources.ontology.RelationshipTypeResource` |
| Report | `openmetadata-spec/src/main/resources/json/schema/entity/data/report.json` | `org.openmetadata.schema.entity.data.Report` | — | — | `org.openmetadata.service.resources.reports.ReportResource` |
| SearchIndex | `openmetadata-spec/src/main/resources/json/schema/entity/data/searchIndex.json` | `org.openmetadata.schema.entity.data.SearchIndex` | — | — | `org.openmetadata.service.resources.searchindex.SearchIndexResource` |
| Spreadsheet | `openmetadata-spec/src/main/resources/json/schema/entity/data/spreadsheet.json` | `org.openmetadata.schema.entity.data.Spreadsheet` | — | — | `org.openmetadata.service.resources.drives.SpreadsheetResource` |
| StoredProcedure | `openmetadata-spec/src/main/resources/json/schema/entity/data/storedProcedure.json` | `org.openmetadata.schema.entity.data.StoredProcedure` | — | — | `org.openmetadata.service.resources.databases.StoredProcedureResource` |
| Table | `openmetadata-spec/src/main/resources/json/schema/entity/data/table.json` | `org.openmetadata.schema.entity.data.Table` | — | — | `org.openmetadata.service.resources.databases.TableResource` |
| Topic | `openmetadata-spec/src/main/resources/json/schema/entity/data/topic.json` | `org.openmetadata.schema.entity.data.Topic` | — | — | `org.openmetadata.service.resources.topics.TopicResource` |
| Worksheet | `openmetadata-spec/src/main/resources/json/schema/entity/data/worksheet.json` | `org.openmetadata.schema.entity.data.Worksheet` | — | — | `org.openmetadata.service.resources.drives.WorksheetResource` |

## entity/datacontract

| Entity | Schema | Java | Python | TypeScript | REST resource |
|---|---|---|---|---|---|
| DataContractResult | `openmetadata-spec/src/main/resources/json/schema/entity/datacontract/dataContractResult.json` | `org.openmetadata.schema.entity.datacontract.DataContractResult` | — | — | — |
| ODCSDataContract | `openmetadata-spec/src/main/resources/json/schema/entity/datacontract/odcs/odcsDataContract.json` | `org.openmetadata.schema.entity.datacontract.odcs.ODCSDataContract` | — | — | — |

## entity/docStore

| Entity | Schema | Java | Python | TypeScript | REST resource |
|---|---|---|---|---|---|
| Document | `openmetadata-spec/src/main/resources/json/schema/entity/docStore/document.json` | `org.openmetadata.schema.entities.docStore.Document` | — | — | `org.openmetadata.service.resources.docstore.DocStoreResource` |

## entity/domains

| Entity | Schema | Java | Python | TypeScript | REST resource |
|---|---|---|---|---|---|
| DataProduct | `openmetadata-spec/src/main/resources/json/schema/entity/domains/dataProduct.json` | `org.openmetadata.schema.entity.domains.DataProduct` | — | — | `org.openmetadata.service.resources.domains.DataProductResource` |
| Domain | `openmetadata-spec/src/main/resources/json/schema/entity/domains/domain.json` | `org.openmetadata.schema.entity.domains.Domain` | — | — | `org.openmetadata.service.resources.domains.DomainResource` |

## entity/events

| Entity | Schema | Java | Python | TypeScript | REST resource |
|---|---|---|---|---|---|
| NotificationTemplate | `openmetadata-spec/src/main/resources/json/schema/entity/events/notificationTemplate.json` | `org.openmetadata.schema.entity.events.NotificationTemplate` | — | — | `org.openmetadata.service.resources.events.NotificationTemplateResource` |

## entity/feed

| Entity | Schema | Java | Python | TypeScript | REST resource |
|---|---|---|---|---|---|
| Announcement | `openmetadata-spec/src/main/resources/json/schema/entity/feed/announcement.json` | `org.openmetadata.schema.entity.feed.Announcement` | — | — | `org.openmetadata.service.resources.feeds.AnnouncementResource` |
| Conversation | `openmetadata-spec/src/main/resources/json/schema/entity/feed/conversation.json` | `org.openmetadata.schema.entity.feed.Conversation` | — | — | — |
| ConversationReply | `openmetadata-spec/src/main/resources/json/schema/entity/feed/conversationReply.json` | `org.openmetadata.schema.entity.feed.ConversationReply` | — | — | — |
| TaskFormSchema | `openmetadata-spec/src/main/resources/json/schema/entity/feed/taskFormSchema.json` | `org.openmetadata.schema.entity.feed.TaskFormSchema` | — | — | `org.openmetadata.service.resources.feeds.TaskFormSchemaResource` |

## entity/learning

| Entity | Schema | Java | Python | TypeScript | REST resource |
|---|---|---|---|---|---|
| LearningResource | `openmetadata-spec/src/main/resources/json/schema/entity/learning/learningResource.json` | `org.openmetadata.schema.entity.learning.LearningResource` | — | — | `org.openmetadata.service.resources.learning.LearningResourceResource` |

## entity/policies

| Entity | Schema | Java | Python | TypeScript | REST resource |
|---|---|---|---|---|---|
| Policy | `openmetadata-spec/src/main/resources/json/schema/entity/policies/policy.json` | `org.openmetadata.schema.entity.policies.Policy` | — | — | `org.openmetadata.service.resources.policies.PolicyResource` |

## entity/services

| Entity | Schema | Java | Python | TypeScript | REST resource |
|---|---|---|---|---|---|
| ApiService | `openmetadata-spec/src/main/resources/json/schema/entity/services/apiService.json` | `org.openmetadata.schema.entity.services.ApiService` | — | — | — |
| DashboardService | `openmetadata-spec/src/main/resources/json/schema/entity/services/dashboardService.json` | `org.openmetadata.schema.entity.services.DashboardService` | — | — | — |
| DatabaseService | `openmetadata-spec/src/main/resources/json/schema/entity/services/databaseService.json` | `org.openmetadata.schema.entity.services.DatabaseService` | — | — | — |
| DriveService | `openmetadata-spec/src/main/resources/json/schema/entity/services/driveService.json` | `org.openmetadata.schema.entity.services.DriveService` | — | — | — |
| IngestionPipeline | `openmetadata-spec/src/main/resources/json/schema/entity/services/ingestionPipelines/ingestionPipeline.json` | `org.openmetadata.schema.entity.services.ingestionPipelines.IngestionPipeline` | — | — | `org.openmetadata.service.resources.services.ingestionpipelines.IngestionPipelineResource` |
| LLMService | `openmetadata-spec/src/main/resources/json/schema/entity/services/llmService.json` | `org.openmetadata.schema.entity.services.LLMService` | — | — | — |
| McpService | `openmetadata-spec/src/main/resources/json/schema/entity/services/mcpService.json` | `org.openmetadata.schema.entity.services.McpService` | — | — | — |
| MessagingService | `openmetadata-spec/src/main/resources/json/schema/entity/services/messagingService.json` | `org.openmetadata.schema.entity.services.MessagingService` | — | — | — |
| MetadataService | `openmetadata-spec/src/main/resources/json/schema/entity/services/metadataService.json` | `org.openmetadata.schema.entity.services.MetadataService` | — | — | — |
| MlModelService | `openmetadata-spec/src/main/resources/json/schema/entity/services/mlmodelService.json` | `org.openmetadata.schema.entity.services.MlModelService` | — | — | — |
| PipelineService | `openmetadata-spec/src/main/resources/json/schema/entity/services/pipelineService.json` | `org.openmetadata.schema.entity.services.PipelineService` | — | — | — |
| SearchService | `openmetadata-spec/src/main/resources/json/schema/entity/services/searchService.json` | `org.openmetadata.schema.entity.services.SearchService` | — | — | — |
| SecurityService | `openmetadata-spec/src/main/resources/json/schema/entity/services/securityService.json` | `org.openmetadata.schema.entity.services.SecurityService` | — | — | — |
| StorageService | `openmetadata-spec/src/main/resources/json/schema/entity/services/storageService.json` | `org.openmetadata.schema.entity.services.StorageService` | — | — | — |
| TestConnectionDefinition | `openmetadata-spec/src/main/resources/json/schema/entity/services/connections/testConnectionDefinition.json` | `org.openmetadata.schema.entity.services.connections.TestConnectionDefinition` | — | — | `org.openmetadata.service.resources.services.connections.TestConnectionDefinitionResource` |

## entity/tasks

| Entity | Schema | Java | Python | TypeScript | REST resource |
|---|---|---|---|---|---|
| Task | `openmetadata-spec/src/main/resources/json/schema/entity/tasks/task.json` | `org.openmetadata.schema.entity.tasks.Task` | — | — | `org.openmetadata.service.resources.tasks.TaskResource` |

## entity/teams

| Entity | Schema | Java | Python | TypeScript | REST resource |
|---|---|---|---|---|---|
| Persona | `openmetadata-spec/src/main/resources/json/schema/entity/teams/persona.json` | `org.openmetadata.schema.entity.teams.Persona` | — | — | `org.openmetadata.service.resources.teams.PersonaResource` |
| Role | `openmetadata-spec/src/main/resources/json/schema/entity/teams/role.json` | `org.openmetadata.schema.entity.teams.Role` | — | — | `org.openmetadata.service.resources.teams.RoleResource` |
| Team | `openmetadata-spec/src/main/resources/json/schema/entity/teams/team.json` | `org.openmetadata.schema.entity.teams.Team` | — | — | `org.openmetadata.service.resources.teams.TeamResource` |
| TeamHierarchy | `openmetadata-spec/src/main/resources/json/schema/entity/teams/teamHierarchy.json` | `org.openmetadata.schema.entity.teams.TeamHierarchy` | — | — | — |
| User | `openmetadata-spec/src/main/resources/json/schema/entity/teams/user.json` | `org.openmetadata.schema.entity.teams.User` | — | — | `org.openmetadata.service.resources.teams.UserResource` |
