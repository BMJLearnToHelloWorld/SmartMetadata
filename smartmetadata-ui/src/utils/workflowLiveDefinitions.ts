/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import type { WorkflowDefinitionFull } from '@/types/governance';

/**
 * The 21 governance workflow definitions live on the deployment server
 * (workflow_definition_entity, read-only MySQL dump via the deploy SSH,
 * 2026-11-06), reduced to the fields the serializer round-trip exercises
 * (name / displayName / description / trigger / nodes / edges / config).
 * Server-managed fields (id, version, href, updatedAt, updatedBy, deleted,
 * fullyQualifiedName, change descriptions) are dropped: the serializer
 * neither reads nor writes them.
 *
 * The set is 19 seeded definitions (byte-identical to the official seed
 * JSONs at pin a3012259ca, openmetadata-service/.../json/data/governance/
 * workflows/) + AutoPilotWorkflow (seeded from applications/
 * AutoPilotApplication/openmetadata/AutoPilotWorkflow.json) + seed_workflow
 * (a live-pass probe artifact with no trigger and no nodes, id
 * d1e7d379-52cf-41e6-9049-cff81ff6f888). Do NOT hand-edit the payload: if
 * the live set changes, re-dump it and regenerate this file.
 *
 * liveWorkflowDefinitions() parses a fresh copy on every call: the
 * deserializer migrates inputNamespaceMap in place, so the test must never
 * share one parsed object across cases.
 */
const LIVE_WORKFLOW_DEFINITIONS_JSON = `[
  {
    "name": "AIAssetApprovalWorkflow",
    "displayName": "AI Asset Approval Workflow",
    "description": "When an AI asset (AI Application, LLM Model, or MCP Server) is submitted for review, route it to the Risk Council reviewers for approval, mirroring the Glossary Term approval process.",
    "trigger": {
      "type": "eventBasedEntity",
      "config": {
        "events": [
          "Created",
          "Updated"
        ],
        "filter": {},
        "exclude": [],
        "include": [],
        "entityTypes": [
          "aiApplication",
          "llmModel",
          "mcpServer"
        ],
        "approvalMode": "Default"
      },
      "output": [
        "relatedEntity",
        "updatedBy"
      ]
    },
    "nodes": [
      {
        "name": "AIAssetSubmitted",
        "type": "startEvent",
        "subType": "startEvent",
        "displayName": "AI Asset Created or Updated"
      },
      {
        "name": "NoActionEnd",
        "type": "endEvent",
        "subType": "endEvent",
        "displayName": "No Approval Action Required"
      },
      {
        "name": "ApprovedEnd",
        "type": "endEvent",
        "subType": "endEvent",
        "displayName": "AI Asset Status: Approved"
      },
      {
        "name": "RejectedEnd",
        "type": "endEvent",
        "subType": "endEvent",
        "displayName": "AI Asset Status: Rejected"
      },
      {
        "name": "AutoApprovedByReviewerEnd",
        "type": "endEvent",
        "subType": "endEvent",
        "displayName": "Auto-Approved by Reviewer"
      },
      {
        "name": "CheckAIAssetInReview",
        "type": "automatedTask",
        "input": [
          "relatedEntity"
        ],
        "config": {
          "rules": "{\\"and\\":[{\\"==\\":[{\\"var\\":\\"entityStatus\\"},\\"In Review\\"]}]}"
        },
        "subType": "checkEntityAttributesTask",
        "branches": [
          "true",
          "false"
        ],
        "displayName": "Check if AI Asset is In Review",
        "inputNamespaceMap": {
          "relatedEntity": "global"
        }
      },
      {
        "name": "CheckAIAssetHasReviewers",
        "type": "automatedTask",
        "input": [
          "relatedEntity"
        ],
        "config": {
          "rules": "{\\"and\\":[{\\"some\\":[{\\"var\\":\\"reviewers\\"},{\\"!=\\":[{\\"var\\":\\"fullyQualifiedName\\"},null]}]}]}"
        },
        "subType": "checkEntityAttributesTask",
        "branches": [
          "true",
          "false"
        ],
        "displayName": "Check if AI Asset has Reviewers",
        "inputNamespaceMap": {
          "relatedEntity": "global"
        }
      },
      {
        "name": "CheckAIAssetUpdatedByIsReviewer",
        "type": "automatedTask",
        "input": [
          "relatedEntity"
        ],
        "config": {
          "rules": "{\\"and\\":[{\\"isReviewer\\":{\\"var\\":\\"updatedBy\\"}}]}"
        },
        "subType": "checkEntityAttributesTask",
        "branches": [
          "true",
          "false"
        ],
        "displayName": "Check if AI Asset Updated By is Reviewer",
        "inputNamespaceMap": {
          "relatedEntity": "global"
        }
      },
      {
        "name": "SetAIAssetApprovedByReviewer",
        "type": "automatedTask",
        "input": [
          "relatedEntity",
          "updatedBy"
        ],
        "config": {
          "fieldName": "status",
          "fieldValue": "Approved"
        },
        "output": [],
        "subType": "setEntityAttributeTask",
        "displayName": "Set Status to 'Approved' (By Reviewer)",
        "inputNamespaceMap": {
          "updatedBy": "global",
          "relatedEntity": "global"
        }
      },
      {
        "name": "ApproveAIAsset",
        "type": "userTask",
        "input": [
          "relatedEntity"
        ],
        "config": {
          "stageId": "review",
          "assignees": {
            "addOwners": false,
            "candidates": [],
            "addReviewers": true,
            "emptyAssigneeStrategy": "none"
          },
          "taskStatus": "Open",
          "assigneeStrategy": "reviewers-and-assignees",
          "stageDisplayName": "Review",
          "approvalThreshold": 1,
          "rejectionThreshold": 1,
          "transitionMetadata": [
            {
              "id": "approve",
              "label": "Approve",
              "formRef": "approve",
              "targetStageId": "approved",
              "resolutionType": "Approved",
              "requiresComment": false,
              "targetTaskStatus": "Approved"
            },
            {
              "id": "reject",
              "label": "Reject",
              "formRef": "reject",
              "targetStageId": "rejected",
              "resolutionType": "Rejected",
              "requiresComment": true,
              "targetTaskStatus": "Rejected"
            }
          ],
          "allowPartialDecisions": false
        },
        "output": [
          "updatedBy"
        ],
        "subType": "userApprovalTask",
        "branches": [
          "true",
          "false"
        ],
        "displayName": "Create Risk Council Approval Task",
        "inputNamespaceMap": {
          "relatedEntity": "global"
        }
      },
      {
        "name": "SetAIAssetApproved",
        "type": "automatedTask",
        "input": [
          "relatedEntity",
          "updatedBy"
        ],
        "config": {
          "fieldName": "status",
          "fieldValue": "Approved"
        },
        "output": [],
        "subType": "setEntityAttributeTask",
        "displayName": "Set Status to 'Approved'",
        "inputNamespaceMap": {
          "updatedBy": "ApproveAIAsset",
          "relatedEntity": "global"
        }
      },
      {
        "name": "SetAIAssetRejected",
        "type": "automatedTask",
        "input": [
          "relatedEntity",
          "updatedBy"
        ],
        "config": {
          "fieldName": "status",
          "fieldValue": "Rejected"
        },
        "output": [],
        "subType": "setEntityAttributeTask",
        "displayName": "Set Status to 'Rejected'",
        "inputNamespaceMap": {
          "updatedBy": "ApproveAIAsset",
          "relatedEntity": "global"
        }
      }
    ],
    "edges": [
      {
        "to": "CheckAIAssetInReview",
        "from": "AIAssetSubmitted"
      },
      {
        "to": "NoActionEnd",
        "from": "CheckAIAssetInReview",
        "condition": "false"
      },
      {
        "to": "CheckAIAssetHasReviewers",
        "from": "CheckAIAssetInReview",
        "condition": "true"
      },
      {
        "to": "NoActionEnd",
        "from": "CheckAIAssetHasReviewers",
        "condition": "false"
      },
      {
        "to": "CheckAIAssetUpdatedByIsReviewer",
        "from": "CheckAIAssetHasReviewers",
        "condition": "true"
      },
      {
        "to": "SetAIAssetApprovedByReviewer",
        "from": "CheckAIAssetUpdatedByIsReviewer",
        "condition": "true"
      },
      {
        "to": "ApproveAIAsset",
        "from": "CheckAIAssetUpdatedByIsReviewer",
        "condition": "false"
      },
      {
        "to": "AutoApprovedByReviewerEnd",
        "from": "SetAIAssetApprovedByReviewer"
      },
      {
        "to": "SetAIAssetApproved",
        "from": "ApproveAIAsset",
        "condition": "approve"
      },
      {
        "to": "SetAIAssetRejected",
        "from": "ApproveAIAsset",
        "condition": "reject"
      },
      {
        "to": "ApprovedEnd",
        "from": "SetAIAssetApproved"
      },
      {
        "to": "RejectedEnd",
        "from": "SetAIAssetRejected"
      }
    ],
    "config": {
      "storeStageStatus": true
    }
  },
  {
    "name": "AutoPilotWorkflow",
    "displayName": "AutoPilot Workflow",
    "description": "Whenever a new Service is created, the relevant pipelines will automatically be created, deployed and run.",
    "trigger": {
      "type": "noOp",
      "output": [
        "relatedEntity"
      ]
    },
    "nodes": [
      {
        "name": "ServiceCreated",
        "type": "startEvent",
        "subType": "startEvent",
        "displayName": "Service Created"
      },
      {
        "name": "RunMetadataIngestion",
        "type": "automatedTask",
        "input": [
          "relatedEntity"
        ],
        "config": {
          "shouldRun": true,
          "pipelineType": "metadata",
          "timeoutSeconds": 3600,
          "waitForCompletion": true
        },
        "subType": "createAndRunIngestionPipelineTask",
        "branches": [
          "success",
          "failure"
        ],
        "displayName": "Run Metadata Ingestion Pipeline",
        "inputNamespaceMap": {
          "relatedEntity": "global"
        }
      },
      {
        "name": "FirstGateway",
        "type": "gateway",
        "subType": "parallelGateway",
        "displayName": "First Gateway"
      },
      {
        "name": "RunDataInsightsApplication",
        "type": "automatedTask",
        "input": [
          "relatedEntity"
        ],
        "config": {
          "appName": "DataInsightsApplication",
          "timeoutSeconds": 3600,
          "waitForCompletion": true
        },
        "subType": "runAppTask",
        "branches": [
          "success",
          "failure"
        ],
        "displayName": "Run Data Insights Application",
        "inputNamespaceMap": {
          "relatedEntity": "global"
        }
      },
      {
        "name": "RunLineageIngestion",
        "type": "automatedTask",
        "input": [
          "relatedEntity"
        ],
        "config": {
          "shouldRun": true,
          "pipelineType": "lineage",
          "timeoutSeconds": 3600,
          "waitForCompletion": true
        },
        "subType": "createAndRunIngestionPipelineTask",
        "branches": [
          "success",
          "failure"
        ],
        "displayName": "Run Lineage Ingestion Pipeline",
        "inputNamespaceMap": {
          "relatedEntity": "global"
        }
      },
      {
        "name": "FirstSyncGateway",
        "type": "gateway",
        "subType": "parallelGateway",
        "displayName": "First Sync Gateway"
      },
      {
        "name": "RunUsageIngestion",
        "type": "automatedTask",
        "input": [
          "relatedEntity"
        ],
        "config": {
          "shouldRun": true,
          "pipelineType": "usage",
          "timeoutSeconds": 3600,
          "waitForCompletion": true
        },
        "subType": "createAndRunIngestionPipelineTask",
        "branches": [
          "success",
          "failure"
        ],
        "displayName": "Run Usage Ingestion Pipeline",
        "inputNamespaceMap": {
          "relatedEntity": "global"
        }
      },
      {
        "name": "SecondGateway",
        "type": "gateway",
        "subType": "parallelGateway",
        "displayName": "Second Gateway"
      },
      {
        "name": "RunProfilerIngestion",
        "type": "automatedTask",
        "input": [
          "relatedEntity"
        ],
        "config": {
          "shouldRun": false,
          "pipelineType": "profiler",
          "timeoutSeconds": 3600,
          "waitForCompletion": true
        },
        "subType": "createAndRunIngestionPipelineTask",
        "branches": [
          "success",
          "failure"
        ],
        "displayName": "Run Profiler Ingestion Pipeline",
        "inputNamespaceMap": {
          "relatedEntity": "global"
        }
      },
      {
        "name": "RunAutoClassificationIngestion",
        "type": "automatedTask",
        "input": [
          "relatedEntity"
        ],
        "config": {
          "shouldRun": false,
          "pipelineType": "autoClassification",
          "timeoutSeconds": 3600,
          "waitForCompletion": true
        },
        "subType": "createAndRunIngestionPipelineTask",
        "branches": [
          "success",
          "failure"
        ],
        "displayName": "Run AutoClassification Ingestion Pipeline",
        "inputNamespaceMap": {
          "relatedEntity": "global"
        }
      },
      {
        "name": "SyncGateway",
        "type": "gateway",
        "subType": "parallelGateway",
        "displayName": "Sync Gateway"
      },
      {
        "name": "RunFinalDataInsightsApplication",
        "type": "automatedTask",
        "input": [
          "relatedEntity"
        ],
        "config": {
          "appName": "DataInsightsApplication",
          "timeoutSeconds": 3600,
          "waitForCompletion": true
        },
        "subType": "runAppTask",
        "branches": [
          "success",
          "failure"
        ],
        "displayName": "Run Data Insights Application",
        "inputNamespaceMap": {
          "relatedEntity": "global"
        }
      },
      {
        "name": "WorkflowEnded",
        "type": "endEvent",
        "subType": "endEvent",
        "displayName": "Workflow Ended"
      },
      {
        "name": "WorkflowFailure",
        "type": "endEvent",
        "subType": "endEvent",
        "displayName": "Workflow Failure"
      }
    ],
    "edges": [
      {
        "to": "RunMetadataIngestion",
        "from": "ServiceCreated"
      },
      {
        "to": "WorkflowFailure",
        "from": "RunMetadataIngestion",
        "condition": "failure"
      },
      {
        "to": "FirstGateway",
        "from": "RunMetadataIngestion",
        "condition": "success"
      },
      {
        "to": "RunDataInsightsApplication",
        "from": "FirstGateway"
      },
      {
        "to": "FirstSyncGateway",
        "from": "RunDataInsightsApplication"
      },
      {
        "to": "RunLineageIngestion",
        "from": "FirstGateway"
      },
      {
        "to": "FirstSyncGateway",
        "from": "RunLineageIngestion"
      },
      {
        "to": "RunUsageIngestion",
        "from": "FirstSyncGateway"
      },
      {
        "to": "WorkflowFailure",
        "from": "RunUsageIngestion",
        "condition": "failure"
      },
      {
        "to": "SecondGateway",
        "from": "RunUsageIngestion",
        "condition": "success"
      },
      {
        "to": "RunAutoClassificationIngestion",
        "from": "SecondGateway"
      },
      {
        "to": "SyncGateway",
        "from": "RunAutoClassificationIngestion"
      },
      {
        "to": "RunProfilerIngestion",
        "from": "SecondGateway"
      },
      {
        "to": "SyncGateway",
        "from": "RunProfilerIngestion"
      },
      {
        "to": "RunFinalDataInsightsApplication",
        "from": "SyncGateway"
      },
      {
        "to": "WorkflowEnded",
        "from": "RunFinalDataInsightsApplication"
      }
    ],
    "config": {
      "storeStageStatus": true
    }
  },
  {
    "name": "CustomTaskWorkflow",
    "displayName": "Custom Task Workflow",
    "description": "Default workflow-driven lifecycle for custom tasks.",
    "trigger": {
      "type": "noOp",
      "config": {},
      "output": [
        "relatedEntity",
        "updatedBy"
      ]
    },
    "nodes": [
      {
        "name": "TaskStart",
        "type": "startEvent",
        "subType": "startEvent",
        "displayName": "Task Start"
      },
      {
        "name": "TaskReview",
        "type": "userTask",
        "input": [
          "relatedEntity"
        ],
        "config": {
          "stageId": "review",
          "assignees": {
            "addOwners": false,
            "candidates": [],
            "addReviewers": true,
            "emptyAssigneeStrategy": "none"
          },
          "taskStatus": "Open",
          "assigneeStrategy": "reviewers-and-assignees",
          "stageDisplayName": "Review",
          "approvalThreshold": 1,
          "rejectionThreshold": 1,
          "transitionMetadata": [
            {
              "id": "approve",
              "label": "Approve",
              "formRef": "approve",
              "targetStageId": "approved",
              "resolutionType": "Approved",
              "requiresComment": false,
              "targetTaskStatus": "Approved"
            },
            {
              "id": "reject",
              "label": "Reject",
              "formRef": "reject",
              "targetStageId": "rejected",
              "resolutionType": "Rejected",
              "requiresComment": true,
              "targetTaskStatus": "Rejected"
            }
          ],
          "allowPartialDecisions": false
        },
        "output": [
          "updatedBy"
        ],
        "subType": "userApprovalTask",
        "branches": [
          "true",
          "false"
        ],
        "displayName": "Review Task",
        "inputNamespaceMap": {
          "relatedEntity": "global"
        }
      },
      {
        "name": "ApprovedEnd",
        "type": "endEvent",
        "subType": "endEvent",
        "displayName": "Approved"
      },
      {
        "name": "RejectedEnd",
        "type": "endEvent",
        "subType": "endEvent",
        "displayName": "Rejected"
      }
    ],
    "edges": [
      {
        "to": "TaskReview",
        "from": "TaskStart"
      },
      {
        "to": "ApprovedEnd",
        "from": "TaskReview",
        "condition": "approve"
      },
      {
        "to": "RejectedEnd",
        "from": "TaskReview",
        "condition": "reject"
      }
    ],
    "config": {
      "storeStageStatus": true
    }
  },
  {
    "name": "DataQualityReviewTaskWorkflow",
    "displayName": "Data Quality Review Task Workflow",
    "description": "Default workflow-driven lifecycle for data quality review tasks.",
    "trigger": {
      "type": "noOp",
      "config": {},
      "output": [
        "relatedEntity",
        "updatedBy"
      ]
    },
    "nodes": [
      {
        "name": "TaskStart",
        "type": "startEvent",
        "subType": "startEvent",
        "displayName": "Task Start"
      },
      {
        "name": "TaskReview",
        "type": "userTask",
        "input": [
          "relatedEntity"
        ],
        "config": {
          "stageId": "review",
          "assignees": {
            "addOwners": false,
            "candidates": [],
            "addReviewers": true,
            "emptyAssigneeStrategy": "none"
          },
          "taskStatus": "Open",
          "assigneeStrategy": "reviewers-and-assignees",
          "stageDisplayName": "Review",
          "approvalThreshold": 1,
          "rejectionThreshold": 1,
          "transitionMetadata": [
            {
              "id": "approve",
              "label": "Approve",
              "formRef": "approve",
              "targetStageId": "approved",
              "resolutionType": "Approved",
              "requiresComment": false,
              "targetTaskStatus": "Approved"
            },
            {
              "id": "reject",
              "label": "Reject",
              "formRef": "reject",
              "targetStageId": "rejected",
              "resolutionType": "Rejected",
              "requiresComment": true,
              "targetTaskStatus": "Rejected"
            }
          ],
          "allowPartialDecisions": false
        },
        "output": [
          "updatedBy"
        ],
        "subType": "userApprovalTask",
        "branches": [
          "true",
          "false"
        ],
        "displayName": "Review Task",
        "inputNamespaceMap": {
          "relatedEntity": "global"
        }
      },
      {
        "name": "ApprovedEnd",
        "type": "endEvent",
        "subType": "endEvent",
        "displayName": "Approved"
      },
      {
        "name": "RejectedEnd",
        "type": "endEvent",
        "subType": "endEvent",
        "displayName": "Rejected"
      }
    ],
    "edges": [
      {
        "to": "TaskReview",
        "from": "TaskStart"
      },
      {
        "to": "ApprovedEnd",
        "from": "TaskReview",
        "condition": "approve"
      },
      {
        "to": "RejectedEnd",
        "from": "TaskReview",
        "condition": "reject"
      }
    ],
    "config": {
      "storeStageStatus": true
    }
  },
  {
    "name": "DescriptionUpdateTaskWorkflow",
    "displayName": "Description Update Task Workflow",
    "description": "Default workflow-driven lifecycle for description update tasks.",
    "trigger": {
      "type": "noOp",
      "config": {},
      "output": [
        "relatedEntity",
        "updatedBy"
      ]
    },
    "nodes": [
      {
        "name": "TaskStart",
        "type": "startEvent",
        "subType": "startEvent",
        "displayName": "Task Start"
      },
      {
        "name": "TaskReview",
        "type": "userTask",
        "input": [
          "relatedEntity"
        ],
        "config": {
          "stageId": "review",
          "assignees": {
            "addOwners": false,
            "candidates": [],
            "addReviewers": true,
            "emptyAssigneeStrategy": "none"
          },
          "taskStatus": "Open",
          "assigneeStrategy": "reviewers-and-assignees",
          "stageDisplayName": "Review",
          "approvalThreshold": 1,
          "rejectionThreshold": 1,
          "transitionMetadata": [
            {
              "id": "approve",
              "label": "Approve",
              "formRef": "approve",
              "targetStageId": "approved",
              "resolutionType": "Approved",
              "requiresComment": false,
              "targetTaskStatus": "Approved"
            },
            {
              "id": "reject",
              "label": "Reject",
              "formRef": "reject",
              "targetStageId": "rejected",
              "resolutionType": "Rejected",
              "requiresComment": true,
              "targetTaskStatus": "Rejected"
            }
          ],
          "allowPartialDecisions": false
        },
        "output": [
          "updatedBy"
        ],
        "subType": "userApprovalTask",
        "branches": [
          "true",
          "false"
        ],
        "displayName": "Review Task",
        "inputNamespaceMap": {
          "relatedEntity": "global"
        }
      },
      {
        "name": "ApprovedEnd",
        "type": "endEvent",
        "subType": "endEvent",
        "displayName": "Approved"
      },
      {
        "name": "RejectedEnd",
        "type": "endEvent",
        "subType": "endEvent",
        "displayName": "Rejected"
      }
    ],
    "edges": [
      {
        "to": "TaskReview",
        "from": "TaskStart"
      },
      {
        "to": "ApprovedEnd",
        "from": "TaskReview",
        "condition": "approve"
      },
      {
        "to": "RejectedEnd",
        "from": "TaskReview",
        "condition": "reject"
      }
    ],
    "config": {
      "storeStageStatus": true
    }
  },
  {
    "name": "DomainUpdateTaskWorkflow",
    "displayName": "Domain Update Task Workflow",
    "description": "Default workflow-driven lifecycle for domain update tasks.",
    "trigger": {
      "type": "noOp",
      "config": {},
      "output": [
        "relatedEntity",
        "updatedBy"
      ]
    },
    "nodes": [
      {
        "name": "TaskStart",
        "type": "startEvent",
        "subType": "startEvent",
        "displayName": "Task Start"
      },
      {
        "name": "TaskReview",
        "type": "userTask",
        "input": [
          "relatedEntity"
        ],
        "config": {
          "stageId": "review",
          "assignees": {
            "addOwners": false,
            "candidates": [],
            "addReviewers": true,
            "emptyAssigneeStrategy": "none"
          },
          "taskStatus": "Open",
          "assigneeStrategy": "reviewers-and-assignees",
          "stageDisplayName": "Review",
          "approvalThreshold": 1,
          "rejectionThreshold": 1,
          "transitionMetadata": [
            {
              "id": "approve",
              "label": "Approve",
              "formRef": "approve",
              "targetStageId": "approved",
              "resolutionType": "Approved",
              "requiresComment": false,
              "targetTaskStatus": "Approved"
            },
            {
              "id": "reject",
              "label": "Reject",
              "formRef": "reject",
              "targetStageId": "rejected",
              "resolutionType": "Rejected",
              "requiresComment": true,
              "targetTaskStatus": "Rejected"
            }
          ],
          "allowPartialDecisions": false
        },
        "output": [
          "updatedBy"
        ],
        "subType": "userApprovalTask",
        "branches": [
          "true",
          "false"
        ],
        "displayName": "Review Task",
        "inputNamespaceMap": {
          "relatedEntity": "global"
        }
      },
      {
        "name": "ApprovedEnd",
        "type": "endEvent",
        "subType": "endEvent",
        "displayName": "Approved"
      },
      {
        "name": "RejectedEnd",
        "type": "endEvent",
        "subType": "endEvent",
        "displayName": "Rejected"
      }
    ],
    "edges": [
      {
        "to": "TaskReview",
        "from": "TaskStart"
      },
      {
        "to": "ApprovedEnd",
        "from": "TaskReview",
        "condition": "approve"
      },
      {
        "to": "RejectedEnd",
        "from": "TaskReview",
        "condition": "reject"
      }
    ],
    "config": {
      "storeStageStatus": true
    }
  },
  {
    "name": "GenericIncidentTaskWorkflow",
    "displayName": "Generic Incident Task Workflow",
    "description": "Default workflow-driven lifecycle for incident-style tasks with configurable stages from Open through Closed.",
    "trigger": {
      "type": "noOp",
      "config": {},
      "output": [
        "relatedEntity",
        "updatedBy"
      ]
    },
    "nodes": [
      {
        "name": "IncidentStart",
        "type": "startEvent",
        "subType": "startEvent",
        "displayName": "Incident Start"
      },
      {
        "name": "OpenStage",
        "type": "userTask",
        "input": [
          "relatedEntity"
        ],
        "config": {
          "stageId": "open",
          "assignees": {
            "addOwners": true,
            "candidates": [],
            "addReviewers": true,
            "emptyAssigneeStrategy": "none"
          },
          "taskStatus": "Open",
          "assigneeStrategy": "owners-and-assignees",
          "stageDisplayName": "Open",
          "approvalThreshold": 1,
          "rejectionThreshold": 1,
          "transitionMetadata": [
            {
              "id": "pending",
              "label": "Move to Pending",
              "formRef": "pending",
              "targetStageId": "pending",
              "requiresComment": false,
              "targetTaskStatus": "Pending"
            },
            {
              "id": "startProgress",
              "label": "Start Progress",
              "formRef": "startProgress",
              "targetStageId": "inProgress",
              "requiresComment": false,
              "targetTaskStatus": "InProgress"
            }
          ],
          "allowPartialDecisions": false
        },
        "output": [
          "updatedBy"
        ],
        "subType": "userApprovalTask",
        "branches": [
          "true",
          "false"
        ],
        "displayName": "Open",
        "inputNamespaceMap": {
          "relatedEntity": "global"
        }
      },
      {
        "name": "PendingStage",
        "type": "userTask",
        "input": [
          "relatedEntity"
        ],
        "config": {
          "stageId": "pending",
          "assignees": {
            "addOwners": true,
            "candidates": [],
            "addReviewers": true,
            "emptyAssigneeStrategy": "none"
          },
          "taskStatus": "Pending",
          "assigneeStrategy": "owners-and-assignees",
          "stageDisplayName": "Pending",
          "approvalThreshold": 1,
          "rejectionThreshold": 1,
          "transitionMetadata": [
            {
              "id": "startProgress",
              "label": "Start Progress",
              "formRef": "startProgress",
              "targetStageId": "inProgress",
              "requiresComment": false,
              "targetTaskStatus": "InProgress"
            },
            {
              "id": "close",
              "label": "Close",
              "formRef": "close",
              "targetStageId": "closed",
              "resolutionType": "Completed",
              "requiresComment": true,
              "targetTaskStatus": "Completed"
            }
          ],
          "allowPartialDecisions": false
        },
        "output": [
          "updatedBy"
        ],
        "subType": "userApprovalTask",
        "branches": [
          "true",
          "false"
        ],
        "displayName": "Pending",
        "inputNamespaceMap": {
          "relatedEntity": "global"
        }
      },
      {
        "name": "InProgressStage",
        "type": "userTask",
        "input": [
          "relatedEntity"
        ],
        "config": {
          "stageId": "inProgress",
          "assignees": {
            "addOwners": true,
            "candidates": [],
            "addReviewers": true,
            "emptyAssigneeStrategy": "none"
          },
          "taskStatus": "InProgress",
          "assigneeStrategy": "owners-and-assignees",
          "stageDisplayName": "In Progress",
          "approvalThreshold": 1,
          "rejectionThreshold": 1,
          "transitionMetadata": [
            {
              "id": "resolve",
              "label": "Resolve",
              "formRef": "resolve",
              "targetStageId": "resolved",
              "resolutionType": "Completed",
              "requiresComment": false,
              "targetTaskStatus": "Completed"
            },
            {
              "id": "close",
              "label": "Close",
              "formRef": "close",
              "targetStageId": "closed",
              "resolutionType": "Completed",
              "requiresComment": true,
              "targetTaskStatus": "Completed"
            }
          ],
          "allowPartialDecisions": false
        },
        "output": [
          "updatedBy"
        ],
        "subType": "userApprovalTask",
        "branches": [
          "true",
          "false"
        ],
        "displayName": "In Progress",
        "inputNamespaceMap": {
          "relatedEntity": "global"
        }
      },
      {
        "name": "ResolvedStage",
        "type": "userTask",
        "input": [
          "relatedEntity"
        ],
        "config": {
          "stageId": "resolved",
          "assignees": {
            "addOwners": true,
            "candidates": [],
            "addReviewers": true,
            "emptyAssigneeStrategy": "none"
          },
          "taskStatus": "Completed",
          "assigneeStrategy": "owners-and-assignees",
          "stageDisplayName": "Resolved",
          "approvalThreshold": 1,
          "rejectionThreshold": 1,
          "transitionMetadata": [
            {
              "id": "close",
              "label": "Close",
              "formRef": "close",
              "targetStageId": "closed",
              "resolutionType": "Completed",
              "requiresComment": true,
              "targetTaskStatus": "Completed"
            }
          ],
          "allowPartialDecisions": false
        },
        "output": [
          "updatedBy"
        ],
        "subType": "userApprovalTask",
        "branches": [
          "true",
          "false"
        ],
        "displayName": "Resolved",
        "inputNamespaceMap": {
          "relatedEntity": "global"
        }
      },
      {
        "name": "ClosedEnd",
        "type": "endEvent",
        "subType": "endEvent",
        "displayName": "Closed"
      }
    ],
    "edges": [
      {
        "to": "OpenStage",
        "from": "IncidentStart"
      },
      {
        "to": "PendingStage",
        "from": "OpenStage",
        "condition": "pending"
      },
      {
        "to": "InProgressStage",
        "from": "OpenStage",
        "condition": "startProgress"
      },
      {
        "to": "InProgressStage",
        "from": "PendingStage",
        "condition": "startProgress"
      },
      {
        "to": "ClosedEnd",
        "from": "PendingStage",
        "condition": "close"
      },
      {
        "to": "ResolvedStage",
        "from": "InProgressStage",
        "condition": "resolve"
      },
      {
        "to": "ClosedEnd",
        "from": "InProgressStage",
        "condition": "close"
      },
      {
        "to": "ClosedEnd",
        "from": "ResolvedStage",
        "condition": "close"
      }
    ],
    "config": {
      "storeStageStatus": true
    }
  },
  {
    "name": "GenericReviewTaskWorkflow",
    "displayName": "Generic Review Task Workflow",
    "description": "Default workflow-driven lifecycle for task forms that require a single review stage with approve or reject transitions.",
    "trigger": {
      "type": "noOp",
      "config": {},
      "output": [
        "relatedEntity",
        "updatedBy"
      ]
    },
    "nodes": [
      {
        "name": "TaskStart",
        "type": "startEvent",
        "subType": "startEvent",
        "displayName": "Task Start"
      },
      {
        "name": "TaskReview",
        "type": "userTask",
        "input": [
          "relatedEntity"
        ],
        "config": {
          "stageId": "review",
          "assignees": {
            "addOwners": false,
            "candidates": [],
            "addReviewers": true,
            "emptyAssigneeStrategy": "none"
          },
          "taskStatus": "Open",
          "assigneeStrategy": "reviewers-and-assignees",
          "stageDisplayName": "Review",
          "approvalThreshold": 1,
          "rejectionThreshold": 1,
          "transitionMetadata": [
            {
              "id": "approve",
              "label": "Approve",
              "formRef": "approve",
              "targetStageId": "approved",
              "resolutionType": "Approved",
              "requiresComment": false,
              "targetTaskStatus": "Approved"
            },
            {
              "id": "reject",
              "label": "Reject",
              "formRef": "reject",
              "targetStageId": "rejected",
              "resolutionType": "Rejected",
              "requiresComment": true,
              "targetTaskStatus": "Rejected"
            }
          ],
          "allowPartialDecisions": false
        },
        "output": [
          "updatedBy"
        ],
        "subType": "userApprovalTask",
        "branches": [
          "true",
          "false"
        ],
        "displayName": "Review Task",
        "inputNamespaceMap": {
          "relatedEntity": "global"
        }
      },
      {
        "name": "ApprovedEnd",
        "type": "endEvent",
        "subType": "endEvent",
        "displayName": "Approved"
      },
      {
        "name": "RejectedEnd",
        "type": "endEvent",
        "subType": "endEvent",
        "displayName": "Rejected"
      }
    ],
    "edges": [
      {
        "to": "TaskReview",
        "from": "TaskStart"
      },
      {
        "to": "ApprovedEnd",
        "from": "TaskReview",
        "condition": "approve"
      },
      {
        "to": "RejectedEnd",
        "from": "TaskReview",
        "condition": "reject"
      }
    ],
    "config": {
      "storeStageStatus": true
    }
  },
  {
    "name": "GlossaryTermApprovalWorkflow",
    "displayName": "Glossary Approval Workflow",
    "description": "When a Glossary Term is Created or Updated, this Workflow will be triggered for the Term to be Approved.",
    "trigger": {
      "type": "eventBasedEntity",
      "config": {
        "events": [
          "Created",
          "Updated"
        ],
        "filter": {},
        "exclude": [
          "entityStatus"
        ],
        "include": [],
        "entityTypes": [
          "glossaryTerm"
        ],
        "approvalMode": "Default"
      },
      "output": [
        "relatedEntity",
        "updatedBy"
      ]
    },
    "nodes": [
      {
        "name": "GlossaryTermCreated",
        "type": "startEvent",
        "subType": "startEvent",
        "displayName": "Glossary Term Created or Updated"
      },
      {
        "name": "AutoApprovedByReviewerEnd",
        "type": "endEvent",
        "subType": "endEvent",
        "displayName": "Auto-Approved by Reviewer"
      },
      {
        "name": "ApprovedEnd",
        "type": "endEvent",
        "subType": "endEvent",
        "displayName": "Glossary Term Status: Approved"
      },
      {
        "name": "ApprovedEndAfterApproval",
        "type": "endEvent",
        "subType": "endEvent",
        "displayName": "Glossary Term Status: Approved"
      },
      {
        "name": "RejectedEnd",
        "type": "endEvent",
        "subType": "endEvent",
        "displayName": "Glossary Term Status: Rejected"
      },
      {
        "name": "DraftEnd",
        "type": "endEvent",
        "subType": "endEvent",
        "displayName": "Glossary Term Status: Draft"
      },
      {
        "name": "CheckIfGlossaryTermUpdatedByIsReviewer",
        "type": "automatedTask",
        "input": [
          "relatedEntity"
        ],
        "config": {
          "rules": "{\\"and\\":[{\\"isReviewer\\":{\\"var\\":\\"updatedBy\\"}}]}"
        },
        "subType": "checkEntityAttributesTask",
        "branches": [
          "true",
          "false"
        ],
        "displayName": "Check if Glossary Term Updated By is Reviewer",
        "inputNamespaceMap": {
          "relatedEntity": "global"
        }
      },
      {
        "name": "SetGlossaryTermStatusToApprovedByReviewer",
        "type": "automatedTask",
        "input": [
          "relatedEntity",
          "updatedBy"
        ],
        "config": {
          "fieldName": "status",
          "fieldValue": "Approved"
        },
        "output": [],
        "subType": "setEntityAttributeTask",
        "displayName": "Set Status to 'Approved' (By Reviewer)",
        "inputNamespaceMap": {
          "updatedBy": "global",
          "relatedEntity": "global"
        }
      },
      {
        "name": "CheckGlossaryTermHasReviewers",
        "type": "automatedTask",
        "input": [
          "relatedEntity"
        ],
        "config": {
          "rules": "{\\"and\\":[{\\"some\\":[{\\"var\\":\\"reviewers\\"},{\\"!=\\":[{\\"var\\":\\"fullyQualifiedName\\"},null]}]}]}"
        },
        "subType": "checkEntityAttributesTask",
        "branches": [
          "true",
          "false"
        ],
        "displayName": "Check if Glossary Term has Reviewers",
        "inputNamespaceMap": {
          "relatedEntity": "global"
        }
      },
      {
        "name": "CheckGlossaryTermIsReadyToBeReviewed",
        "type": "automatedTask",
        "input": [
          "relatedEntity"
        ],
        "config": {
          "rules": "{\\"and\\":[{\\"!!\\":[{\\"var\\":\\"description\\"}]}]}"
        },
        "subType": "checkEntityAttributesTask",
        "branches": [
          "true",
          "false"
        ],
        "displayName": "Check if Glossary Term is Ready to be Reviewed",
        "inputNamespaceMap": {
          "relatedEntity": "global"
        }
      },
      {
        "name": "SetGlossaryTermStatusToInReview",
        "type": "automatedTask",
        "input": [
          "relatedEntity",
          "updatedBy"
        ],
        "config": {
          "fieldName": "status",
          "fieldValue": "In Review"
        },
        "output": [],
        "subType": "setEntityAttributeTask",
        "displayName": "Set Status to 'In Review'",
        "inputNamespaceMap": {
          "relatedEntity": "global"
        }
      },
      {
        "name": "SetGlossaryTermStatusToDraft",
        "type": "automatedTask",
        "input": [
          "relatedEntity",
          "updatedBy"
        ],
        "config": {
          "fieldName": "status",
          "fieldValue": "Draft"
        },
        "output": [],
        "subType": "setEntityAttributeTask",
        "displayName": "Set Status to 'Draft'",
        "inputNamespaceMap": {
          "relatedEntity": "global"
        }
      },
      {
        "name": "ApproveGlossaryTerm",
        "type": "userTask",
        "input": [
          "relatedEntity"
        ],
        "config": {
          "stageId": "review",
          "assignees": {
            "addOwners": false,
            "candidates": [],
            "addReviewers": true,
            "emptyAssigneeStrategy": "none"
          },
          "taskStatus": "Open",
          "assigneeStrategy": "reviewers-and-assignees",
          "stageDisplayName": "Review",
          "approvalThreshold": 1,
          "rejectionThreshold": 1,
          "transitionMetadata": [
            {
              "id": "approve",
              "label": "Approve",
              "formRef": "approve",
              "targetStageId": "approved",
              "resolutionType": "Approved",
              "requiresComment": false,
              "targetTaskStatus": "Approved"
            },
            {
              "id": "reject",
              "label": "Reject",
              "formRef": "reject",
              "targetStageId": "rejected",
              "resolutionType": "Rejected",
              "requiresComment": true,
              "targetTaskStatus": "Rejected"
            }
          ],
          "allowPartialDecisions": false
        },
        "output": [
          "updatedBy"
        ],
        "subType": "userApprovalTask",
        "branches": [
          "true",
          "false"
        ],
        "displayName": "Create User Approval Task",
        "inputNamespaceMap": {
          "relatedEntity": "global"
        }
      },
      {
        "name": "CheckIfGlossaryTermIsNew",
        "type": "automatedTask",
        "input": [
          "relatedEntity"
        ],
        "config": {
          "rules": "{\\"and\\":[{\\"==\\":[{\\"var\\":\\"version\\"},0.1]}]}"
        },
        "subType": "checkEntityAttributesTask",
        "branches": [
          "true",
          "false"
        ],
        "displayName": "Check if Glossary Term is New",
        "inputNamespaceMap": {
          "relatedEntity": "global"
        }
      },
      {
        "name": "SetGlossaryTermStatusToInReviewForUpdate",
        "type": "automatedTask",
        "input": [
          "relatedEntity",
          "updatedBy"
        ],
        "config": {
          "fieldName": "status",
          "fieldValue": "In Review"
        },
        "output": [],
        "subType": "setEntityAttributeTask",
        "displayName": "Set Status to 'In Review' (Update)",
        "inputNamespaceMap": {
          "updatedBy": "global",
          "relatedEntity": "global"
        }
      },
      {
        "name": "ApprovalForUpdates",
        "type": "userTask",
        "input": [
          "relatedEntity"
        ],
        "config": {
          "stageId": "review",
          "assignees": {
            "addOwners": false,
            "candidates": [],
            "addReviewers": true,
            "emptyAssigneeStrategy": "none"
          },
          "taskStatus": "Open",
          "assigneeStrategy": "reviewers-and-assignees",
          "stageDisplayName": "Review",
          "approvalThreshold": 1,
          "rejectionThreshold": 1,
          "transitionMetadata": [
            {
              "id": "approve",
              "label": "Approve",
              "formRef": "approve",
              "targetStageId": "approved",
              "resolutionType": "Approved",
              "requiresComment": false,
              "targetTaskStatus": "Approved"
            },
            {
              "id": "reject",
              "label": "Reject",
              "formRef": "reject",
              "targetStageId": "rejected",
              "resolutionType": "Rejected",
              "requiresComment": true,
              "targetTaskStatus": "Rejected"
            }
          ],
          "allowPartialDecisions": false
        },
        "output": [
          "updatedBy"
        ],
        "subType": "userApprovalTask",
        "branches": [
          "true",
          "false"
        ],
        "displayName": "Review Changes for Updates",
        "inputNamespaceMap": {
          "relatedEntity": "global"
        }
      },
      {
        "name": "RollbackGlossaryTermChanges",
        "type": "automatedTask",
        "input": [
          "relatedEntity",
          "updatedBy"
        ],
        "config": {},
        "output": [],
        "subType": "rollbackEntityTask",
        "displayName": "Rollback Glossary Term Changes",
        "inputNamespaceMap": {
          "updatedBy": "ApprovalForUpdates",
          "relatedEntity": "global"
        }
      },
      {
        "name": "SetGlossaryTermStatusToApprovedAfterReview",
        "type": "automatedTask",
        "input": [
          "relatedEntity",
          "updatedBy"
        ],
        "config": {
          "fieldName": "status",
          "fieldValue": "Approved"
        },
        "output": [],
        "subType": "setEntityAttributeTask",
        "displayName": "Set Status to 'Approved' (After Review)",
        "inputNamespaceMap": {
          "updatedBy": "ApprovalForUpdates",
          "relatedEntity": "global"
        }
      },
      {
        "name": "RollbackEnd",
        "type": "endEvent",
        "subType": "endEvent",
        "displayName": "Changes Rolled Back"
      },
      {
        "name": "ApprovalEnd",
        "type": "endEvent",
        "subType": "endEvent",
        "displayName": "Approved After Unified Review"
      },
      {
        "name": "SetGlossaryTermStatusToApprovedAfterApproval",
        "type": "automatedTask",
        "input": [
          "relatedEntity",
          "updatedBy"
        ],
        "config": {
          "fieldName": "status",
          "fieldValue": "Approved"
        },
        "output": [],
        "subType": "setEntityAttributeTask",
        "displayName": "Set Status to 'Approved'",
        "inputNamespaceMap": {
          "updatedBy": "ApproveGlossaryTerm",
          "relatedEntity": "global"
        }
      },
      {
        "name": "SetGlossaryTermStatusToApproved",
        "type": "automatedTask",
        "input": [
          "relatedEntity",
          "updatedBy"
        ],
        "config": {
          "fieldName": "status",
          "fieldValue": "Approved"
        },
        "output": [],
        "subType": "setEntityAttributeTask",
        "displayName": "Set Status to 'Approved'",
        "inputNamespaceMap": {
          "relatedEntity": "global"
        }
      },
      {
        "name": "SetGlossaryTermStatusToRejected",
        "type": "automatedTask",
        "input": [
          "relatedEntity",
          "updatedBy"
        ],
        "config": {
          "fieldName": "status",
          "fieldValue": "Rejected"
        },
        "output": [],
        "subType": "setEntityAttributeTask",
        "displayName": "Set Status to 'Rejected'",
        "inputNamespaceMap": {
          "updatedBy": "ApproveGlossaryTerm",
          "relatedEntity": "global"
        }
      },
      {
        "name": "CheckIfGlossaryTermIsAutomationProposal",
        "type": "automatedTask",
        "input": [
          "relatedEntity"
        ],
        "config": {
          "rules": "{\\"and\\":[{\\"==\\":[{\\"var\\":\\"provider\\"},\\"automation\\"]},{\\"!=\\":[{\\"var\\":\\"entityStatus\\"},\\"Approved\\"]}]}"
        },
        "subType": "checkEntityAttributesTask",
        "branches": [
          "true",
          "false"
        ],
        "displayName": "Check if an Automation proposed the Glossary Term",
        "inputNamespaceMap": {
          "relatedEntity": "global"
        }
      },
      {
        "name": "CheckIfAutomationProposalUpdatedByIsReviewer",
        "type": "automatedTask",
        "input": [
          "relatedEntity"
        ],
        "config": {
          "rules": "{\\"and\\":[{\\"isReviewer\\":{\\"var\\":\\"updatedBy\\"}}]}"
        },
        "subType": "checkEntityAttributesTask",
        "branches": [
          "true",
          "false"
        ],
        "displayName": "Check if the Proposal is Updated By a Reviewer",
        "inputNamespaceMap": {
          "relatedEntity": "global"
        }
      },
      {
        "name": "SetAutomationProposalStatusToApprovedByReviewer",
        "type": "automatedTask",
        "input": [
          "relatedEntity",
          "updatedBy"
        ],
        "config": {
          "fieldName": "status",
          "fieldValue": "Approved"
        },
        "output": [],
        "subType": "setEntityAttributeTask",
        "displayName": "Set Proposal Status to 'Approved' (By Reviewer)",
        "inputNamespaceMap": {
          "updatedBy": "global",
          "relatedEntity": "global"
        }
      },
      {
        "name": "AutomationProposalApprovedByReviewerEnd",
        "type": "endEvent",
        "subType": "endEvent",
        "displayName": "Proposal Approved By Reviewer"
      },
      {
        "name": "CheckIfAutomationProposalIsNew",
        "type": "automatedTask",
        "input": [
          "relatedEntity"
        ],
        "config": {
          "rules": "{\\"and\\":[{\\"==\\":[{\\"var\\":\\"version\\"},0.1]}]}"
        },
        "subType": "checkEntityAttributesTask",
        "branches": [
          "true",
          "false"
        ],
        "displayName": "Check if the Proposal is New",
        "inputNamespaceMap": {
          "relatedEntity": "global"
        }
      },
      {
        "name": "SetAutomationProposalStatusToInReview",
        "type": "automatedTask",
        "input": [
          "relatedEntity",
          "updatedBy"
        ],
        "config": {
          "fieldName": "status",
          "fieldValue": "In Review"
        },
        "output": [],
        "subType": "setEntityAttributeTask",
        "displayName": "Set Proposal Status to 'In Review'",
        "inputNamespaceMap": {
          "relatedEntity": "global"
        }
      },
      {
        "name": "ApproveAutomationProposal",
        "type": "userTask",
        "input": [
          "relatedEntity"
        ],
        "config": {
          "stageId": "review",
          "assignees": {
            "addOwners": false,
            "candidates": [],
            "addReviewers": true,
            "emptyAssigneeStrategy": "assignAdmins"
          },
          "taskStatus": "Open",
          "assigneeStrategy": "reviewers-and-assignees",
          "stageDisplayName": "Review",
          "approvalThreshold": 1,
          "rejectionThreshold": 1,
          "transitionMetadata": [
            {
              "id": "approve",
              "label": "Approve",
              "formRef": "approve",
              "targetStageId": "approved",
              "resolutionType": "Approved",
              "requiresComment": false,
              "targetTaskStatus": "Approved"
            },
            {
              "id": "reject",
              "label": "Reject",
              "formRef": "reject",
              "targetStageId": "rejected",
              "resolutionType": "Rejected",
              "requiresComment": true,
              "targetTaskStatus": "Rejected"
            }
          ],
          "allowPartialDecisions": false
        },
        "output": [
          "updatedBy"
        ],
        "subType": "userApprovalTask",
        "branches": [
          "true",
          "false"
        ],
        "displayName": "Approve the Automation's Proposal",
        "inputNamespaceMap": {
          "relatedEntity": "global"
        }
      },
      {
        "name": "SetAutomationProposalStatusToApproved",
        "type": "automatedTask",
        "input": [
          "relatedEntity",
          "updatedBy"
        ],
        "config": {
          "fieldName": "status",
          "fieldValue": "Approved"
        },
        "output": [],
        "subType": "setEntityAttributeTask",
        "displayName": "Set Proposal Status to 'Approved'",
        "inputNamespaceMap": {
          "updatedBy": "ApproveAutomationProposal",
          "relatedEntity": "global"
        }
      },
      {
        "name": "SetAutomationProposalStatusToRejected",
        "type": "automatedTask",
        "input": [
          "relatedEntity",
          "updatedBy"
        ],
        "config": {
          "fieldName": "status",
          "fieldValue": "Rejected"
        },
        "output": [],
        "subType": "setEntityAttributeTask",
        "displayName": "Set Proposal Status to 'Rejected'",
        "inputNamespaceMap": {
          "updatedBy": "ApproveAutomationProposal",
          "relatedEntity": "global"
        }
      },
      {
        "name": "AutomationProposalApprovedEnd",
        "type": "endEvent",
        "subType": "endEvent",
        "displayName": "Proposal Approved"
      },
      {
        "name": "AutomationProposalRejectedEnd",
        "type": "endEvent",
        "subType": "endEvent",
        "displayName": "Proposal Rejected"
      },
      {
        "name": "SetAutomationProposalUpdateStatusToInReview",
        "type": "automatedTask",
        "input": [
          "relatedEntity",
          "updatedBy"
        ],
        "config": {
          "fieldName": "status",
          "fieldValue": "In Review"
        },
        "output": [],
        "subType": "setEntityAttributeTask",
        "displayName": "Set Proposal Status to 'In Review' (Update)",
        "inputNamespaceMap": {
          "updatedBy": "global",
          "relatedEntity": "global"
        }
      },
      {
        "name": "ApproveAutomationProposalUpdate",
        "type": "userTask",
        "input": [
          "relatedEntity"
        ],
        "config": {
          "stageId": "review",
          "assignees": {
            "addOwners": false,
            "candidates": [],
            "addReviewers": true,
            "emptyAssigneeStrategy": "assignAdmins"
          },
          "taskStatus": "Open",
          "assigneeStrategy": "reviewers-and-assignees",
          "stageDisplayName": "Review",
          "approvalThreshold": 1,
          "rejectionThreshold": 1,
          "transitionMetadata": [
            {
              "id": "approve",
              "label": "Approve",
              "formRef": "approve",
              "targetStageId": "approved",
              "resolutionType": "Approved",
              "requiresComment": false,
              "targetTaskStatus": "Approved"
            },
            {
              "id": "reject",
              "label": "Reject",
              "formRef": "reject",
              "targetStageId": "rejected",
              "resolutionType": "Rejected",
              "requiresComment": true,
              "targetTaskStatus": "Rejected"
            }
          ],
          "allowPartialDecisions": false
        },
        "output": [
          "updatedBy"
        ],
        "subType": "userApprovalTask",
        "branches": [
          "true",
          "false"
        ],
        "displayName": "Review Changes to the Automation's Proposal",
        "inputNamespaceMap": {
          "relatedEntity": "global"
        }
      },
      {
        "name": "SetAutomationProposalUpdateStatusToApproved",
        "type": "automatedTask",
        "input": [
          "relatedEntity",
          "updatedBy"
        ],
        "config": {
          "fieldName": "status",
          "fieldValue": "Approved"
        },
        "output": [],
        "subType": "setEntityAttributeTask",
        "displayName": "Set Proposal Status to 'Approved' (After Review)",
        "inputNamespaceMap": {
          "updatedBy": "ApproveAutomationProposalUpdate",
          "relatedEntity": "global"
        }
      },
      {
        "name": "RollbackAutomationProposalChanges",
        "type": "automatedTask",
        "input": [
          "relatedEntity",
          "updatedBy"
        ],
        "config": {},
        "output": [],
        "subType": "rollbackEntityTask",
        "displayName": "Rollback Changes to the Proposal",
        "inputNamespaceMap": {
          "updatedBy": "ApproveAutomationProposalUpdate",
          "relatedEntity": "global"
        }
      },
      {
        "name": "AutomationProposalUpdateApprovedEnd",
        "type": "endEvent",
        "subType": "endEvent",
        "displayName": "Proposal Approved After Review"
      },
      {
        "name": "AutomationProposalUpdateRolledBackEnd",
        "type": "endEvent",
        "subType": "endEvent",
        "displayName": "Proposal Changes Rolled Back"
      }
    ],
    "edges": [
      {
        "to": "CheckIfGlossaryTermIsAutomationProposal",
        "from": "GlossaryTermCreated"
      },
      {
        "to": "SetGlossaryTermStatusToApproved",
        "from": "CheckGlossaryTermHasReviewers",
        "condition": "false"
      },
      {
        "to": "CheckIfGlossaryTermUpdatedByIsReviewer",
        "from": "CheckGlossaryTermHasReviewers",
        "condition": "true"
      },
      {
        "to": "SetGlossaryTermStatusToApprovedByReviewer",
        "from": "CheckIfGlossaryTermUpdatedByIsReviewer",
        "condition": "true"
      },
      {
        "to": "CheckGlossaryTermIsReadyToBeReviewed",
        "from": "CheckIfGlossaryTermUpdatedByIsReviewer",
        "condition": "false"
      },
      {
        "to": "AutoApprovedByReviewerEnd",
        "from": "SetGlossaryTermStatusToApprovedByReviewer"
      },
      {
        "to": "SetGlossaryTermStatusToDraft",
        "from": "CheckGlossaryTermIsReadyToBeReviewed",
        "condition": "false"
      },
      {
        "to": "DraftEnd",
        "from": "SetGlossaryTermStatusToDraft"
      },
      {
        "to": "CheckIfGlossaryTermIsNew",
        "from": "CheckGlossaryTermIsReadyToBeReviewed",
        "condition": "true"
      },
      {
        "to": "SetGlossaryTermStatusToInReview",
        "from": "CheckIfGlossaryTermIsNew",
        "condition": "true"
      },
      {
        "to": "SetGlossaryTermStatusToInReviewForUpdate",
        "from": "CheckIfGlossaryTermIsNew",
        "condition": "false"
      },
      {
        "to": "ApproveGlossaryTerm",
        "from": "SetGlossaryTermStatusToInReview"
      },
      {
        "to": "ApprovalForUpdates",
        "from": "SetGlossaryTermStatusToInReviewForUpdate"
      },
      {
        "to": "SetGlossaryTermStatusToApprovedAfterReview",
        "from": "ApprovalForUpdates",
        "condition": "approve"
      },
      {
        "to": "RollbackGlossaryTermChanges",
        "from": "ApprovalForUpdates",
        "condition": "reject"
      },
      {
        "to": "RollbackEnd",
        "from": "RollbackGlossaryTermChanges"
      },
      {
        "to": "ApprovalEnd",
        "from": "SetGlossaryTermStatusToApprovedAfterReview"
      },
      {
        "to": "SetGlossaryTermStatusToApprovedAfterApproval",
        "from": "ApproveGlossaryTerm",
        "condition": "approve"
      },
      {
        "to": "SetGlossaryTermStatusToRejected",
        "from": "ApproveGlossaryTerm",
        "condition": "reject"
      },
      {
        "to": "ApprovedEndAfterApproval",
        "from": "SetGlossaryTermStatusToApprovedAfterApproval"
      },
      {
        "to": "ApprovedEnd",
        "from": "SetGlossaryTermStatusToApproved"
      },
      {
        "to": "RejectedEnd",
        "from": "SetGlossaryTermStatusToRejected"
      },
      {
        "to": "SetAutomationProposalUpdateStatusToApproved",
        "from": "ApproveAutomationProposalUpdate",
        "condition": "approve"
      },
      {
        "to": "RollbackAutomationProposalChanges",
        "from": "ApproveAutomationProposalUpdate",
        "condition": "reject"
      },
      {
        "to": "SetAutomationProposalStatusToApprovedByReviewer",
        "from": "CheckIfAutomationProposalUpdatedByIsReviewer",
        "condition": "true"
      },
      {
        "to": "CheckIfAutomationProposalIsNew",
        "from": "CheckIfAutomationProposalUpdatedByIsReviewer",
        "condition": "false"
      },
      {
        "to": "AutomationProposalUpdateApprovedEnd",
        "from": "SetAutomationProposalUpdateStatusToApproved"
      },
      {
        "to": "CheckGlossaryTermHasReviewers",
        "from": "CheckIfGlossaryTermIsAutomationProposal",
        "condition": "false"
      },
      {
        "to": "CheckIfAutomationProposalUpdatedByIsReviewer",
        "from": "CheckIfGlossaryTermIsAutomationProposal",
        "condition": "true"
      },
      {
        "to": "AutomationProposalApprovedByReviewerEnd",
        "from": "SetAutomationProposalStatusToApprovedByReviewer"
      },
      {
        "to": "ApproveAutomationProposalUpdate",
        "from": "SetAutomationProposalUpdateStatusToInReview"
      },
      {
        "to": "SetAutomationProposalStatusToInReview",
        "from": "CheckIfAutomationProposalIsNew",
        "condition": "true"
      },
      {
        "to": "SetAutomationProposalUpdateStatusToInReview",
        "from": "CheckIfAutomationProposalIsNew",
        "condition": "false"
      },
      {
        "to": "AutomationProposalUpdateRolledBackEnd",
        "from": "RollbackAutomationProposalChanges"
      },
      {
        "to": "AutomationProposalApprovedEnd",
        "from": "SetAutomationProposalStatusToApproved"
      },
      {
        "to": "AutomationProposalRejectedEnd",
        "from": "SetAutomationProposalStatusToRejected"
      },
      {
        "to": "ApproveAutomationProposal",
        "from": "SetAutomationProposalStatusToInReview"
      },
      {
        "to": "SetAutomationProposalStatusToApproved",
        "from": "ApproveAutomationProposal",
        "condition": "approve"
      },
      {
        "to": "SetAutomationProposalStatusToRejected",
        "from": "ApproveAutomationProposal",
        "condition": "reject"
      }
    ],
    "config": {
      "storeStageStatus": true
    }
  },
  {
    "name": "IncidentLifecycleWorkflow",
    "displayName": "Incident Lifecycle Workflow",
    "description": "Default workflow definition for incident lifecycle management.",
    "trigger": {
      "type": "noOp",
      "config": {},
      "output": [
        "relatedEntity",
        "updatedBy"
      ]
    },
    "nodes": [
      {
        "name": "IncidentStart",
        "type": "startEvent",
        "subType": "startEvent",
        "displayName": "Incident Start"
      },
      {
        "name": "NewStage",
        "type": "userTask",
        "input": [
          "relatedEntity"
        ],
        "config": {
          "stageId": "new",
          "assignees": {
            "addOwners": true,
            "candidates": [],
            "addReviewers": true,
            "emptyAssigneeStrategy": "none"
          },
          "taskStatus": "Open",
          "assigneeStrategy": "owners-and-assignees",
          "stageDisplayName": "New",
          "approvalThreshold": 1,
          "rejectionThreshold": 1,
          "transitionMetadata": [
            {
              "id": "ack",
              "label": "Acknowledge",
              "targetStageId": "ack",
              "requiresComment": false,
              "targetTaskStatus": "InProgress"
            },
            {
              "id": "assign",
              "label": "Assign",
              "targetStageId": "assigned",
              "requiresComment": false,
              "targetTaskStatus": "InProgress"
            },
            {
              "id": "resolve",
              "label": "Resolve",
              "formRef": "resolve",
              "targetStageId": "resolved",
              "resolutionType": "Completed",
              "requiresComment": true,
              "targetTaskStatus": "Completed"
            }
          ],
          "allowPartialDecisions": false
        },
        "output": [
          "updatedBy"
        ],
        "subType": "userApprovalTask",
        "branches": [
          "true",
          "false"
        ],
        "displayName": "New",
        "inputNamespaceMap": {
          "relatedEntity": "global"
        }
      },
      {
        "name": "AckStage",
        "type": "userTask",
        "input": [
          "relatedEntity"
        ],
        "config": {
          "stageId": "ack",
          "assignees": {
            "addOwners": true,
            "candidates": [],
            "addReviewers": true,
            "emptyAssigneeStrategy": "none"
          },
          "taskStatus": "InProgress",
          "assigneeStrategy": "owners-and-assignees",
          "stageDisplayName": "Acknowledged",
          "approvalThreshold": 1,
          "rejectionThreshold": 1,
          "transitionMetadata": [
            {
              "id": "assign",
              "label": "Assign",
              "targetStageId": "assigned",
              "requiresComment": false,
              "targetTaskStatus": "InProgress"
            },
            {
              "id": "resolve",
              "label": "Resolve",
              "formRef": "resolve",
              "targetStageId": "resolved",
              "resolutionType": "Completed",
              "requiresComment": true,
              "targetTaskStatus": "Completed"
            }
          ],
          "allowPartialDecisions": false
        },
        "output": [
          "updatedBy"
        ],
        "subType": "userApprovalTask",
        "branches": [
          "true",
          "false"
        ],
        "displayName": "Acknowledged",
        "inputNamespaceMap": {
          "relatedEntity": "global"
        }
      },
      {
        "name": "AssignedStage",
        "type": "userTask",
        "input": [
          "relatedEntity"
        ],
        "config": {
          "stageId": "assigned",
          "assignees": {
            "addOwners": true,
            "candidates": [],
            "addReviewers": true,
            "emptyAssigneeStrategy": "none"
          },
          "taskStatus": "InProgress",
          "assigneeStrategy": "owners-and-assignees",
          "stageDisplayName": "Assigned",
          "approvalThreshold": 1,
          "rejectionThreshold": 1,
          "transitionMetadata": [
            {
              "id": "reassign",
              "label": "Reassign",
              "targetStageId": "assigned",
              "requiresComment": false,
              "targetTaskStatus": "InProgress"
            },
            {
              "id": "resolve",
              "label": "Resolve",
              "formRef": "resolve",
              "targetStageId": "resolved",
              "resolutionType": "Completed",
              "requiresComment": true,
              "targetTaskStatus": "Completed"
            }
          ],
          "allowPartialDecisions": false
        },
        "output": [
          "updatedBy"
        ],
        "subType": "userApprovalTask",
        "branches": [
          "true",
          "false"
        ],
        "displayName": "Assigned",
        "inputNamespaceMap": {
          "relatedEntity": "global"
        }
      },
      {
        "name": "ResolvedEnd",
        "type": "endEvent",
        "subType": "endEvent",
        "displayName": "Resolved"
      }
    ],
    "edges": [
      {
        "to": "NewStage",
        "from": "IncidentStart"
      },
      {
        "to": "AckStage",
        "from": "NewStage",
        "condition": "ack"
      },
      {
        "to": "AssignedStage",
        "from": "NewStage",
        "condition": "assign"
      },
      {
        "to": "ResolvedEnd",
        "from": "NewStage",
        "condition": "resolve"
      },
      {
        "to": "AssignedStage",
        "from": "AckStage",
        "condition": "assign"
      },
      {
        "to": "ResolvedEnd",
        "from": "AckStage",
        "condition": "resolve"
      },
      {
        "to": "AssignedStage",
        "from": "AssignedStage",
        "condition": "reassign"
      },
      {
        "to": "ResolvedEnd",
        "from": "AssignedStage",
        "condition": "resolve"
      }
    ],
    "config": {
      "storeStageStatus": true
    }
  },
  {
    "name": "IncidentResolutionTaskWorkflow",
    "displayName": "Incident Resolution Task Workflow",
    "description": "Default workflow-driven lifecycle for incident resolution tasks. Stages mirror the incident manager flow: New, Acknowledged, Assigned.",
    "trigger": {
      "type": "noOp",
      "config": {},
      "output": [
        "relatedEntity",
        "updatedBy"
      ]
    },
    "nodes": [
      {
        "name": "IncidentStart",
        "type": "startEvent",
        "subType": "startEvent",
        "displayName": "Incident Start"
      },
      {
        "name": "NewStage",
        "type": "userTask",
        "input": [
          "relatedEntity"
        ],
        "config": {
          "stageId": "new",
          "assignees": {
            "addOwners": true,
            "candidates": [],
            "addReviewers": true,
            "emptyAssigneeStrategy": "none"
          },
          "taskStatus": "Open",
          "assigneeStrategy": "owners-and-assignees",
          "stageDisplayName": "New",
          "approvalThreshold": 1,
          "rejectionThreshold": 1,
          "transitionMetadata": [
            {
              "id": "ack",
              "label": "Acknowledge",
              "targetStageId": "ack",
              "requiresComment": false,
              "targetTaskStatus": "InProgress"
            },
            {
              "id": "assign",
              "label": "Assign",
              "targetStageId": "assigned",
              "requiresComment": false,
              "targetTaskStatus": "InProgress"
            },
            {
              "id": "resolve",
              "label": "Resolve",
              "formRef": "resolve",
              "targetStageId": "resolved",
              "resolutionType": "Completed",
              "requiresComment": true,
              "targetTaskStatus": "Completed"
            }
          ],
          "allowPartialDecisions": false
        },
        "output": [
          "updatedBy"
        ],
        "subType": "userApprovalTask",
        "branches": [
          "true",
          "false"
        ],
        "displayName": "New",
        "inputNamespaceMap": {
          "relatedEntity": "global"
        }
      },
      {
        "name": "AckStage",
        "type": "userTask",
        "input": [
          "relatedEntity"
        ],
        "config": {
          "stageId": "ack",
          "assignees": {
            "addOwners": true,
            "candidates": [],
            "addReviewers": true,
            "emptyAssigneeStrategy": "none"
          },
          "taskStatus": "InProgress",
          "assigneeStrategy": "owners-and-assignees",
          "stageDisplayName": "Acknowledged",
          "approvalThreshold": 1,
          "rejectionThreshold": 1,
          "transitionMetadata": [
            {
              "id": "assign",
              "label": "Assign",
              "targetStageId": "assigned",
              "requiresComment": false,
              "targetTaskStatus": "InProgress"
            },
            {
              "id": "resolve",
              "label": "Resolve",
              "formRef": "resolve",
              "targetStageId": "resolved",
              "resolutionType": "Completed",
              "requiresComment": true,
              "targetTaskStatus": "Completed"
            }
          ],
          "allowPartialDecisions": false
        },
        "output": [
          "updatedBy"
        ],
        "subType": "userApprovalTask",
        "branches": [
          "true",
          "false"
        ],
        "displayName": "Acknowledged",
        "inputNamespaceMap": {
          "relatedEntity": "global"
        }
      },
      {
        "name": "AssignedStage",
        "type": "userTask",
        "input": [
          "relatedEntity"
        ],
        "config": {
          "stageId": "assigned",
          "assignees": {
            "addOwners": true,
            "candidates": [],
            "addReviewers": true,
            "emptyAssigneeStrategy": "none"
          },
          "taskStatus": "InProgress",
          "assigneeStrategy": "owners-and-assignees",
          "stageDisplayName": "Assigned",
          "approvalThreshold": 1,
          "rejectionThreshold": 1,
          "transitionMetadata": [
            {
              "id": "reassign",
              "label": "Reassign",
              "targetStageId": "assigned",
              "requiresComment": false,
              "targetTaskStatus": "InProgress"
            },
            {
              "id": "resolve",
              "label": "Resolve",
              "formRef": "resolve",
              "targetStageId": "resolved",
              "resolutionType": "Completed",
              "requiresComment": true,
              "targetTaskStatus": "Completed"
            }
          ],
          "allowPartialDecisions": false
        },
        "output": [
          "updatedBy"
        ],
        "subType": "userApprovalTask",
        "branches": [
          "true",
          "false"
        ],
        "displayName": "Assigned",
        "inputNamespaceMap": {
          "relatedEntity": "global"
        }
      },
      {
        "name": "ResolvedEnd",
        "type": "endEvent",
        "subType": "endEvent",
        "displayName": "Resolved"
      }
    ],
    "edges": [
      {
        "to": "NewStage",
        "from": "IncidentStart"
      },
      {
        "to": "AckStage",
        "from": "NewStage",
        "condition": "ack"
      },
      {
        "to": "AssignedStage",
        "from": "NewStage",
        "condition": "assign"
      },
      {
        "to": "ResolvedEnd",
        "from": "NewStage",
        "condition": "resolve"
      },
      {
        "to": "AssignedStage",
        "from": "AckStage",
        "condition": "assign"
      },
      {
        "to": "ResolvedEnd",
        "from": "AckStage",
        "condition": "resolve"
      },
      {
        "to": "AssignedStage",
        "from": "AssignedStage",
        "condition": "reassign"
      },
      {
        "to": "ResolvedEnd",
        "from": "AssignedStage",
        "condition": "resolve"
      }
    ],
    "config": {
      "storeStageStatus": true
    }
  },
  {
    "name": "MetricApprovalWorkflow",
    "displayName": "Metric Approval Workflow",
    "description": "When a Metric is Created or Updated, this Workflow will be triggered for the Metric to be Approved.",
    "trigger": {
      "type": "eventBasedEntity",
      "config": {
        "events": [
          "Created",
          "Updated"
        ],
        "filter": {},
        "exclude": [
          "entityStatus"
        ],
        "include": [],
        "entityTypes": [
          "metric"
        ],
        "approvalMode": "Default"
      },
      "output": [
        "relatedEntity",
        "updatedBy"
      ]
    },
    "nodes": [
      {
        "name": "MetricCreated",
        "type": "startEvent",
        "subType": "startEvent",
        "displayName": "Metric Created or Updated"
      },
      {
        "name": "AutoApprovedByReviewerEnd",
        "type": "endEvent",
        "subType": "endEvent",
        "displayName": "Auto-Approved by Reviewer"
      },
      {
        "name": "ApprovedEnd",
        "type": "endEvent",
        "subType": "endEvent",
        "displayName": "Metric Status: Approved"
      },
      {
        "name": "ApprovedEndAfterApproval",
        "type": "endEvent",
        "subType": "endEvent",
        "displayName": "Metric Status: Approved"
      },
      {
        "name": "RejectedEnd",
        "type": "endEvent",
        "subType": "endEvent",
        "displayName": "Metric Status: Rejected"
      },
      {
        "name": "DraftEnd",
        "type": "endEvent",
        "subType": "endEvent",
        "displayName": "Metric Status: Draft"
      },
      {
        "name": "CheckIfMetricUpdatedByIsReviewer",
        "type": "automatedTask",
        "input": [
          "relatedEntity"
        ],
        "config": {
          "rules": "{\\"and\\":[{\\"isReviewer\\":{\\"var\\":\\"updatedBy\\"}}]}"
        },
        "subType": "checkEntityAttributesTask",
        "branches": [
          "true",
          "false"
        ],
        "displayName": "Check if Metric Updated By is Reviewer",
        "inputNamespaceMap": {
          "relatedEntity": "global"
        }
      },
      {
        "name": "SetMetricStatusToApprovedByReviewer",
        "type": "automatedTask",
        "input": [
          "relatedEntity",
          "updatedBy"
        ],
        "config": {
          "fieldName": "status",
          "fieldValue": "Approved"
        },
        "output": [],
        "subType": "setEntityAttributeTask",
        "displayName": "Set Status to 'Approved' (By Reviewer)",
        "inputNamespaceMap": {
          "updatedBy": "global",
          "relatedEntity": "global"
        }
      },
      {
        "name": "CheckMetricHasReviewers",
        "type": "automatedTask",
        "input": [
          "relatedEntity"
        ],
        "config": {
          "rules": "{\\"and\\":[{\\"some\\":[{\\"var\\":\\"reviewers\\"},{\\"!=\\":[{\\"var\\":\\"fullyQualifiedName\\"},null]}]}]}"
        },
        "subType": "checkEntityAttributesTask",
        "branches": [
          "true",
          "false"
        ],
        "displayName": "Check if Metric has Reviewers",
        "inputNamespaceMap": {
          "relatedEntity": "global"
        }
      },
      {
        "name": "CheckMetricIsReadyToBeReviewed",
        "type": "automatedTask",
        "input": [
          "relatedEntity"
        ],
        "config": {
          "rules": "{\\"and\\":[{\\"!!\\":[{\\"var\\":\\"description\\"}]}]}"
        },
        "subType": "checkEntityAttributesTask",
        "branches": [
          "true",
          "false"
        ],
        "displayName": "Check if Metric is Ready to be Reviewed",
        "inputNamespaceMap": {
          "relatedEntity": "global"
        }
      },
      {
        "name": "SetMetricStatusToInReview",
        "type": "automatedTask",
        "input": [
          "relatedEntity",
          "updatedBy"
        ],
        "config": {
          "fieldName": "status",
          "fieldValue": "In Review"
        },
        "output": [],
        "subType": "setEntityAttributeTask",
        "displayName": "Set Status to 'In Review'",
        "inputNamespaceMap": {
          "relatedEntity": "global"
        }
      },
      {
        "name": "SetMetricStatusToDraft",
        "type": "automatedTask",
        "input": [
          "relatedEntity",
          "updatedBy"
        ],
        "config": {
          "fieldName": "status",
          "fieldValue": "Draft"
        },
        "output": [],
        "subType": "setEntityAttributeTask",
        "displayName": "Set Status to 'Draft'",
        "inputNamespaceMap": {
          "relatedEntity": "global"
        }
      },
      {
        "name": "ApproveMetric",
        "type": "userTask",
        "input": [
          "relatedEntity"
        ],
        "config": {
          "stageId": "review",
          "assignees": {
            "addOwners": false,
            "candidates": [],
            "addReviewers": true,
            "emptyAssigneeStrategy": "none"
          },
          "taskStatus": "Open",
          "assigneeStrategy": "reviewers-and-assignees",
          "stageDisplayName": "Review",
          "approvalThreshold": 1,
          "rejectionThreshold": 1,
          "transitionMetadata": [
            {
              "id": "approve",
              "label": "Approve",
              "formRef": "approve",
              "targetStageId": "approved",
              "resolutionType": "Approved",
              "requiresComment": false,
              "targetTaskStatus": "Approved"
            },
            {
              "id": "reject",
              "label": "Reject",
              "formRef": "reject",
              "targetStageId": "rejected",
              "resolutionType": "Rejected",
              "requiresComment": true,
              "targetTaskStatus": "Rejected"
            }
          ],
          "allowPartialDecisions": false
        },
        "output": [
          "updatedBy"
        ],
        "subType": "userApprovalTask",
        "branches": [
          "true",
          "false"
        ],
        "displayName": "Create User Approval Task",
        "inputNamespaceMap": {
          "relatedEntity": "global"
        }
      },
      {
        "name": "CheckIfMetricIsNew",
        "type": "automatedTask",
        "input": [
          "relatedEntity"
        ],
        "config": {
          "rules": "{\\"and\\":[{\\"==\\":[{\\"var\\":\\"version\\"},0.1]}]}"
        },
        "subType": "checkEntityAttributesTask",
        "branches": [
          "true",
          "false"
        ],
        "displayName": "Check if Metric is New",
        "inputNamespaceMap": {
          "relatedEntity": "global"
        }
      },
      {
        "name": "SetMetricStatusToInReviewForUpdate",
        "type": "automatedTask",
        "input": [
          "relatedEntity",
          "updatedBy"
        ],
        "config": {
          "fieldName": "status",
          "fieldValue": "In Review"
        },
        "output": [],
        "subType": "setEntityAttributeTask",
        "displayName": "Set Status to 'In Review' (Update)",
        "inputNamespaceMap": {
          "updatedBy": "global",
          "relatedEntity": "global"
        }
      },
      {
        "name": "ApprovalForUpdates",
        "type": "userTask",
        "input": [
          "relatedEntity"
        ],
        "config": {
          "stageId": "review",
          "assignees": {
            "addOwners": false,
            "candidates": [],
            "addReviewers": true,
            "emptyAssigneeStrategy": "none"
          },
          "taskStatus": "Open",
          "assigneeStrategy": "reviewers-and-assignees",
          "stageDisplayName": "Review",
          "approvalThreshold": 1,
          "rejectionThreshold": 1,
          "transitionMetadata": [
            {
              "id": "approve",
              "label": "Approve",
              "formRef": "approve",
              "targetStageId": "approved",
              "resolutionType": "Approved",
              "requiresComment": false,
              "targetTaskStatus": "Approved"
            },
            {
              "id": "reject",
              "label": "Reject",
              "formRef": "reject",
              "targetStageId": "rejected",
              "resolutionType": "Rejected",
              "requiresComment": true,
              "targetTaskStatus": "Rejected"
            }
          ],
          "allowPartialDecisions": false
        },
        "output": [
          "updatedBy"
        ],
        "subType": "userApprovalTask",
        "branches": [
          "true",
          "false"
        ],
        "displayName": "Review Changes for Updates",
        "inputNamespaceMap": {
          "relatedEntity": "global"
        }
      },
      {
        "name": "RollbackMetricChanges",
        "type": "automatedTask",
        "input": [
          "relatedEntity",
          "updatedBy"
        ],
        "config": {},
        "output": [],
        "subType": "rollbackEntityTask",
        "displayName": "Rollback or Reject Metric Changes",
        "inputNamespaceMap": {
          "updatedBy": "ApprovalForUpdates",
          "relatedEntity": "global"
        }
      },
      {
        "name": "SetMetricStatusToApprovedAfterReview",
        "type": "automatedTask",
        "input": [
          "relatedEntity",
          "updatedBy"
        ],
        "config": {
          "fieldName": "status",
          "fieldValue": "Approved"
        },
        "output": [],
        "subType": "setEntityAttributeTask",
        "displayName": "Set Status to 'Approved' (After Review)",
        "inputNamespaceMap": {
          "updatedBy": "ApprovalForUpdates",
          "relatedEntity": "global"
        }
      },
      {
        "name": "RollbackEnd",
        "type": "endEvent",
        "subType": "endEvent",
        "displayName": "Changes Rejected or Rolled Back"
      },
      {
        "name": "ApprovalEnd",
        "type": "endEvent",
        "subType": "endEvent",
        "displayName": "Approved After Unified Review"
      },
      {
        "name": "SetMetricStatusToApprovedAfterApproval",
        "type": "automatedTask",
        "input": [
          "relatedEntity",
          "updatedBy"
        ],
        "config": {
          "fieldName": "status",
          "fieldValue": "Approved"
        },
        "output": [],
        "subType": "setEntityAttributeTask",
        "displayName": "Set Status to 'Approved'",
        "inputNamespaceMap": {
          "updatedBy": "ApproveMetric",
          "relatedEntity": "global"
        }
      },
      {
        "name": "SetMetricStatusToApproved",
        "type": "automatedTask",
        "input": [
          "relatedEntity",
          "updatedBy"
        ],
        "config": {
          "fieldName": "status",
          "fieldValue": "Approved"
        },
        "output": [],
        "subType": "setEntityAttributeTask",
        "displayName": "Set Status to 'Approved'",
        "inputNamespaceMap": {
          "relatedEntity": "global"
        }
      },
      {
        "name": "SetMetricStatusToRejected",
        "type": "automatedTask",
        "input": [
          "relatedEntity",
          "updatedBy"
        ],
        "config": {
          "fieldName": "status",
          "fieldValue": "Rejected"
        },
        "output": [],
        "subType": "setEntityAttributeTask",
        "displayName": "Set Status to 'Rejected'",
        "inputNamespaceMap": {
          "updatedBy": "ApproveMetric",
          "relatedEntity": "global"
        }
      }
    ],
    "edges": [
      {
        "to": "CheckMetricHasReviewers",
        "from": "MetricCreated"
      },
      {
        "to": "SetMetricStatusToApproved",
        "from": "CheckMetricHasReviewers",
        "condition": "false"
      },
      {
        "to": "CheckIfMetricUpdatedByIsReviewer",
        "from": "CheckMetricHasReviewers",
        "condition": "true"
      },
      {
        "to": "SetMetricStatusToApprovedByReviewer",
        "from": "CheckIfMetricUpdatedByIsReviewer",
        "condition": "true"
      },
      {
        "to": "CheckMetricIsReadyToBeReviewed",
        "from": "CheckIfMetricUpdatedByIsReviewer",
        "condition": "false"
      },
      {
        "to": "AutoApprovedByReviewerEnd",
        "from": "SetMetricStatusToApprovedByReviewer"
      },
      {
        "to": "SetMetricStatusToDraft",
        "from": "CheckMetricIsReadyToBeReviewed",
        "condition": "false"
      },
      {
        "to": "DraftEnd",
        "from": "SetMetricStatusToDraft"
      },
      {
        "to": "CheckIfMetricIsNew",
        "from": "CheckMetricIsReadyToBeReviewed",
        "condition": "true"
      },
      {
        "to": "SetMetricStatusToInReview",
        "from": "CheckIfMetricIsNew",
        "condition": "true"
      },
      {
        "to": "SetMetricStatusToInReviewForUpdate",
        "from": "CheckIfMetricIsNew",
        "condition": "false"
      },
      {
        "to": "ApproveMetric",
        "from": "SetMetricStatusToInReview"
      },
      {
        "to": "ApprovalForUpdates",
        "from": "SetMetricStatusToInReviewForUpdate"
      },
      {
        "to": "SetMetricStatusToApprovedAfterReview",
        "from": "ApprovalForUpdates",
        "condition": "approve"
      },
      {
        "to": "RollbackMetricChanges",
        "from": "ApprovalForUpdates",
        "condition": "reject"
      },
      {
        "to": "RollbackEnd",
        "from": "RollbackMetricChanges"
      },
      {
        "to": "ApprovalEnd",
        "from": "SetMetricStatusToApprovedAfterReview"
      },
      {
        "to": "SetMetricStatusToApprovedAfterApproval",
        "from": "ApproveMetric",
        "condition": "approve"
      },
      {
        "to": "SetMetricStatusToRejected",
        "from": "ApproveMetric",
        "condition": "reject"
      },
      {
        "to": "ApprovedEndAfterApproval",
        "from": "SetMetricStatusToApprovedAfterApproval"
      },
      {
        "to": "ApprovedEnd",
        "from": "SetMetricStatusToApproved"
      },
      {
        "to": "RejectedEnd",
        "from": "SetMetricStatusToRejected"
      }
    ],
    "config": {
      "storeStageStatus": true
    }
  },
  {
    "name": "OwnershipUpdateTaskWorkflow",
    "displayName": "Ownership Update Task Workflow",
    "description": "Default workflow-driven lifecycle for ownership update tasks.",
    "trigger": {
      "type": "noOp",
      "config": {},
      "output": [
        "relatedEntity",
        "updatedBy"
      ]
    },
    "nodes": [
      {
        "name": "TaskStart",
        "type": "startEvent",
        "subType": "startEvent",
        "displayName": "Task Start"
      },
      {
        "name": "TaskReview",
        "type": "userTask",
        "input": [
          "relatedEntity"
        ],
        "config": {
          "stageId": "review",
          "assignees": {
            "addOwners": false,
            "candidates": [],
            "addReviewers": true,
            "emptyAssigneeStrategy": "none"
          },
          "taskStatus": "Open",
          "assigneeStrategy": "reviewers-and-assignees",
          "stageDisplayName": "Review",
          "approvalThreshold": 1,
          "rejectionThreshold": 1,
          "transitionMetadata": [
            {
              "id": "approve",
              "label": "Approve",
              "formRef": "approve",
              "targetStageId": "approved",
              "resolutionType": "Approved",
              "requiresComment": false,
              "targetTaskStatus": "Approved"
            },
            {
              "id": "reject",
              "label": "Reject",
              "formRef": "reject",
              "targetStageId": "rejected",
              "resolutionType": "Rejected",
              "requiresComment": true,
              "targetTaskStatus": "Rejected"
            }
          ],
          "allowPartialDecisions": false
        },
        "output": [
          "updatedBy"
        ],
        "subType": "userApprovalTask",
        "branches": [
          "true",
          "false"
        ],
        "displayName": "Review Task",
        "inputNamespaceMap": {
          "relatedEntity": "global"
        }
      },
      {
        "name": "ApprovedEnd",
        "type": "endEvent",
        "subType": "endEvent",
        "displayName": "Approved"
      },
      {
        "name": "RejectedEnd",
        "type": "endEvent",
        "subType": "endEvent",
        "displayName": "Rejected"
      }
    ],
    "edges": [
      {
        "to": "TaskReview",
        "from": "TaskStart"
      },
      {
        "to": "ApprovedEnd",
        "from": "TaskReview",
        "condition": "approve"
      },
      {
        "to": "RejectedEnd",
        "from": "TaskReview",
        "condition": "reject"
      }
    ],
    "config": {
      "storeStageStatus": true
    }
  },
  {
    "name": "PipelineReviewTaskWorkflow",
    "displayName": "Pipeline Review Task Workflow",
    "description": "Default workflow-driven lifecycle for pipeline review tasks.",
    "trigger": {
      "type": "noOp",
      "config": {},
      "output": [
        "relatedEntity",
        "updatedBy"
      ]
    },
    "nodes": [
      {
        "name": "TaskStart",
        "type": "startEvent",
        "subType": "startEvent",
        "displayName": "Task Start"
      },
      {
        "name": "TaskReview",
        "type": "userTask",
        "input": [
          "relatedEntity"
        ],
        "config": {
          "stageId": "review",
          "assignees": {
            "addOwners": false,
            "candidates": [],
            "addReviewers": true,
            "emptyAssigneeStrategy": "none"
          },
          "taskStatus": "Open",
          "assigneeStrategy": "reviewers-and-assignees",
          "stageDisplayName": "Review",
          "approvalThreshold": 1,
          "rejectionThreshold": 1,
          "transitionMetadata": [
            {
              "id": "approve",
              "label": "Approve",
              "formRef": "approve",
              "targetStageId": "approved",
              "resolutionType": "Approved",
              "requiresComment": false,
              "targetTaskStatus": "Approved"
            },
            {
              "id": "reject",
              "label": "Reject",
              "formRef": "reject",
              "targetStageId": "rejected",
              "resolutionType": "Rejected",
              "requiresComment": true,
              "targetTaskStatus": "Rejected"
            }
          ],
          "allowPartialDecisions": false
        },
        "output": [
          "updatedBy"
        ],
        "subType": "userApprovalTask",
        "branches": [
          "true",
          "false"
        ],
        "displayName": "Review Task",
        "inputNamespaceMap": {
          "relatedEntity": "global"
        }
      },
      {
        "name": "ApprovedEnd",
        "type": "endEvent",
        "subType": "endEvent",
        "displayName": "Approved"
      },
      {
        "name": "RejectedEnd",
        "type": "endEvent",
        "subType": "endEvent",
        "displayName": "Rejected"
      }
    ],
    "edges": [
      {
        "to": "TaskReview",
        "from": "TaskStart"
      },
      {
        "to": "ApprovedEnd",
        "from": "TaskReview",
        "condition": "approve"
      },
      {
        "to": "RejectedEnd",
        "from": "TaskReview",
        "condition": "reject"
      }
    ],
    "config": {
      "storeStageStatus": true
    }
  },
  {
    "name": "RecognizerFeedbackReviewWorkflow",
    "displayName": "Recognizer Feedback Review Workflow",
    "description": "When feedback is submitted on auto-applied tags, check if tag has reviewers and either auto-apply or create approval task",
    "trigger": {
      "type": "eventBasedEntity",
      "config": {
        "events": [
          "Created",
          "Updated"
        ],
        "filter": {},
        "exclude": [
          "reviewers"
        ],
        "include": [],
        "entityTypes": [
          "recognizerFeedback"
        ],
        "approvalMode": "Default"
      },
      "output": [
        "relatedEntity",
        "updatedBy",
        "triggeringObjectId",
        "recognizerFeedback"
      ]
    },
    "nodes": [
      {
        "name": "FeedbackSubmitted",
        "type": "startEvent",
        "subType": "startEvent",
        "displayName": "Feedback Submitted"
      },
      {
        "name": "ReviewFeedback",
        "type": "userTask",
        "input": [
          "relatedEntity",
          "updatedBy",
          "triggeringObjectId",
          "recognizerFeedback"
        ],
        "config": {
          "assignees": {
            "addOwners": false,
            "candidates": [],
            "addReviewers": true
          },
          "approvalThreshold": 1,
          "rejectionThreshold": 1
        },
        "output": [
          "updatedBy"
        ],
        "subType": "createRecognizerFeedbackApprovalTask",
        "branches": [
          "true",
          "false"
        ],
        "displayName": "Review Recognizer Feedback",
        "inputNamespaceMap": {
          "updatedBy": "global",
          "relatedEntity": "global",
          "recognizerFeedback": "global",
          "triggeringObjectId": "global"
        }
      },
      {
        "name": "ApplyApprovedFeedback",
        "type": "automatedTask",
        "input": [
          "relatedEntity",
          "updatedBy",
          "triggeringObjectId",
          "recognizerFeedback"
        ],
        "output": [],
        "subType": "applyRecognizerFeedbackTask",
        "displayName": "Apply Feedback (Approved)",
        "inputNamespaceMap": {
          "updatedBy": "ReviewFeedback",
          "relatedEntity": "global",
          "recognizerFeedback": "global",
          "triggeringObjectId": "global"
        }
      },
      {
        "name": "RejectFeedback",
        "type": "automatedTask",
        "input": [
          "relatedEntity",
          "updatedBy",
          "triggeringObjectId",
          "recognizerFeedback"
        ],
        "output": [],
        "subType": "rejectRecognizerFeedbackTask",
        "displayName": "Reject Feedback",
        "inputNamespaceMap": {
          "updatedBy": "ReviewFeedback",
          "relatedEntity": "global",
          "recognizerFeedback": "global",
          "triggeringObjectId": "global"
        }
      },
      {
        "name": "FeedbackApplied",
        "type": "endEvent",
        "subType": "endEvent",
        "displayName": "Feedback Applied"
      },
      {
        "name": "FeedbackRejected",
        "type": "endEvent",
        "subType": "endEvent",
        "displayName": "Feedback Rejected"
      }
    ],
    "edges": [
      {
        "to": "ReviewFeedback",
        "from": "FeedbackSubmitted"
      },
      {
        "to": "ApplyApprovedFeedback",
        "from": "ReviewFeedback",
        "condition": "approve"
      },
      {
        "to": "RejectFeedback",
        "from": "ReviewFeedback",
        "condition": "reject"
      },
      {
        "to": "FeedbackApplied",
        "from": "ApplyApprovedFeedback"
      },
      {
        "to": "FeedbackRejected",
        "from": "RejectFeedback"
      }
    ],
    "config": {
      "storeStageStatus": true
    }
  },
  {
    "name": "RequestApprovalTaskWorkflow",
    "displayName": "Request Approval Task Workflow",
    "description": "Default workflow-driven lifecycle for approval request tasks.",
    "trigger": {
      "type": "noOp",
      "config": {},
      "output": [
        "relatedEntity",
        "updatedBy"
      ]
    },
    "nodes": [
      {
        "name": "TaskStart",
        "type": "startEvent",
        "subType": "startEvent",
        "displayName": "Task Start"
      },
      {
        "name": "TaskReview",
        "type": "userTask",
        "input": [
          "relatedEntity"
        ],
        "config": {
          "stageId": "review",
          "assignees": {
            "addOwners": false,
            "candidates": [],
            "addReviewers": true,
            "emptyAssigneeStrategy": "none"
          },
          "taskStatus": "Open",
          "assigneeStrategy": "reviewers-and-assignees",
          "stageDisplayName": "Review",
          "approvalThreshold": 1,
          "rejectionThreshold": 1,
          "transitionMetadata": [
            {
              "id": "approve",
              "label": "Approve",
              "formRef": "approve",
              "targetStageId": "approved",
              "resolutionType": "Approved",
              "requiresComment": false,
              "targetTaskStatus": "Approved"
            },
            {
              "id": "reject",
              "label": "Reject",
              "formRef": "reject",
              "targetStageId": "rejected",
              "resolutionType": "Rejected",
              "requiresComment": true,
              "targetTaskStatus": "Rejected"
            }
          ],
          "allowPartialDecisions": false
        },
        "output": [
          "updatedBy"
        ],
        "subType": "userApprovalTask",
        "branches": [
          "true",
          "false"
        ],
        "displayName": "Review Task",
        "inputNamespaceMap": {
          "relatedEntity": "global"
        }
      },
      {
        "name": "ApprovedEnd",
        "type": "endEvent",
        "subType": "endEvent",
        "displayName": "Approved"
      },
      {
        "name": "RejectedEnd",
        "type": "endEvent",
        "subType": "endEvent",
        "displayName": "Rejected"
      }
    ],
    "edges": [
      {
        "to": "TaskReview",
        "from": "TaskStart"
      },
      {
        "to": "ApprovedEnd",
        "from": "TaskReview",
        "condition": "approve"
      },
      {
        "to": "RejectedEnd",
        "from": "TaskReview",
        "condition": "reject"
      }
    ],
    "config": {
      "storeStageStatus": true
    }
  },
  {
    "name": "SuggestionTaskWorkflow",
    "displayName": "Suggestion Task Workflow",
    "description": "Default workflow-driven lifecycle for suggestion tasks.",
    "trigger": {
      "type": "noOp",
      "config": {},
      "output": [
        "relatedEntity",
        "updatedBy"
      ]
    },
    "nodes": [
      {
        "name": "TaskStart",
        "type": "startEvent",
        "subType": "startEvent",
        "displayName": "Task Start"
      },
      {
        "name": "TaskReview",
        "type": "userTask",
        "input": [
          "relatedEntity"
        ],
        "config": {
          "stageId": "review",
          "assignees": {
            "addOwners": false,
            "candidates": [],
            "addReviewers": true,
            "emptyAssigneeStrategy": "none"
          },
          "taskStatus": "Open",
          "assigneeStrategy": "reviewers-and-assignees",
          "stageDisplayName": "Review",
          "approvalThreshold": 1,
          "rejectionThreshold": 1,
          "transitionMetadata": [
            {
              "id": "approve",
              "label": "Approve",
              "formRef": "approve",
              "targetStageId": "approved",
              "resolutionType": "Approved",
              "requiresComment": false,
              "targetTaskStatus": "Approved"
            },
            {
              "id": "reject",
              "label": "Reject",
              "formRef": "reject",
              "targetStageId": "rejected",
              "resolutionType": "Rejected",
              "requiresComment": true,
              "targetTaskStatus": "Rejected"
            }
          ],
          "allowPartialDecisions": false
        },
        "output": [
          "updatedBy"
        ],
        "subType": "userApprovalTask",
        "branches": [
          "true",
          "false"
        ],
        "displayName": "Review Task",
        "inputNamespaceMap": {
          "relatedEntity": "global"
        }
      },
      {
        "name": "ApprovedEnd",
        "type": "endEvent",
        "subType": "endEvent",
        "displayName": "Approved"
      },
      {
        "name": "RejectedEnd",
        "type": "endEvent",
        "subType": "endEvent",
        "displayName": "Rejected"
      }
    ],
    "edges": [
      {
        "to": "TaskReview",
        "from": "TaskStart"
      },
      {
        "to": "ApprovedEnd",
        "from": "TaskReview",
        "condition": "approve"
      },
      {
        "to": "RejectedEnd",
        "from": "TaskReview",
        "condition": "reject"
      }
    ],
    "config": {
      "storeStageStatus": true
    }
  },
  {
    "name": "TagUpdateTaskWorkflow",
    "displayName": "Tag Update Task Workflow",
    "description": "Default workflow-driven lifecycle for tag update tasks.",
    "trigger": {
      "type": "noOp",
      "config": {},
      "output": [
        "relatedEntity",
        "updatedBy"
      ]
    },
    "nodes": [
      {
        "name": "TaskStart",
        "type": "startEvent",
        "subType": "startEvent",
        "displayName": "Task Start"
      },
      {
        "name": "TaskReview",
        "type": "userTask",
        "input": [
          "relatedEntity"
        ],
        "config": {
          "stageId": "review",
          "assignees": {
            "addOwners": false,
            "candidates": [],
            "addReviewers": true,
            "emptyAssigneeStrategy": "none"
          },
          "taskStatus": "Open",
          "assigneeStrategy": "reviewers-and-assignees",
          "stageDisplayName": "Review",
          "approvalThreshold": 1,
          "rejectionThreshold": 1,
          "transitionMetadata": [
            {
              "id": "approve",
              "label": "Approve",
              "formRef": "approve",
              "targetStageId": "approved",
              "resolutionType": "Approved",
              "requiresComment": false,
              "targetTaskStatus": "Approved"
            },
            {
              "id": "reject",
              "label": "Reject",
              "formRef": "reject",
              "targetStageId": "rejected",
              "resolutionType": "Rejected",
              "requiresComment": true,
              "targetTaskStatus": "Rejected"
            }
          ],
          "allowPartialDecisions": false
        },
        "output": [
          "updatedBy"
        ],
        "subType": "userApprovalTask",
        "branches": [
          "true",
          "false"
        ],
        "displayName": "Review Task",
        "inputNamespaceMap": {
          "relatedEntity": "global"
        }
      },
      {
        "name": "ApprovedEnd",
        "type": "endEvent",
        "subType": "endEvent",
        "displayName": "Approved"
      },
      {
        "name": "RejectedEnd",
        "type": "endEvent",
        "subType": "endEvent",
        "displayName": "Rejected"
      }
    ],
    "edges": [
      {
        "to": "TaskReview",
        "from": "TaskStart"
      },
      {
        "to": "ApprovedEnd",
        "from": "TaskReview",
        "condition": "approve"
      },
      {
        "to": "RejectedEnd",
        "from": "TaskReview",
        "condition": "reject"
      }
    ],
    "config": {
      "storeStageStatus": true
    }
  },
  {
    "name": "TestCaseResolutionTaskWorkflow",
    "displayName": "Test Case Resolution Task Workflow",
    "description": "Default workflow-driven lifecycle for test case resolution tasks. Stages mirror the incident manager flow: New, Acknowledged, Assigned.",
    "trigger": {
      "type": "noOp",
      "config": {},
      "output": [
        "relatedEntity",
        "updatedBy"
      ]
    },
    "nodes": [
      {
        "name": "IncidentStart",
        "type": "startEvent",
        "subType": "startEvent",
        "displayName": "Incident Start"
      },
      {
        "name": "NewStage",
        "type": "userTask",
        "input": [
          "relatedEntity"
        ],
        "config": {
          "stageId": "new",
          "assignees": {
            "addOwners": true,
            "candidates": [],
            "addReviewers": true,
            "emptyAssigneeStrategy": "none"
          },
          "taskStatus": "Open",
          "assigneeStrategy": "owners-and-assignees",
          "stageDisplayName": "New",
          "approvalThreshold": 1,
          "rejectionThreshold": 1,
          "transitionMetadata": [
            {
              "id": "ack",
              "label": "Acknowledge",
              "targetStageId": "ack",
              "requiresComment": false,
              "targetTaskStatus": "InProgress"
            },
            {
              "id": "assign",
              "label": "Assign",
              "targetStageId": "assigned",
              "requiresComment": false,
              "targetTaskStatus": "InProgress"
            },
            {
              "id": "resolve",
              "label": "Resolve",
              "formRef": "resolve",
              "targetStageId": "resolved",
              "resolutionType": "Completed",
              "requiresComment": true,
              "targetTaskStatus": "Completed"
            }
          ],
          "allowPartialDecisions": false
        },
        "output": [
          "updatedBy"
        ],
        "subType": "userApprovalTask",
        "branches": [
          "true",
          "false"
        ],
        "displayName": "New",
        "inputNamespaceMap": {
          "relatedEntity": "global"
        }
      },
      {
        "name": "AckStage",
        "type": "userTask",
        "input": [
          "relatedEntity"
        ],
        "config": {
          "stageId": "ack",
          "assignees": {
            "addOwners": true,
            "candidates": [],
            "addReviewers": true,
            "emptyAssigneeStrategy": "none"
          },
          "taskStatus": "InProgress",
          "assigneeStrategy": "owners-and-assignees",
          "stageDisplayName": "Acknowledged",
          "approvalThreshold": 1,
          "rejectionThreshold": 1,
          "transitionMetadata": [
            {
              "id": "new",
              "label": "New",
              "targetStageId": "new",
              "requiresComment": false,
              "targetTaskStatus": "Open"
            },
            {
              "id": "assign",
              "label": "Assign",
              "targetStageId": "assigned",
              "requiresComment": false,
              "targetTaskStatus": "InProgress"
            },
            {
              "id": "resolve",
              "label": "Resolve",
              "formRef": "resolve",
              "targetStageId": "resolved",
              "resolutionType": "Completed",
              "requiresComment": true,
              "targetTaskStatus": "Completed"
            }
          ],
          "allowPartialDecisions": false
        },
        "output": [
          "updatedBy"
        ],
        "subType": "userApprovalTask",
        "branches": [
          "true",
          "false"
        ],
        "displayName": "Acknowledged",
        "inputNamespaceMap": {
          "relatedEntity": "global"
        }
      },
      {
        "name": "AssignedStage",
        "type": "userTask",
        "input": [
          "relatedEntity"
        ],
        "config": {
          "stageId": "assigned",
          "assignees": {
            "addOwners": true,
            "candidates": [],
            "addReviewers": true,
            "emptyAssigneeStrategy": "none"
          },
          "taskStatus": "InProgress",
          "assigneeStrategy": "owners-and-assignees",
          "stageDisplayName": "Assigned",
          "approvalThreshold": 1,
          "rejectionThreshold": 1,
          "transitionMetadata": [
            {
              "id": "reassign",
              "label": "Reassign",
              "targetStageId": "assigned",
              "requiresComment": false,
              "targetTaskStatus": "InProgress"
            },
            {
              "id": "resolve",
              "label": "Resolve",
              "formRef": "resolve",
              "targetStageId": "resolved",
              "resolutionType": "Completed",
              "requiresComment": true,
              "targetTaskStatus": "Completed"
            }
          ],
          "allowPartialDecisions": false
        },
        "output": [
          "updatedBy"
        ],
        "subType": "userApprovalTask",
        "branches": [
          "true",
          "false"
        ],
        "displayName": "Assigned",
        "inputNamespaceMap": {
          "relatedEntity": "global"
        }
      },
      {
        "name": "ResolvedEnd",
        "type": "endEvent",
        "subType": "endEvent",
        "displayName": "Resolved"
      }
    ],
    "edges": [
      {
        "to": "NewStage",
        "from": "IncidentStart"
      },
      {
        "to": "AckStage",
        "from": "NewStage",
        "condition": "ack"
      },
      {
        "to": "AssignedStage",
        "from": "NewStage",
        "condition": "assign"
      },
      {
        "to": "ResolvedEnd",
        "from": "NewStage",
        "condition": "resolve"
      },
      {
        "to": "NewStage",
        "from": "AckStage",
        "condition": "new"
      },
      {
        "to": "AssignedStage",
        "from": "AckStage",
        "condition": "assign"
      },
      {
        "to": "ResolvedEnd",
        "from": "AckStage",
        "condition": "resolve"
      },
      {
        "to": "AssignedStage",
        "from": "AssignedStage",
        "condition": "reassign"
      },
      {
        "to": "ResolvedEnd",
        "from": "AssignedStage",
        "condition": "resolve"
      }
    ],
    "config": {
      "storeStageStatus": true
    }
  },
  {
    "name": "TierUpdateTaskWorkflow",
    "displayName": "Tier Update Task Workflow",
    "description": "Default workflow-driven lifecycle for tier update tasks.",
    "trigger": {
      "type": "noOp",
      "config": {},
      "output": [
        "relatedEntity",
        "updatedBy"
      ]
    },
    "nodes": [
      {
        "name": "TaskStart",
        "type": "startEvent",
        "subType": "startEvent",
        "displayName": "Task Start"
      },
      {
        "name": "TaskReview",
        "type": "userTask",
        "input": [
          "relatedEntity"
        ],
        "config": {
          "stageId": "review",
          "assignees": {
            "addOwners": false,
            "candidates": [],
            "addReviewers": true,
            "emptyAssigneeStrategy": "none"
          },
          "taskStatus": "Open",
          "assigneeStrategy": "reviewers-and-assignees",
          "stageDisplayName": "Review",
          "approvalThreshold": 1,
          "rejectionThreshold": 1,
          "transitionMetadata": [
            {
              "id": "approve",
              "label": "Approve",
              "formRef": "approve",
              "targetStageId": "approved",
              "resolutionType": "Approved",
              "requiresComment": false,
              "targetTaskStatus": "Approved"
            },
            {
              "id": "reject",
              "label": "Reject",
              "formRef": "reject",
              "targetStageId": "rejected",
              "resolutionType": "Rejected",
              "requiresComment": true,
              "targetTaskStatus": "Rejected"
            }
          ],
          "allowPartialDecisions": false
        },
        "output": [
          "updatedBy"
        ],
        "subType": "userApprovalTask",
        "branches": [
          "true",
          "false"
        ],
        "displayName": "Review Task",
        "inputNamespaceMap": {
          "relatedEntity": "global"
        }
      },
      {
        "name": "ApprovedEnd",
        "type": "endEvent",
        "subType": "endEvent",
        "displayName": "Approved"
      },
      {
        "name": "RejectedEnd",
        "type": "endEvent",
        "subType": "endEvent",
        "displayName": "Rejected"
      }
    ],
    "edges": [
      {
        "to": "TaskReview",
        "from": "TaskStart"
      },
      {
        "to": "ApprovedEnd",
        "from": "TaskReview",
        "condition": "approve"
      },
      {
        "to": "RejectedEnd",
        "from": "TaskReview",
        "condition": "reject"
      }
    ],
    "config": {
      "storeStageStatus": true
    }
  },
  {
    "name": "seed_workflow",
    "description": "Seed workflow definition for live-pass verification.",
    "nodes": [],
    "edges": [],
    "config": {
      "storeStageStatus": false
    }
  }
]`;

export function liveWorkflowDefinitions(): WorkflowDefinitionFull[] {
  return JSON.parse(
    LIVE_WORKFLOW_DEFINITIONS_JSON,
  ) as WorkflowDefinitionFull[];
}
