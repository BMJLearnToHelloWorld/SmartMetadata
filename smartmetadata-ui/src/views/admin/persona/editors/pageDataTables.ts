// pageDataTables.ts — class-base data tables for the C-4 persona editors.
//
// Mechanical extraction from the official UI at pin a3012259ca (same-commit
// in-repo reference tree `openmetadata-ui/src/main/resources/ui/src/`):
// getDefaultLayout / getCommonWidgetList / getWidgetHeight / *TabsIds of the
// 23 class bases in utils/Customize*/ + CustomizePageDispatchUtils +
// constants/Customize.constants.ts (TAB_LABEL_MAP) + *DUMMY_DATA constants
// (header projection: id/name/displayName/fullyQualifiedName/description
// only — full dummy payloads are not needed by the edit-view preview).
// Regenerate by re-running the extraction against the reference tree and
// replacing this file; do not hand-edit values. Verified quirks preserved
// verbatim: Topic duplicates the KnowledgeArticle widget entry; Table has no
// displayName on its tabs; Glossary default layout children share y: 0.
// Table KNOWLEDGE_GRAPH (conditional on rdfEnabled) is excluded by design
// (see customizePageData.ts).
// Ruling (Bai 2026-11-18, F-3 R-EDIT-4 option (b)): the exclusion is accepted
// as default-equivalent — it equals the official flag-off default behavior
// (pin TableClassBase gates KNOWLEDGE_GRAPH on rdfEnabled, default false);
// recorded as a decided deviation. Wire the flag chain only if an rdf need appears.
//
// NOTE: values here are data, not behavior. Behavior lives in
// customizePageData.ts / gridLayoutUtils.ts.

export interface PageDataTable {
  heights: Record<string, number>;
  heightMap: Record<string, number>;
  heightFallback: number;
  layoutAppliesTo: string[];
  defaultLayout: Array<Record<string, unknown>>;
  /**
   * Per-tab default layouts, keyed by tab id, for page types whose
   * official `getDefaultLayout(tab)` returns a DIFFERENT non-empty
   * layout per mount tab. At pin 392b3efd only Container qualifies:
   * `utils/ContainerDetailsClassBase.ts:120-131` returns a single
   * CONTAINER_CHILDREN widget for CHILDREN and the LeftPanel layout
   * for SCHEMA/the default branch; every other class base returns one
   * layout for its single mount tab (and [] elsewhere). Tabs without
   * an entry here fall back to `defaultLayout`; `getDefaultWidgetForTab`
   * is the only reader, so the editor (via `getDefaultTabs`) and the
   * read-side default stay in step. This field is NOT extraction
   * output: the Container entry below is a hand-verified alignment
   * correction (the extraction flattened both tabs onto the SCHEMA
   * layout), pinned by `customizePageData.test.ts`; a re-extraction
   * must preserve or re-verify it, not silently drop it.
   */
  defaultLayoutByTab?: Record<string, Array<Record<string, unknown>>>;
  widgets: Array<{
    fqn: string;
    labelKey: string;
    gridSizes: string[];
  }>;
  tabs: Array<{
    id: string;
    editable: boolean;
    displayLabelKey: string | null;
  }>;
  dummy: Record<string, unknown>;
  file: string;
}

export const TAB_LABEL_MAP: Record<string, string> = 
{
  "overview": "label.overview",
  "glossary_terms": "label.glossary-term-plural",
  "assets": "label.asset-plural",
  "activity_feed": "label.activity-feed-and-task-plural",
  "custom_properties": "label.custom-property-plural",
  "terms": "label.term-plural",
  "review": "label.review",
  "schema": "label.schema",
  "sample_data": "label.sample-data",
  "table_queries": "label.query-plural",
  "profiler": "label.data-observability",
  "incidents": "label.incident-plural",
  "lineage": "label.lineage",
  "knowledge_graph": "label.knowledge-graph",
  "view_definition": "label.view-definition",
  "dbt": "label.dbt-lowercase",
  "children": "label.children",
  "details": "label.detail-plural",
  "subdomains": "label.sub-domain-plural",
  "data_products": "label.data-product-plural",
  "documentation": "label.documentation",
  "model": "label.model",
  "features": "label.feature-plural",
  "tasks": "label.task-plural",
  "config": "label.config",
  "executions": "label.execution-plural",
  "table": "label.table-plural",
  "test-cases": "label.test-case-plural",
  "pipeline": "label.pipeline",
  "data-model": "label.data-model",
  "agents": "label.agent-plural",
  "connection": "label.connection",
  "sql": "label.sql",
  "fields": "label.field-plural",
  "search-index-settings": "label.search-index-setting-plural",
  "stored_procedure": "label.stored-procedure-plural",
  "code": "label.code",
  "apiCollection": "label.api-collection",
  "apiEndpoint": "label.endpoint-plural",
  "schema_definition": "label.schema-definition",
  "expression": "label.expression",
  "dashboard": "label.dashboard",
  "insights": "label.insight-plural",
  "schemas": "label.schema-plural",
  "contract": "label.contract",
  "directories": "label.directory-plural",
  "worksheets": "label.worksheet-plural",
  "files": "label.file-plural",
  "spreadsheets": "label.spreadsheet-plural",
  "input_output_ports": "label.input-output-port-plural",
  "relations_graph": "label.relations-graph",
  "data_observability": "label.data-observability",
  "approval": "label.approval"
};

export const PAGE_DATA_TABLES: Record<string, PageDataTable> = 
{
  "Table": {
    "heights": {
      "KnowledgePanel.Description": 2,
      "KnowledgePanel.TableSchema": 8.5,
      "KnowledgePanel.FrequentlyJoinedTables": 2,
      "KnowledgePanel.DataProducts": 2,
      "KnowledgePanel.Tags": 2,
      "KnowledgePanel.GlossaryTerms": 2,
      "KnowledgePanel.CustomProperties": 4,
      "KnowledgePanel.KnowledgeArticle": 2,
      "KnowledgePanel.TableConstraints": 2,
      "KnowledgePanel.PartitionedKeys": 2,
      "KnowledgePanel.TableAliases": 2,
      "KnowledgePanel.AssetHealth": 3
    },
    "heightMap": {
      "KnowledgePanel.Description": 2,
      "KnowledgePanel.TableSchema": 8.5,
      "KnowledgePanel.FrequentlyJoinedTables": 2,
      "KnowledgePanel.DataProducts": 2,
      "KnowledgePanel.Tags": 2,
      "KnowledgePanel.GlossaryTerms": 2,
      "KnowledgePanel.CustomProperties": 4,
      "KnowledgePanel.KnowledgeArticle": 2,
      "KnowledgePanel.TableConstraints": 2,
      "KnowledgePanel.PartitionedKeys": 2,
      "KnowledgePanel.TableAliases": 2,
      "KnowledgePanel.AssetHealth": 3
    },
    "heightFallback": 1,
    "layoutAppliesTo": [
      "schema"
    ],
    "defaultLayout": [
      {
        "h": 11.0,
        "i": "KnowledgePanel.LeftPanel",
        "w": 6,
        "x": 0,
        "y": 0,
        "children": [
          {
            "h": 2,
            "i": "KnowledgePanel.Description",
            "w": 1,
            "x": 0,
            "y": 0,
            "static": false
          },
          {
            "h": 8.5,
            "i": "KnowledgePanel.TableSchema",
            "w": 1,
            "x": 0,
            "y": 1,
            "static": false
          }
        ],
        "static": true
      },
      {
        "h": 2,
        "i": "KnowledgePanel.FrequentlyJoinedTables",
        "w": 2,
        "x": 6,
        "y": 0,
        "static": false
      },
      {
        "h": 3,
        "i": "KnowledgePanel.AssetHealth",
        "w": 2,
        "x": 6,
        "y": 1,
        "static": false
      },
      {
        "h": 2,
        "i": "KnowledgePanel.DataProducts",
        "w": 2,
        "x": 6,
        "y": 2,
        "static": false
      },
      {
        "h": 2,
        "i": "KnowledgePanel.Tags",
        "w": 2,
        "x": 6,
        "y": 3,
        "static": false
      },
      {
        "h": 2,
        "i": "KnowledgePanel.GlossaryTerms",
        "w": 2,
        "x": 6,
        "y": 4,
        "static": false
      },
      {
        "h": 2,
        "i": "KnowledgePanel.KnowledgeArticle",
        "w": 2,
        "x": 6,
        "y": 5,
        "static": false
      },
      {
        "h": 4,
        "i": "KnowledgePanel.CustomProperties",
        "w": 2,
        "x": 6,
        "y": 6,
        "static": false
      },
      {
        "h": 2,
        "i": "KnowledgePanel.PartitionedKeys",
        "w": 2,
        "x": 6,
        "y": 7,
        "static": false
      },
      {
        "h": 2,
        "i": "KnowledgePanel.TableConstraints",
        "w": 2,
        "x": 6,
        "y": 8,
        "static": false
      },
      {
        "h": 2,
        "i": "KnowledgePanel.TableAliases",
        "w": 2,
        "x": 6,
        "y": 9,
        "static": false
      }
    ],
    "widgets": [
      {
        "fqn": "KnowledgePanel.Description",
        "labelKey": "label.description",
        "gridSizes": [
          "small",
          "large"
        ]
      },
      {
        "fqn": "KnowledgePanel.TableSchema",
        "labelKey": "label.schema",
        "gridSizes": [
          "large"
        ]
      },
      {
        "fqn": "KnowledgePanel.AssetHealth",
        "labelKey": "label.asset-health",
        "gridSizes": [
          "small"
        ]
      },
      {
        "fqn": "KnowledgePanel.DataProducts",
        "labelKey": "label.data-product-plural",
        "gridSizes": [
          "small"
        ]
      },
      {
        "fqn": "KnowledgePanel.Tags",
        "labelKey": "label.tag-plural",
        "gridSizes": [
          "small"
        ]
      },
      {
        "fqn": "KnowledgePanel.GlossaryTerms",
        "labelKey": "label.glossary-term-plural",
        "gridSizes": [
          "small"
        ]
      },
      {
        "fqn": "KnowledgePanel.FrequentlyJoinedTables",
        "labelKey": "label.frequently-joined-table-plural",
        "gridSizes": [
          "small"
        ]
      },
      {
        "fqn": "KnowledgePanel.TableConstraints",
        "labelKey": "label.table-constraints",
        "gridSizes": [
          "small"
        ]
      },
      {
        "fqn": "KnowledgePanel.PartitionedKeys",
        "labelKey": "label.table-partition-plural",
        "gridSizes": [
          "small"
        ]
      },
      {
        "fqn": "KnowledgePanel.TableAliases",
        "labelKey": "label.alias-plural",
        "gridSizes": [
          "small"
        ]
      },
      {
        "fqn": "KnowledgePanel.CustomProperties",
        "labelKey": "label.custom-property-plural",
        "gridSizes": [
          "small",
          "large"
        ]
      },
      {
        "fqn": "KnowledgePanel.KnowledgeArticle",
        "labelKey": "label.article-plural",
        "gridSizes": [
          "large"
        ]
      }
    ],
    "tabs": [
      {
        "id": "schema",
        "editable": true,
        "displayLabelKey": null
      },
      {
        "id": "activity_feed",
        "editable": false,
        "displayLabelKey": null
      },
      {
        "id": "sample_data",
        "editable": false,
        "displayLabelKey": null
      },
      {
        "id": "table_queries",
        "editable": false,
        "displayLabelKey": null
      },
      {
        "id": "profiler",
        "editable": false,
        "displayLabelKey": null
      },
      {
        "id": "lineage",
        "editable": false,
        "displayLabelKey": null
      },
      {
        "id": "dbt",
        "editable": false,
        "displayLabelKey": null
      },
      {
        "id": "view_definition",
        "editable": false,
        "displayLabelKey": null
      },
      {
        "id": "contract",
        "editable": false,
        "displayLabelKey": null
      },
      {
        "id": "custom_properties",
        "editable": false,
        "displayLabelKey": null
      }
    ],
    "dummy": {
      "id": "ab4f893b-c303-43d9-9375-3e620a670b02",
      "name": "raw_product_catalog",
      "fullyQualifiedName": "sample_data.ecommerce_db.shopify.raw_product_catalog",
      "description": "This is a raw product catalog table contains the product listing, price, seller etc.. represented in our online DB. "
    },
    "file": "utils/TableClassBase.ts"
  },
  "Topic": {
    "heights": {
      "KnowledgePanel.Description": 2,
      "KnowledgePanel.TopicSchema": 8,
      "KnowledgePanel.DataProducts": 2,
      "KnowledgePanel.Tags": 2,
      "KnowledgePanel.GlossaryTerms": 2,
      "KnowledgePanel.CustomProperties": 4,
      "KnowledgePanel.KnowledgeArticle": 2
    },
    "heightMap": {
      "KnowledgePanel.Description": 2,
      "KnowledgePanel.TopicSchema": 8,
      "KnowledgePanel.DataProducts": 2,
      "KnowledgePanel.Tags": 2,
      "KnowledgePanel.GlossaryTerms": 2,
      "KnowledgePanel.CustomProperties": 4
    },
    "heightFallback": 1,
    "layoutAppliesTo": [
      "schema"
    ],
    "defaultLayout": [
      {
        "h": 10.5,
        "i": "KnowledgePanel.LeftPanel",
        "w": 6,
        "x": 0,
        "y": 0,
        "children": [
          {
            "h": 2,
            "i": "KnowledgePanel.Description",
            "w": 1,
            "x": 0,
            "y": 0,
            "static": false
          },
          {
            "h": 8,
            "i": "KnowledgePanel.TopicSchema",
            "w": 1,
            "x": 0,
            "y": 1,
            "static": false
          }
        ],
        "static": true
      },
      {
        "h": 2,
        "i": "KnowledgePanel.DataProducts",
        "w": 2,
        "x": 6,
        "y": 1,
        "static": false
      },
      {
        "h": 2,
        "i": "KnowledgePanel.Tags",
        "w": 2,
        "x": 6,
        "y": 2,
        "static": false
      },
      {
        "h": 2,
        "i": "KnowledgePanel.GlossaryTerms",
        "w": 2,
        "x": 6,
        "y": 3,
        "static": false
      },
      {
        "h": 2,
        "i": "KnowledgePanel.KnowledgeArticle",
        "w": 2,
        "x": 6,
        "y": 5,
        "static": false
      },
      {
        "h": 4,
        "i": "KnowledgePanel.CustomProperties",
        "w": 2,
        "x": 6,
        "y": 6,
        "static": false
      }
    ],
    "widgets": [
      {
        "fqn": "KnowledgePanel.Description",
        "labelKey": "label.description",
        "gridSizes": [
          "small",
          "large"
        ]
      },
      {
        "fqn": "KnowledgePanel.TopicSchema",
        "labelKey": "label.schema",
        "gridSizes": [
          "large"
        ]
      },
      {
        "fqn": "KnowledgePanel.DataProducts",
        "labelKey": "label.data-product-plural",
        "gridSizes": [
          "small"
        ]
      },
      {
        "fqn": "KnowledgePanel.Tags",
        "labelKey": "label.tag-plural",
        "gridSizes": [
          "small"
        ]
      },
      {
        "fqn": "KnowledgePanel.GlossaryTerms",
        "labelKey": "label.glossary-term-plural",
        "gridSizes": [
          "small"
        ]
      },
      {
        "fqn": "KnowledgePanel.CustomProperties",
        "labelKey": "label.custom-property-plural",
        "gridSizes": [
          "small",
          "large"
        ]
      },
      {
        "fqn": "KnowledgePanel.KnowledgeArticle",
        "labelKey": "label.article-plural",
        "gridSizes": [
          "large"
        ]
      },
      {
        "fqn": "KnowledgePanel.KnowledgeArticle",
        "labelKey": "label.article-plural",
        "gridSizes": [
          "large"
        ]
      }
    ],
    "tabs": [
      {
        "id": "schema",
        "editable": true,
        "displayLabelKey": "TAB_LABEL_MAP"
      },
      {
        "id": "activity_feed",
        "editable": false,
        "displayLabelKey": "TAB_LABEL_MAP"
      },
      {
        "id": "sample_data",
        "editable": false,
        "displayLabelKey": "TAB_LABEL_MAP"
      },
      {
        "id": "config",
        "editable": false,
        "displayLabelKey": "TAB_LABEL_MAP"
      },
      {
        "id": "lineage",
        "editable": false,
        "displayLabelKey": "TAB_LABEL_MAP"
      },
      {
        "id": "contract",
        "editable": false,
        "displayLabelKey": "TAB_LABEL_MAP"
      },
      {
        "id": "custom_properties",
        "editable": false,
        "displayLabelKey": "TAB_LABEL_MAP"
      }
    ],
    "dummy": {
      "id": "d68d2e86-41cd-4c6c-bd78-41db489d46d1",
      "name": "address_book",
      "displayName": "sample_kafka",
      "fullyQualifiedName": "sample_kafka.address_book",
      "description": "All Protobuf record related events gets captured in this topic"
    },
    "file": "utils/TopicClassBase.ts"
  },
  "StoredProcedure": {
    "heights": {
      "KnowledgePanel.Description": 2,
      "KnowledgePanel.StoredProcedureCode": 6,
      "KnowledgePanel.DataProducts": 2,
      "KnowledgePanel.Tags": 2,
      "KnowledgePanel.GlossaryTerms": 2,
      "KnowledgePanel.CustomProperties": 4,
      "KnowledgePanel.KnowledgeArticle": 2
    },
    "heightMap": {
      "KnowledgePanel.Description": 2,
      "KnowledgePanel.TableSchema": 6,
      "KnowledgePanel.FrequentlyJoinedTables": 2,
      "KnowledgePanel.DataProducts": 2,
      "KnowledgePanel.Tags": 2,
      "KnowledgePanel.GlossaryTerms": 2,
      "KnowledgePanel.CustomProperties": 4
    },
    "heightFallback": 1,
    "layoutAppliesTo": [
      "code"
    ],
    "defaultLayout": [
      {
        "h": 8.5,
        "i": "KnowledgePanel.LeftPanel",
        "w": 6,
        "x": 0,
        "y": 0,
        "children": [
          {
            "h": 2,
            "i": "KnowledgePanel.Description",
            "w": 1,
            "x": 0,
            "y": 0,
            "static": false
          },
          {
            "h": 6,
            "i": "KnowledgePanel.StoredProcedureCode",
            "w": 1,
            "x": 0,
            "y": 1,
            "static": false
          }
        ],
        "static": true
      },
      {
        "h": 2,
        "i": "KnowledgePanel.DataProducts",
        "w": 2,
        "x": 6,
        "y": 1,
        "static": false
      },
      {
        "h": 2,
        "i": "KnowledgePanel.Tags",
        "w": 2,
        "x": 6,
        "y": 2,
        "static": false
      },
      {
        "h": 2,
        "i": "KnowledgePanel.GlossaryTerms",
        "w": 2,
        "x": 6,
        "y": 3,
        "static": false
      },
      {
        "h": 2,
        "i": "KnowledgePanel.KnowledgeArticle",
        "w": 2,
        "x": 6,
        "y": 5,
        "static": false
      },
      {
        "h": 4,
        "i": "KnowledgePanel.CustomProperties",
        "w": 2,
        "x": 6,
        "y": 6,
        "static": false
      }
    ],
    "widgets": [
      {
        "fqn": "KnowledgePanel.Description",
        "labelKey": "label.description",
        "gridSizes": [
          "small",
          "large"
        ]
      },
      {
        "fqn": "KnowledgePanel.StoredProcedureCode",
        "labelKey": "label.code",
        "gridSizes": [
          "large"
        ]
      },
      {
        "fqn": "KnowledgePanel.DataProducts",
        "labelKey": "label.data-product-plural",
        "gridSizes": [
          "small"
        ]
      },
      {
        "fqn": "KnowledgePanel.Tags",
        "labelKey": "label.tag-plural",
        "gridSizes": [
          "small"
        ]
      },
      {
        "fqn": "KnowledgePanel.GlossaryTerms",
        "labelKey": "label.glossary-term-plural",
        "gridSizes": [
          "small"
        ]
      },
      {
        "fqn": "KnowledgePanel.CustomProperties",
        "labelKey": "label.custom-property-plural",
        "gridSizes": [
          "small",
          "large"
        ]
      },
      {
        "fqn": "KnowledgePanel.KnowledgeArticle",
        "labelKey": "label.article-plural",
        "gridSizes": [
          "large"
        ]
      }
    ],
    "tabs": [
      {
        "id": "code",
        "editable": true,
        "displayLabelKey": "TAB_LABEL_MAP"
      },
      {
        "id": "activity_feed",
        "editable": false,
        "displayLabelKey": "TAB_LABEL_MAP"
      },
      {
        "id": "lineage",
        "editable": false,
        "displayLabelKey": "TAB_LABEL_MAP"
      },
      {
        "id": "contract",
        "editable": false,
        "displayLabelKey": "TAB_LABEL_MAP"
      },
      {
        "id": "custom_properties",
        "editable": false,
        "displayLabelKey": "TAB_LABEL_MAP"
      }
    ],
    "dummy": {
      "id": "5f3509ca-c8e5-449a-a7e8-b1c3b96e39e8",
      "name": "calculate_average",
      "fullyQualifiedName": "sample_data.ecommerce_db.shopify.calculate_average",
      "description": "Procedure to calculate average"
    },
    "file": "utils/StoredProcedureClassBase.ts"
  },
  "DashboardDataModel": {
    "heights": {
      "KnowledgePanel.Description": 2,
      "KnowledgePanel.DataModel": 6,
      "KnowledgePanel.DataProducts": 2,
      "KnowledgePanel.Tags": 2,
      "KnowledgePanel.GlossaryTerms": 2,
      "KnowledgePanel.CustomProperties": 4,
      "KnowledgePanel.KnowledgeArticle": 2
    },
    "heightMap": {
      "KnowledgePanel.Description": 2,
      "KnowledgePanel.DataModel": 6,
      "KnowledgePanel.DataProducts": 2,
      "KnowledgePanel.Tags": 2,
      "KnowledgePanel.GlossaryTerms": 2,
      "KnowledgePanel.CustomProperties": 4
    },
    "heightFallback": 1,
    "layoutAppliesTo": [
      "model"
    ],
    "defaultLayout": [
      {
        "h": 8.5,
        "i": "KnowledgePanel.LeftPanel",
        "w": 6,
        "x": 0,
        "y": 0,
        "children": [
          {
            "h": 2,
            "i": "KnowledgePanel.Description",
            "w": 1,
            "x": 0,
            "y": 0,
            "static": false
          },
          {
            "h": 6,
            "i": "KnowledgePanel.DataModel",
            "w": 1,
            "x": 0,
            "y": 1,
            "static": false
          }
        ],
        "static": true
      },
      {
        "h": 2,
        "i": "KnowledgePanel.DataProducts",
        "w": 2,
        "x": 6,
        "y": 1,
        "static": false
      },
      {
        "h": 2,
        "i": "KnowledgePanel.Tags",
        "w": 2,
        "x": 6,
        "y": 2,
        "static": false
      },
      {
        "h": 2,
        "i": "KnowledgePanel.GlossaryTerms",
        "w": 2,
        "x": 6,
        "y": 3,
        "static": false
      },
      {
        "h": 2,
        "i": "KnowledgePanel.KnowledgeArticle",
        "w": 2,
        "x": 6,
        "y": 5,
        "static": false
      },
      {
        "h": 4,
        "i": "KnowledgePanel.CustomProperties",
        "w": 2,
        "x": 6,
        "y": 6,
        "static": false
      }
    ],
    "widgets": [
      {
        "fqn": "KnowledgePanel.Description",
        "labelKey": "label.description",
        "gridSizes": [
          "small",
          "large"
        ]
      },
      {
        "fqn": "KnowledgePanel.DataModel",
        "labelKey": "label.data-model",
        "gridSizes": [
          "large"
        ]
      },
      {
        "fqn": "KnowledgePanel.DataProducts",
        "labelKey": "label.data-product-plural",
        "gridSizes": [
          "small"
        ]
      },
      {
        "fqn": "KnowledgePanel.Tags",
        "labelKey": "label.tag-plural",
        "gridSizes": [
          "small"
        ]
      },
      {
        "fqn": "KnowledgePanel.GlossaryTerms",
        "labelKey": "label.glossary-term-plural",
        "gridSizes": [
          "small"
        ]
      },
      {
        "fqn": "KnowledgePanel.CustomProperties",
        "labelKey": "label.custom-property-plural",
        "gridSizes": [
          "small",
          "large"
        ]
      },
      {
        "fqn": "KnowledgePanel.KnowledgeArticle",
        "labelKey": "label.article-plural",
        "gridSizes": [
          "large"
        ]
      }
    ],
    "tabs": [
      {
        "id": "model",
        "editable": true,
        "displayLabelKey": "TAB_LABEL_MAP"
      },
      {
        "id": "activity_feed",
        "editable": false,
        "displayLabelKey": "TAB_LABEL_MAP"
      },
      {
        "id": "lineage",
        "editable": false,
        "displayLabelKey": "TAB_LABEL_MAP"
      },
      {
        "id": "contract",
        "editable": false,
        "displayLabelKey": "TAB_LABEL_MAP"
      },
      {
        "id": "custom_properties",
        "editable": false,
        "displayLabelKey": "TAB_LABEL_MAP"
      }
    ],
    "dummy": {
      "id": "3519340b-7a36-45d1-abdf-348a5f1c582c",
      "name": "orders",
      "displayName": "Orders",
      "fullyQualifiedName": "sample_looker.model.orders",
      "description": "Orders explore from Sample Data"
    },
    "file": "utils/DashboardDataModelClassBase.ts"
  },
  "Dashboard": {
    "heights": {
      "KnowledgePanel.Description": 2,
      "KnowledgePanel.ChartsTable": 4,
      "KnowledgePanel.DataProducts": 2,
      "KnowledgePanel.Tags": 2,
      "KnowledgePanel.GlossaryTerms": 2,
      "KnowledgePanel.CustomProperties": 4,
      "KnowledgePanel.KnowledgeArticle": 2
    },
    "heightMap": {
      "KnowledgePanel.Description": 2,
      "KnowledgePanel.ChartsTable": 4,
      "KnowledgePanel.DataProducts": 2,
      "KnowledgePanel.Tags": 2,
      "KnowledgePanel.GlossaryTerms": 2,
      "KnowledgePanel.CustomProperties": 4
    },
    "heightFallback": 1,
    "layoutAppliesTo": [
      "details"
    ],
    "defaultLayout": [
      {
        "h": 6.3,
        "i": "KnowledgePanel.LeftPanel",
        "w": 6,
        "x": 0,
        "y": 0,
        "children": [
          {
            "h": 2,
            "i": "KnowledgePanel.Description",
            "w": 1,
            "x": 0,
            "y": 0,
            "static": false
          },
          {
            "h": 4,
            "i": "KnowledgePanel.ChartsTable",
            "w": 1,
            "x": 0,
            "y": 1,
            "static": false
          }
        ],
        "static": true
      },
      {
        "h": 2,
        "i": "KnowledgePanel.DataProducts",
        "w": 2,
        "x": 6,
        "y": 1,
        "static": false
      },
      {
        "h": 2,
        "i": "KnowledgePanel.Tags",
        "w": 2,
        "x": 6,
        "y": 2,
        "static": false
      },
      {
        "h": 2,
        "i": "KnowledgePanel.GlossaryTerms",
        "w": 2,
        "x": 6,
        "y": 3,
        "static": false
      },
      {
        "h": 4,
        "i": "KnowledgePanel.CustomProperties",
        "w": 2,
        "x": 6,
        "y": 6,
        "static": false
      }
    ],
    "widgets": [
      {
        "fqn": "KnowledgePanel.Description",
        "labelKey": "label.description",
        "gridSizes": [
          "small",
          "large"
        ]
      },
      {
        "fqn": "KnowledgePanel.ChartsTable",
        "labelKey": "label.chart-plural",
        "gridSizes": [
          "large"
        ]
      },
      {
        "fqn": "KnowledgePanel.DataProducts",
        "labelKey": "label.data-product-plural",
        "gridSizes": [
          "small"
        ]
      },
      {
        "fqn": "KnowledgePanel.Tags",
        "labelKey": "label.tag-plural",
        "gridSizes": [
          "small"
        ]
      },
      {
        "fqn": "KnowledgePanel.GlossaryTerms",
        "labelKey": "label.glossary-term-plural",
        "gridSizes": [
          "small"
        ]
      },
      {
        "fqn": "KnowledgePanel.CustomProperties",
        "labelKey": "label.custom-property-plural",
        "gridSizes": [
          "small",
          "large"
        ]
      },
      {
        "fqn": "KnowledgePanel.KnowledgeArticle",
        "labelKey": "label.article-plural",
        "gridSizes": [
          "large"
        ]
      }
    ],
    "tabs": [
      {
        "id": "details",
        "editable": true,
        "displayLabelKey": "TAB_LABEL_MAP"
      },
      {
        "id": "activity_feed",
        "editable": false,
        "displayLabelKey": "TAB_LABEL_MAP"
      },
      {
        "id": "lineage",
        "editable": false,
        "displayLabelKey": "TAB_LABEL_MAP"
      },
      {
        "id": "contract",
        "editable": false,
        "displayLabelKey": "TAB_LABEL_MAP"
      },
      {
        "id": "custom_properties",
        "editable": false,
        "displayLabelKey": "TAB_LABEL_MAP"
      }
    ],
    "dummy": {
      "id": "21dd6360-d1f2-4810-8759-6ab92c4f033e",
      "name": "31",
      "displayName": "Sales Dashboard",
      "fullyQualifiedName": "sample_superset.31",
      "description": ""
    },
    "file": "utils/DashboardDetailsClassBase.ts"
  },
  "Pipeline": {
    "heights": {
      "KnowledgePanel.Description": 2,
      "KnowledgePanel.PipelineTasks": 4,
      "KnowledgePanel.DataProducts": 2,
      "KnowledgePanel.Tags": 2,
      "KnowledgePanel.GlossaryTerms": 2,
      "KnowledgePanel.CustomProperties": 4,
      "KnowledgePanel.KnowledgeArticle": 2
    },
    "heightMap": {
      "KnowledgePanel.Description": 2,
      "KnowledgePanel.PipelineTasks": 4,
      "KnowledgePanel.DataProducts": 2,
      "KnowledgePanel.Tags": 2,
      "KnowledgePanel.GlossaryTerms": 2,
      "KnowledgePanel.CustomProperties": 4
    },
    "heightFallback": 1,
    "layoutAppliesTo": [
      "tasks"
    ],
    "defaultLayout": [
      {
        "h": 6.5,
        "i": "KnowledgePanel.LeftPanel",
        "w": 6,
        "x": 0,
        "y": 0,
        "children": [
          {
            "h": 2,
            "i": "KnowledgePanel.Description",
            "w": 1,
            "x": 0,
            "y": 0,
            "static": false
          },
          {
            "h": 4,
            "i": "KnowledgePanel.PipelineTasks",
            "w": 1,
            "x": 0,
            "y": 1,
            "static": false
          }
        ],
        "static": true
      },
      {
        "h": 2,
        "i": "KnowledgePanel.DataProducts",
        "w": 2,
        "x": 6,
        "y": 1,
        "static": false
      },
      {
        "h": 2,
        "i": "KnowledgePanel.Tags",
        "w": 2,
        "x": 6,
        "y": 2,
        "static": false
      },
      {
        "h": 2,
        "i": "KnowledgePanel.GlossaryTerms",
        "w": 2,
        "x": 6,
        "y": 3,
        "static": false
      },
      {
        "h": 2,
        "i": "KnowledgePanel.KnowledgeArticle",
        "w": 2,
        "x": 6,
        "y": 5,
        "static": false
      },
      {
        "h": 4,
        "i": "KnowledgePanel.CustomProperties",
        "w": 2,
        "x": 6,
        "y": 6,
        "static": false
      }
    ],
    "widgets": [
      {
        "fqn": "KnowledgePanel.Description",
        "labelKey": "label.description",
        "gridSizes": [
          "small",
          "large"
        ]
      },
      {
        "fqn": "KnowledgePanel.PipelineTasks",
        "labelKey": "label.task-plural",
        "gridSizes": [
          "large"
        ]
      },
      {
        "fqn": "KnowledgePanel.DataProducts",
        "labelKey": "label.data-product-plural",
        "gridSizes": [
          "small"
        ]
      },
      {
        "fqn": "KnowledgePanel.Tags",
        "labelKey": "label.tag-plural",
        "gridSizes": [
          "small"
        ]
      },
      {
        "fqn": "KnowledgePanel.GlossaryTerms",
        "labelKey": "label.glossary-term-plural",
        "gridSizes": [
          "small"
        ]
      },
      {
        "fqn": "KnowledgePanel.CustomProperties",
        "labelKey": "label.custom-property-plural",
        "gridSizes": [
          "small",
          "large"
        ]
      },
      {
        "fqn": "KnowledgePanel.KnowledgeArticle",
        "labelKey": "label.article-plural",
        "gridSizes": [
          "large"
        ]
      }
    ],
    "tabs": [
      {
        "id": "tasks",
        "editable": true,
        "displayLabelKey": "TAB_LABEL_MAP"
      },
      {
        "id": "activity_feed",
        "editable": false,
        "displayLabelKey": "TAB_LABEL_MAP"
      },
      {
        "id": "executions",
        "editable": false,
        "displayLabelKey": "TAB_LABEL_MAP"
      },
      {
        "id": "lineage",
        "editable": false,
        "displayLabelKey": "TAB_LABEL_MAP"
      },
      {
        "id": "contract",
        "editable": false,
        "displayLabelKey": "TAB_LABEL_MAP"
      },
      {
        "id": "custom_properties",
        "editable": false,
        "displayLabelKey": "TAB_LABEL_MAP"
      }
    ],
    "dummy": {
      "id": "60670fe2-eb0a-41a2-a683-d32964e7e61b",
      "name": "dim_address_etl",
      "displayName": "dim_address etl",
      "fullyQualifiedName": "sample_airflow.dim_address_etl",
      "description": "dim_address ETL pipeline"
    },
    "file": "utils/PipelineClassBase.ts"
  },
  "DatabaseSchema": {
    "heights": {
      "KnowledgePanel.Description": 2,
      "KnowledgePanel.Tables": 8.5,
      "KnowledgePanel.DataProducts": 2,
      "KnowledgePanel.Tags": 2,
      "KnowledgePanel.GlossaryTerms": 2,
      "KnowledgePanel.CustomProperties": 4,
      "KnowledgePanel.KnowledgeArticle": 2
    },
    "heightMap": {
      "KnowledgePanel.Description": 2,
      "KnowledgePanel.Tables": 8.5,
      "KnowledgePanel.DataProducts": 2,
      "KnowledgePanel.Tags": 2,
      "KnowledgePanel.GlossaryTerms": 2,
      "KnowledgePanel.CustomProperties": 4
    },
    "heightFallback": 1,
    "layoutAppliesTo": [
      "table"
    ],
    "defaultLayout": [
      {
        "h": 11.0,
        "i": "KnowledgePanel.LeftPanel",
        "w": 6,
        "x": 0,
        "y": 0,
        "children": [
          {
            "h": 2,
            "i": "KnowledgePanel.Description",
            "w": 1,
            "x": 0,
            "y": 0,
            "static": false
          },
          {
            "h": 8.5,
            "i": "KnowledgePanel.Tables",
            "w": 1,
            "x": 0,
            "y": 1,
            "static": false
          }
        ],
        "static": true
      },
      {
        "h": 2,
        "i": "KnowledgePanel.DataProducts",
        "w": 2,
        "x": 6,
        "y": 1,
        "static": false
      },
      {
        "h": 2,
        "i": "KnowledgePanel.Tags",
        "w": 2,
        "x": 6,
        "y": 2,
        "static": false
      },
      {
        "h": 2,
        "i": "KnowledgePanel.GlossaryTerms",
        "w": 2,
        "x": 6,
        "y": 3,
        "static": false
      },
      {
        "h": 2,
        "i": "KnowledgePanel.KnowledgeArticle",
        "w": 2,
        "x": 6,
        "y": 5,
        "static": false
      },
      {
        "h": 4,
        "i": "KnowledgePanel.CustomProperties",
        "w": 2,
        "x": 6,
        "y": 6,
        "static": false
      }
    ],
    "widgets": [
      {
        "fqn": "KnowledgePanel.Description",
        "labelKey": "label.description",
        "gridSizes": [
          "small",
          "large"
        ]
      },
      {
        "fqn": "KnowledgePanel.Tables",
        "labelKey": "label.table-plural",
        "gridSizes": [
          "large"
        ]
      },
      {
        "fqn": "KnowledgePanel.DataProducts",
        "labelKey": "label.data-product-plural",
        "gridSizes": [
          "small"
        ]
      },
      {
        "fqn": "KnowledgePanel.Tags",
        "labelKey": "label.tag-plural",
        "gridSizes": [
          "small"
        ]
      },
      {
        "fqn": "KnowledgePanel.GlossaryTerms",
        "labelKey": "label.glossary-term-plural",
        "gridSizes": [
          "small"
        ]
      },
      {
        "fqn": "KnowledgePanel.CustomProperties",
        "labelKey": "label.custom-property-plural",
        "gridSizes": [
          "small",
          "large"
        ]
      },
      {
        "fqn": "KnowledgePanel.KnowledgeArticle",
        "labelKey": "label.article-plural",
        "gridSizes": [
          "large"
        ]
      }
    ],
    "tabs": [
      {
        "id": "table",
        "editable": true,
        "displayLabelKey": "TAB_LABEL_MAP"
      },
      {
        "id": "stored_procedure",
        "editable": false,
        "displayLabelKey": "TAB_LABEL_MAP"
      },
      {
        "id": "activity_feed",
        "editable": false,
        "displayLabelKey": "TAB_LABEL_MAP"
      },
      {
        "id": "contract",
        "editable": false,
        "displayLabelKey": "TAB_LABEL_MAP"
      },
      {
        "id": "custom_properties",
        "editable": false,
        "displayLabelKey": "TAB_LABEL_MAP"
      }
    ],
    "dummy": {
      "id": "9f127bdc-d060-4fac-ae7b-c635933fc2e0",
      "name": "shopify",
      "fullyQualifiedName": "sample_data.ecommerce_db.shopify",
      "description": "This **mock** database contains schema related to shopify sales and orders with related dimension tables."
    },
    "file": "utils/DatabaseSchemaClassBase.ts"
  },
  "Database": {
    "heights": {
      "KnowledgePanel.Description": 2,
      "KnowledgePanel.DatabaseSchema": 4,
      "KnowledgePanel.DataProducts": 2,
      "KnowledgePanel.Tags": 2,
      "KnowledgePanel.GlossaryTerms": 2,
      "KnowledgePanel.CustomProperties": 4,
      "KnowledgePanel.KnowledgeArticle": 2
    },
    "heightMap": {
      "KnowledgePanel.Description": 2,
      "KnowledgePanel.DatabaseSchema": 4,
      "KnowledgePanel.DataProducts": 2,
      "KnowledgePanel.Tags": 2,
      "KnowledgePanel.GlossaryTerms": 2,
      "KnowledgePanel.CustomProperties": 4
    },
    "heightFallback": 1,
    "layoutAppliesTo": [
      "schemas"
    ],
    "defaultLayout": [
      {
        "h": 6.5,
        "i": "KnowledgePanel.LeftPanel",
        "w": 6,
        "x": 0,
        "y": 0,
        "children": [
          {
            "h": 2,
            "i": "KnowledgePanel.Description",
            "w": 1,
            "x": 0,
            "y": 0,
            "static": false
          },
          {
            "h": 4,
            "i": "KnowledgePanel.DatabaseSchema",
            "w": 1,
            "x": 0,
            "y": 1,
            "static": false
          }
        ],
        "static": true
      },
      {
        "h": 2,
        "i": "KnowledgePanel.DataProducts",
        "w": 2,
        "x": 6,
        "y": 1,
        "static": false
      },
      {
        "h": 2,
        "i": "KnowledgePanel.Tags",
        "w": 2,
        "x": 6,
        "y": 2,
        "static": false
      },
      {
        "h": 2,
        "i": "KnowledgePanel.GlossaryTerms",
        "w": 2,
        "x": 6,
        "y": 3,
        "static": false
      },
      {
        "h": 2,
        "i": "KnowledgePanel.KnowledgeArticle",
        "w": 2,
        "x": 6,
        "y": 5,
        "static": false
      },
      {
        "h": 4,
        "i": "KnowledgePanel.CustomProperties",
        "w": 2,
        "x": 6,
        "y": 6,
        "static": false
      }
    ],
    "widgets": [
      {
        "fqn": "KnowledgePanel.Description",
        "labelKey": "label.description",
        "gridSizes": [
          "small",
          "large"
        ]
      },
      {
        "fqn": "KnowledgePanel.DatabaseSchema",
        "labelKey": "label.schema",
        "gridSizes": [
          "large"
        ]
      },
      {
        "fqn": "KnowledgePanel.DataProducts",
        "labelKey": "label.data-product-plural",
        "gridSizes": [
          "small"
        ]
      },
      {
        "fqn": "KnowledgePanel.Tags",
        "labelKey": "label.tag-plural",
        "gridSizes": [
          "small"
        ]
      },
      {
        "fqn": "KnowledgePanel.GlossaryTerms",
        "labelKey": "label.glossary-term-plural",
        "gridSizes": [
          "small"
        ]
      },
      {
        "fqn": "KnowledgePanel.CustomProperties",
        "labelKey": "label.custom-property-plural",
        "gridSizes": [
          "small",
          "large"
        ]
      },
      {
        "fqn": "KnowledgePanel.KnowledgeArticle",
        "labelKey": "label.article-plural",
        "gridSizes": [
          "large"
        ]
      }
    ],
    "tabs": [
      {
        "id": "schemas",
        "editable": true,
        "displayLabelKey": "TAB_LABEL_MAP"
      },
      {
        "id": "activity_feed",
        "editable": false,
        "displayLabelKey": "TAB_LABEL_MAP"
      },
      {
        "id": "contract",
        "editable": false,
        "displayLabelKey": "TAB_LABEL_MAP"
      },
      {
        "id": "custom_properties",
        "editable": false,
        "displayLabelKey": "TAB_LABEL_MAP"
      }
    ],
    "dummy": {
      "id": "77147d45-888b-42dd-a369-8b7ba882dffb",
      "name": "ecommerce_db",
      "displayName": "",
      "fullyQualifiedName": "sample_data.ecommerce_db",
      "description": "This **mock** database contains schemas related to shopify sales and orders with related dimension tables."
    },
    "file": "utils/Database/DatabaseClassBase.ts"
  },
  "Container": {
    "heights": {
      "KnowledgePanel.Description": 2,
      "KnowledgePanel.ContainerChildren": 8,
      "KnowledgePanel.ContainerSchema": 5,
      "KnowledgePanel.DataProducts": 2,
      "KnowledgePanel.Tags": 2,
      "KnowledgePanel.GlossaryTerms": 2,
      "KnowledgePanel.CustomProperties": 4,
      "KnowledgePanel.KnowledgeArticle": 2
    },
    "heightMap": {
      "KnowledgePanel.Description": 2,
      "KnowledgePanel.ContainerChildren": 8,
      "KnowledgePanel.DataProducts": 2,
      "KnowledgePanel.Tags": 2,
      "KnowledgePanel.GlossaryTerms": 2,
      "KnowledgePanel.ContainerSchema": 5,
      "KnowledgePanel.CustomProperties": 4
    },
    "heightFallback": 1,
    "layoutAppliesTo": [
      "children",
      "schema"
    ],
    "defaultLayout": [
      {
        "h": 7.5,
        "i": "KnowledgePanel.LeftPanel",
        "w": 6,
        "x": 0,
        "y": 0,
        "children": [
          {
            "h": 2,
            "i": "KnowledgePanel.Description",
            "w": 1,
            "x": 0,
            "y": 0,
            "static": false
          },
          {
            "h": 5,
            "i": "KnowledgePanel.ContainerSchema",
            "w": 1,
            "x": 0,
            "y": 1,
            "static": false
          }
        ],
        "static": true
      },
      {
        "h": 2,
        "i": "KnowledgePanel.DataProducts",
        "w": 2,
        "x": 6,
        "y": 1,
        "static": false
      },
      {
        "h": 2,
        "i": "KnowledgePanel.Tags",
        "w": 2,
        "x": 6,
        "y": 2,
        "static": false
      },
      {
        "h": 2,
        "i": "KnowledgePanel.GlossaryTerms",
        "w": 2,
        "x": 6,
        "y": 3,
        "static": false
      },
      {
        "h": 2,
        "i": "KnowledgePanel.KnowledgeArticle",
        "w": 2,
        "x": 6,
        "y": 5,
        "static": false
      },
      {
        "h": 4,
        "i": "KnowledgePanel.CustomProperties",
        "w": 2,
        "x": 6,
        "y": 6,
        "static": false
      }
    ],
    // Verified alignment correction, not extraction output: official
    // ContainerDetailsClassBase.ts:120-131 returns this single-widget
    // layout for CHILDREN (h = defaultWidgetHeight[CONTAINER_CHILDREN]
    // = 8, w: 8), while SCHEMA keeps `defaultLayout` above. See
    // PageDataTable.defaultLayoutByTab.
    "defaultLayoutByTab": {
      "children": [
        {
          "h": 8,
          "i": "KnowledgePanel.ContainerChildren",
          "w": 8,
          "x": 0,
          "y": 0,
          "static": false
        }
      ]
    },
    "widgets": [
      {
        "fqn": "KnowledgePanel.Description",
        "labelKey": "label.description",
        "gridSizes": [
          "small",
          "large"
        ]
      },
      {
        "fqn": "KnowledgePanel.ContainerSchema",
        "labelKey": "label.schema",
        "gridSizes": [
          "large"
        ]
      },
      {
        "fqn": "KnowledgePanel.ContainerChildren",
        "labelKey": "label.container-plural",
        "gridSizes": [
          "large"
        ]
      },
      {
        "fqn": "KnowledgePanel.DataProducts",
        "labelKey": "label.data-product-plural",
        "gridSizes": [
          "small"
        ]
      },
      {
        "fqn": "KnowledgePanel.Tags",
        "labelKey": "label.tag-plural",
        "gridSizes": [
          "small"
        ]
      },
      {
        "fqn": "KnowledgePanel.GlossaryTerms",
        "labelKey": "label.glossary-term-plural",
        "gridSizes": [
          "small"
        ]
      },
      {
        "fqn": "KnowledgePanel.CustomProperties",
        "labelKey": "label.custom-property-plural",
        "gridSizes": [
          "small",
          "large"
        ]
      },
      {
        "fqn": "KnowledgePanel.KnowledgeArticle",
        "labelKey": "label.article-plural",
        "gridSizes": [
          "large"
        ]
      }
    ],
    "tabs": [
      {
        "id": "schema",
        "editable": true,
        "displayLabelKey": "TAB_LABEL_MAP"
      },
      {
        "id": "children",
        "editable": true,
        "displayLabelKey": "label.container-plural"
      },
      {
        "id": "sample_data",
        "editable": false,
        "displayLabelKey": "TAB_LABEL_MAP"
      },
      {
        "id": "activity_feed",
        "editable": false,
        "displayLabelKey": "TAB_LABEL_MAP"
      },
      {
        "id": "lineage",
        "editable": false,
        "displayLabelKey": "TAB_LABEL_MAP"
      },
      {
        "id": "contract",
        "editable": false,
        "displayLabelKey": "TAB_LABEL_MAP"
      },
      {
        "id": "custom_properties",
        "editable": false,
        "displayLabelKey": "TAB_LABEL_MAP"
      }
    ],
    "dummy": {
      "id": "af3abc04-30fe-44b2-b3f5-4712e3273c75",
      "name": "finance",
      "displayName": "Finance department",
      "fullyQualifiedName": "s3_storage_sample.departments.finance",
      "description": "Bucket containing finance department information"
    },
    "file": "utils/ContainerDetailsClassBase.ts"
  },
  "SearchIndex": {
    "heights": {
      "KnowledgePanel.Description": 2,
      "KnowledgePanel.SearchIndexFields": 6,
      "KnowledgePanel.DataProducts": 2,
      "KnowledgePanel.Tags": 2,
      "KnowledgePanel.GlossaryTerms": 2,
      "KnowledgePanel.CustomProperties": 4,
      "KnowledgePanel.KnowledgeArticle": 2
    },
    "heightMap": {
      "KnowledgePanel.Description": 2,
      "KnowledgePanel.SearchIndexFields": 6,
      "KnowledgePanel.DataProducts": 2,
      "KnowledgePanel.Tags": 2,
      "KnowledgePanel.GlossaryTerms": 2,
      "KnowledgePanel.CustomProperties": 4
    },
    "heightFallback": 1,
    "layoutAppliesTo": [
      "fields"
    ],
    "defaultLayout": [
      {
        "h": 8.5,
        "i": "KnowledgePanel.LeftPanel",
        "w": 6,
        "x": 0,
        "y": 0,
        "children": [
          {
            "h": 2,
            "i": "KnowledgePanel.Description",
            "w": 1,
            "x": 0,
            "y": 0,
            "static": false
          },
          {
            "h": 6,
            "i": "KnowledgePanel.SearchIndexFields",
            "w": 1,
            "x": 0,
            "y": 1,
            "static": false
          }
        ],
        "static": true
      },
      {
        "h": 2,
        "i": "KnowledgePanel.DataProducts",
        "w": 2,
        "x": 6,
        "y": 1,
        "static": false
      },
      {
        "h": 2,
        "i": "KnowledgePanel.Tags",
        "w": 2,
        "x": 6,
        "y": 2,
        "static": false
      },
      {
        "h": 2,
        "i": "KnowledgePanel.GlossaryTerms",
        "w": 2,
        "x": 6,
        "y": 3,
        "static": false
      },
      {
        "h": 2,
        "i": "KnowledgePanel.KnowledgeArticle",
        "w": 2,
        "x": 6,
        "y": 5,
        "static": false
      },
      {
        "h": 4,
        "i": "KnowledgePanel.CustomProperties",
        "w": 2,
        "x": 6,
        "y": 6,
        "static": false
      }
    ],
    "widgets": [
      {
        "fqn": "KnowledgePanel.Description",
        "labelKey": "label.description",
        "gridSizes": [
          "small",
          "large"
        ]
      },
      {
        "fqn": "KnowledgePanel.SearchIndexFields",
        "labelKey": "label.field-plural",
        "gridSizes": [
          "large"
        ]
      },
      {
        "fqn": "KnowledgePanel.DataProducts",
        "labelKey": "label.data-product-plural",
        "gridSizes": [
          "small"
        ]
      },
      {
        "fqn": "KnowledgePanel.Tags",
        "labelKey": "label.tag-plural",
        "gridSizes": [
          "small"
        ]
      },
      {
        "fqn": "KnowledgePanel.GlossaryTerms",
        "labelKey": "label.glossary-term-plural",
        "gridSizes": [
          "small"
        ]
      },
      {
        "fqn": "KnowledgePanel.CustomProperties",
        "labelKey": "label.custom-property-plural",
        "gridSizes": [
          "small",
          "large"
        ]
      },
      {
        "fqn": "KnowledgePanel.KnowledgeArticle",
        "labelKey": "label.article-plural",
        "gridSizes": [
          "large"
        ]
      }
    ],
    "tabs": [
      {
        "id": "fields",
        "editable": true,
        "displayLabelKey": "TAB_LABEL_MAP"
      },
      {
        "id": "activity_feed",
        "editable": false,
        "displayLabelKey": "TAB_LABEL_MAP"
      },
      {
        "id": "sample_data",
        "editable": false,
        "displayLabelKey": "TAB_LABEL_MAP"
      },
      {
        "id": "lineage",
        "editable": false,
        "displayLabelKey": "TAB_LABEL_MAP"
      },
      {
        "id": "contract",
        "editable": false,
        "displayLabelKey": "TAB_LABEL_MAP"
      },
      {
        "id": "search-index-settings",
        "editable": false,
        "displayLabelKey": "TAB_LABEL_MAP"
      },
      {
        "id": "custom_properties",
        "editable": false,
        "displayLabelKey": "TAB_LABEL_MAP"
      }
    ],
    "dummy": {
      "id": "2de6c0f1-c85a-4c90-b74b-b40869cc446c",
      "name": "table_search_index",
      "displayName": "TableSearchIndex",
      "fullyQualifiedName": "elasticsearch_sample.table_search_index",
      "description": "Table Search Index"
    },
    "file": "utils/SearchIndexDetailsClassBase.ts"
  },
  "Metric": {
    "heights": {
      "KnowledgePanel.Description": 4,
      "KnowledgePanel.DataProducts": 2,
      "KnowledgePanel.Tags": 2,
      "KnowledgePanel.GlossaryTerms": 2,
      "KnowledgePanel.RelatedMetrics": 1.5,
      "KnowledgePanel.MetricHierarchy": 3,
      "KnowledgePanel.MetricDefinition": 4,
      "KnowledgePanel.CustomProperties": 4,
      "KnowledgePanel.KnowledgeArticle": 2
    },
    "heightMap": {
      "KnowledgePanel.Description": 4,
      "KnowledgePanel.DataProducts": 2,
      "KnowledgePanel.Tags": 2,
      "KnowledgePanel.GlossaryTerms": 2,
      "KnowledgePanel.RelatedMetrics": 1.5,
      "KnowledgePanel.MetricHierarchy": 3,
      "KnowledgePanel.MetricDefinition": 4,
      "KnowledgePanel.CustomProperties": 4,
      "KnowledgePanel.KnowledgeArticle": 2
    },
    "heightFallback": 1,
    "layoutAppliesTo": [
      "overview"
    ],
    "defaultLayout": [
      {
        "h": 11.5,
        "i": "KnowledgePanel.LeftPanel",
        "w": 6,
        "x": 0,
        "y": 0,
        "children": [
          {
            "h": 4,
            "i": "KnowledgePanel.Description",
            "w": 1,
            "x": 0,
            "y": 0,
            "static": false
          },
          {
            "h": 3,
            "i": "KnowledgePanel.MetricHierarchy",
            "w": 1,
            "x": 0,
            "y": 1,
            "static": false
          },
          {
            "h": 4,
            "i": "KnowledgePanel.MetricDefinition",
            "w": 1,
            "x": 0,
            "y": 2,
            "static": false
          }
        ],
        "static": true
      },
      {
        "h": 2,
        "i": "KnowledgePanel.DataProducts",
        "w": 2,
        "x": 6,
        "y": 1,
        "static": false
      },
      {
        "h": 2,
        "i": "KnowledgePanel.Tags",
        "w": 2,
        "x": 6,
        "y": 2,
        "static": false
      },
      {
        "h": 2,
        "i": "KnowledgePanel.GlossaryTerms",
        "w": 2,
        "x": 6,
        "y": 3,
        "static": false
      },
      {
        "h": 1.5,
        "i": "KnowledgePanel.RelatedMetrics",
        "w": 2,
        "x": 6,
        "y": 4,
        "static": false
      },
      {
        "h": 2,
        "i": "KnowledgePanel.KnowledgeArticle",
        "w": 2,
        "x": 6,
        "y": 5,
        "static": false
      },
      {
        "h": 4,
        "i": "KnowledgePanel.CustomProperties",
        "w": 2,
        "x": 6,
        "y": 6,
        "static": false
      }
    ],
    "widgets": [
      {
        "fqn": "KnowledgePanel.Description",
        "labelKey": "label.description",
        "gridSizes": [
          "small",
          "large"
        ]
      },
      {
        "fqn": "KnowledgePanel.DataProducts",
        "labelKey": "label.data-product-plural",
        "gridSizes": [
          "small"
        ]
      },
      {
        "fqn": "KnowledgePanel.Tags",
        "labelKey": "label.tag-plural",
        "gridSizes": [
          "small"
        ]
      },
      {
        "fqn": "KnowledgePanel.GlossaryTerms",
        "labelKey": "label.glossary-term-plural",
        "gridSizes": [
          "small"
        ]
      },
      {
        "fqn": "KnowledgePanel.MetricHierarchy",
        "labelKey": "label.metric-hierarchy",
        "gridSizes": [
          "large"
        ]
      },
      {
        "fqn": "KnowledgePanel.MetricDefinition",
        "labelKey": "label.definition",
        "gridSizes": [
          "large"
        ]
      },
      {
        "fqn": "KnowledgePanel.RelatedMetrics",
        "labelKey": "label.related-metric-plural",
        "gridSizes": [
          "large"
        ]
      },
      {
        "fqn": "KnowledgePanel.CustomProperties",
        "labelKey": "label.custom-property-plural",
        "gridSizes": [
          "small",
          "large"
        ]
      },
      {
        "fqn": "KnowledgePanel.KnowledgeArticle",
        "labelKey": "label.article-plural",
        "gridSizes": [
          "large"
        ]
      }
    ],
    "tabs": [
      {
        "id": "overview",
        "editable": true,
        "displayLabelKey": "TAB_LABEL_MAP"
      },
      {
        "id": "lineage",
        "editable": false,
        "displayLabelKey": "TAB_LABEL_MAP"
      },
      {
        "id": "assets",
        "editable": false,
        "displayLabelKey": "TAB_LABEL_MAP"
      },
      {
        "id": "activity_feed",
        "editable": false,
        "displayLabelKey": "label.activity-feed-and-task-plural"
      },
      {
        "id": "custom_properties",
        "editable": false,
        "displayLabelKey": "TAB_LABEL_MAP"
      }
    ],
    "dummy": {
      "id": "60c367be-a3d0-492a-b7be-8e38c970e0a7",
      "name": "Engagement Rate",
      "fullyQualifiedName": "Engagement Rate",
      "description": "The **Engagement Rate** measures how actively your audience is interacting with your content, usually in the form of likes, comments, and shares."
    },
    "file": "utils/MetricEntityUtils/MetricDetailsClassBase.ts"
  },
  "MlModel": {
    "heights": {
      "KnowledgePanel.Description": 2,
      "KnowledgePanel.MlModelFeatures": 8,
      "KnowledgePanel.DataProducts": 2,
      "KnowledgePanel.Tags": 2,
      "KnowledgePanel.GlossaryTerms": 2,
      "KnowledgePanel.CustomProperties": 4,
      "KnowledgePanel.KnowledgeArticle": 2
    },
    "heightMap": {
      "KnowledgePanel.Description": 2,
      "KnowledgePanel.MlModelFeatures": 8,
      "KnowledgePanel.DataProducts": 2,
      "KnowledgePanel.Tags": 2,
      "KnowledgePanel.GlossaryTerms": 2,
      "KnowledgePanel.CustomProperties": 4
    },
    "heightFallback": 1,
    "layoutAppliesTo": [
      "features"
    ],
    "defaultLayout": [
      {
        "h": 10.5,
        "i": "KnowledgePanel.LeftPanel",
        "w": 6,
        "x": 0,
        "y": 0,
        "children": [
          {
            "h": 2,
            "i": "KnowledgePanel.Description",
            "w": 1,
            "x": 0,
            "y": 0,
            "static": false
          },
          {
            "h": 8,
            "i": "KnowledgePanel.MlModelFeatures",
            "w": 1,
            "x": 0,
            "y": 1,
            "static": false
          }
        ],
        "static": true
      },
      {
        "h": 2,
        "i": "KnowledgePanel.DataProducts",
        "w": 2,
        "x": 6,
        "y": 1,
        "static": false
      },
      {
        "h": 2,
        "i": "KnowledgePanel.Tags",
        "w": 2,
        "x": 6,
        "y": 2,
        "static": false
      },
      {
        "h": 2,
        "i": "KnowledgePanel.GlossaryTerms",
        "w": 2,
        "x": 6,
        "y": 3,
        "static": false
      },
      {
        "h": 2,
        "i": "KnowledgePanel.KnowledgeArticle",
        "w": 2,
        "x": 6,
        "y": 5,
        "static": false
      },
      {
        "h": 4,
        "i": "KnowledgePanel.CustomProperties",
        "w": 2,
        "x": 6,
        "y": 5,
        "static": false
      }
    ],
    "widgets": [
      {
        "fqn": "KnowledgePanel.Description",
        "labelKey": "label.description",
        "gridSizes": [
          "small",
          "large"
        ]
      },
      {
        "fqn": "KnowledgePanel.DataProducts",
        "labelKey": "label.data-product-plural",
        "gridSizes": [
          "small"
        ]
      },
      {
        "fqn": "KnowledgePanel.Tags",
        "labelKey": "label.tag-plural",
        "gridSizes": [
          "small"
        ]
      },
      {
        "fqn": "KnowledgePanel.GlossaryTerms",
        "labelKey": "label.glossary-term-plural",
        "gridSizes": [
          "small"
        ]
      },
      {
        "fqn": "KnowledgePanel.MlModelFeatures",
        "labelKey": "label.feature-plural",
        "gridSizes": [
          "large"
        ]
      },
      {
        "fqn": "KnowledgePanel.CustomProperties",
        "labelKey": "label.custom-property-plural",
        "gridSizes": [
          "small",
          "large"
        ]
      },
      {
        "fqn": "KnowledgePanel.KnowledgeArticle",
        "labelKey": "label.article-plural",
        "gridSizes": [
          "large"
        ]
      }
    ],
    "tabs": [
      {
        "id": "features",
        "editable": true,
        "displayLabelKey": "TAB_LABEL_MAP"
      },
      {
        "id": "activity_feed",
        "editable": false,
        "displayLabelKey": "TAB_LABEL_MAP"
      },
      {
        "id": "details",
        "editable": false,
        "displayLabelKey": "TAB_LABEL_MAP"
      },
      {
        "id": "lineage",
        "editable": false,
        "displayLabelKey": "TAB_LABEL_MAP"
      },
      {
        "id": "contract",
        "editable": false,
        "displayLabelKey": "TAB_LABEL_MAP"
      },
      {
        "id": "custom_properties",
        "editable": false,
        "displayLabelKey": "TAB_LABEL_MAP"
      }
    ],
    "dummy": {
      "id": "6ef964b1-edb7-4d7c-85f1-51845197206c",
      "name": "eta_predictions",
      "displayName": "ETA Predictions",
      "fullyQualifiedName": "mlflow_svc.eta_predictions",
      "description": "ETA Predictions Model"
    },
    "file": "utils/MlModel/MlModelClassBase.ts"
  },
  "APIEndpoint": {
    "heights": {
      "KnowledgePanel.Description": 2,
      "KnowledgePanel.APISchema": 8,
      "KnowledgePanel.DataProducts": 2,
      "KnowledgePanel.Tags": 2,
      "KnowledgePanel.GlossaryTerms": 2,
      "KnowledgePanel.CustomProperties": 4,
      "KnowledgePanel.KnowledgeArticle": 2
    },
    "heightMap": {
      "KnowledgePanel.Description": 2,
      "KnowledgePanel.APISchema": 8,
      "KnowledgePanel.DataProducts": 2,
      "KnowledgePanel.Tags": 2,
      "KnowledgePanel.GlossaryTerms": 2,
      "KnowledgePanel.CustomProperties": 4
    },
    "heightFallback": 1,
    "layoutAppliesTo": [
      "schema"
    ],
    "defaultLayout": [
      {
        "h": 10.5,
        "i": "KnowledgePanel.LeftPanel",
        "w": 6,
        "x": 0,
        "y": 0,
        "children": [
          {
            "h": 2,
            "i": "KnowledgePanel.Description",
            "w": 1,
            "x": 0,
            "y": 0,
            "static": false
          },
          {
            "h": 8,
            "i": "KnowledgePanel.APISchema",
            "w": 1,
            "x": 0,
            "y": 1,
            "static": false
          }
        ],
        "static": true
      },
      {
        "h": 2,
        "i": "KnowledgePanel.DataProducts",
        "w": 2,
        "x": 6,
        "y": 1,
        "static": false
      },
      {
        "h": 2,
        "i": "KnowledgePanel.Tags",
        "w": 2,
        "x": 6,
        "y": 2,
        "static": false
      },
      {
        "h": 2,
        "i": "KnowledgePanel.GlossaryTerms",
        "w": 2,
        "x": 6,
        "y": 3,
        "static": false
      },
      {
        "h": 2,
        "i": "KnowledgePanel.KnowledgeArticle",
        "w": 2,
        "x": 6,
        "y": 5,
        "static": false
      },
      {
        "h": 4,
        "i": "KnowledgePanel.CustomProperties",
        "w": 2,
        "x": 6,
        "y": 6,
        "static": false
      }
    ],
    "widgets": [
      {
        "fqn": "KnowledgePanel.Description",
        "labelKey": "label.description",
        "gridSizes": [
          "small",
          "large"
        ]
      },
      {
        "fqn": "KnowledgePanel.APISchema",
        "labelKey": "label.schema",
        "gridSizes": [
          "large"
        ]
      },
      {
        "fqn": "KnowledgePanel.DataProducts",
        "labelKey": "label.data-product-plural",
        "gridSizes": [
          "small"
        ]
      },
      {
        "fqn": "KnowledgePanel.Tags",
        "labelKey": "label.tag-plural",
        "gridSizes": [
          "small"
        ]
      },
      {
        "fqn": "KnowledgePanel.GlossaryTerms",
        "labelKey": "label.glossary-term-plural",
        "gridSizes": [
          "small"
        ]
      },
      {
        "fqn": "KnowledgePanel.CustomProperties",
        "labelKey": "label.custom-property-plural",
        "gridSizes": [
          "small",
          "large"
        ]
      },
      {
        "fqn": "KnowledgePanel.KnowledgeArticle",
        "labelKey": "label.article-plural",
        "gridSizes": [
          "large"
        ]
      }
    ],
    "tabs": [
      {
        "id": "schema",
        "editable": true,
        "displayLabelKey": "TAB_LABEL_MAP"
      },
      {
        "id": "activity_feed",
        "editable": false,
        "displayLabelKey": "TAB_LABEL_MAP"
      },
      {
        "id": "lineage",
        "editable": false,
        "displayLabelKey": "TAB_LABEL_MAP"
      },
      {
        "id": "contract",
        "editable": false,
        "displayLabelKey": "TAB_LABEL_MAP"
      },
      {
        "id": "custom_properties",
        "editable": false,
        "displayLabelKey": "TAB_LABEL_MAP"
      }
    ],
    "dummy": {
      "id": "08063869-2e79-4ad1-8d58-749ccf7b8d06",
      "name": "addPet",
      "fullyQualifiedName": "pet_api_service.pet.addPet",
      "description": "Add a new pet to the store"
    },
    "file": "utils/APIEndpoints/APIEndpointClassBase.ts"
  },
  "APICollection": {
    "heights": {
      "KnowledgePanel.Description": 2,
      "KnowledgePanel.APIEndpoints": 4,
      "KnowledgePanel.DataProducts": 2,
      "KnowledgePanel.Tags": 2,
      "KnowledgePanel.GlossaryTerms": 2,
      "KnowledgePanel.CustomProperties": 4,
      "KnowledgePanel.KnowledgeArticle": 2
    },
    "heightMap": {
      "KnowledgePanel.Description": 2,
      "KnowledgePanel.APIEndpoints": 4,
      "KnowledgePanel.DataProducts": 2,
      "KnowledgePanel.Tags": 2,
      "KnowledgePanel.GlossaryTerms": 2,
      "KnowledgePanel.CustomProperties": 4
    },
    "heightFallback": 1,
    "layoutAppliesTo": [
      "apiEndpoint"
    ],
    "defaultLayout": [
      {
        "h": 6.5,
        "i": "KnowledgePanel.LeftPanel",
        "w": 6,
        "x": 0,
        "y": 0,
        "children": [
          {
            "h": 2,
            "i": "KnowledgePanel.Description",
            "w": 1,
            "x": 0,
            "y": 0,
            "static": false
          },
          {
            "h": 4,
            "i": "KnowledgePanel.APIEndpoints",
            "w": 1,
            "x": 0,
            "y": 1,
            "static": false
          }
        ],
        "static": true
      },
      {
        "h": 2,
        "i": "KnowledgePanel.DataProducts",
        "w": 2,
        "x": 6,
        "y": 1,
        "static": false
      },
      {
        "h": 2,
        "i": "KnowledgePanel.Tags",
        "w": 2,
        "x": 6,
        "y": 2,
        "static": false
      },
      {
        "h": 2,
        "i": "KnowledgePanel.GlossaryTerms",
        "w": 2,
        "x": 6,
        "y": 3,
        "static": false
      },
      {
        "h": 2,
        "i": "KnowledgePanel.KnowledgeArticle",
        "w": 2,
        "x": 6,
        "y": 5,
        "static": false
      },
      {
        "h": 4,
        "i": "KnowledgePanel.CustomProperties",
        "w": 2,
        "x": 6,
        "y": 6,
        "static": false
      }
    ],
    "widgets": [
      {
        "fqn": "KnowledgePanel.Description",
        "labelKey": "label.description",
        "gridSizes": [
          "small",
          "large"
        ]
      },
      {
        "fqn": "KnowledgePanel.APIEndpoints",
        "labelKey": "label.api-endpoint",
        "gridSizes": [
          "large"
        ]
      },
      {
        "fqn": "KnowledgePanel.DataProducts",
        "labelKey": "label.data-product-plural",
        "gridSizes": [
          "small"
        ]
      },
      {
        "fqn": "KnowledgePanel.Tags",
        "labelKey": "label.tag-plural",
        "gridSizes": [
          "small"
        ]
      },
      {
        "fqn": "KnowledgePanel.GlossaryTerms",
        "labelKey": "label.glossary-term-plural",
        "gridSizes": [
          "small"
        ]
      },
      {
        "fqn": "KnowledgePanel.CustomProperties",
        "labelKey": "label.custom-property-plural",
        "gridSizes": [
          "small",
          "large"
        ]
      },
      {
        "fqn": "KnowledgePanel.KnowledgeArticle",
        "labelKey": "label.article-plural",
        "gridSizes": [
          "large"
        ]
      }
    ],
    "tabs": [
      {
        "id": "apiEndpoint",
        "editable": true,
        "displayLabelKey": "TAB_LABEL_MAP"
      },
      {
        "id": "activity_feed",
        "editable": false,
        "displayLabelKey": "TAB_LABEL_MAP"
      },
      {
        "id": "contract",
        "editable": false,
        "displayLabelKey": "TAB_LABEL_MAP"
      },
      {
        "id": "custom_properties",
        "editable": false,
        "displayLabelKey": "TAB_LABEL_MAP"
      }
    ],
    "dummy": {
      "name": "store",
      "displayName": "Store",
      "fullyQualifiedName": "pet_api_service",
      "description": ""
    },
    "file": "utils/APICollection/APICollectionClassBase.ts"
  },
  "Chart": {
    "heights": {
      "KnowledgePanel.Description": 2,
      "KnowledgePanel.DataProducts": 2,
      "KnowledgePanel.Tags": 2,
      "KnowledgePanel.GlossaryTerms": 2,
      "KnowledgePanel.KnowledgeArticle": 2
    },
    "heightMap": {
      "KnowledgePanel.Description": 2,
      "KnowledgePanel.DataProducts": 2,
      "KnowledgePanel.Tags": 2,
      "KnowledgePanel.GlossaryTerms": 2
    },
    "heightFallback": 1,
    "layoutAppliesTo": [
      "details"
    ],
    "defaultLayout": [
      {
        "h": 2.3,
        "i": "KnowledgePanel.LeftPanel",
        "w": 6,
        "x": 0,
        "y": 0,
        "children": [
          {
            "h": 2,
            "i": "KnowledgePanel.Description",
            "w": 1,
            "x": 0,
            "y": 0,
            "static": false
          }
        ],
        "static": true
      },
      {
        "h": 2,
        "i": "KnowledgePanel.DataProducts",
        "w": 2,
        "x": 6,
        "y": 1,
        "static": false
      },
      {
        "h": 2,
        "i": "KnowledgePanel.Tags",
        "w": 2,
        "x": 6,
        "y": 2,
        "static": false
      },
      {
        "h": 2,
        "i": "KnowledgePanel.KnowledgeArticle",
        "w": 2,
        "x": 6,
        "y": 5,
        "static": false
      },
      {
        "h": 2,
        "i": "KnowledgePanel.GlossaryTerms",
        "w": 2,
        "x": 6,
        "y": 3,
        "static": false
      }
    ],
    "widgets": [
      {
        "fqn": "KnowledgePanel.Description",
        "labelKey": "label.description",
        "gridSizes": [
          "small",
          "large"
        ]
      },
      {
        "fqn": "KnowledgePanel.DataProducts",
        "labelKey": "label.data-product-plural",
        "gridSizes": [
          "small"
        ]
      },
      {
        "fqn": "KnowledgePanel.Tags",
        "labelKey": "label.tag-plural",
        "gridSizes": [
          "small"
        ]
      },
      {
        "fqn": "KnowledgePanel.GlossaryTerms",
        "labelKey": "label.glossary-term-plural",
        "gridSizes": [
          "small"
        ]
      },
      {
        "fqn": "KnowledgePanel.KnowledgeArticle",
        "labelKey": "label.article-plural",
        "gridSizes": [
          "large"
        ]
      }
    ],
    "tabs": [
      {
        "id": "details",
        "editable": true,
        "displayLabelKey": "TAB_LABEL_MAP"
      },
      {
        "id": "activity_feed",
        "editable": false,
        "displayLabelKey": "TAB_LABEL_MAP"
      },
      {
        "id": "lineage",
        "editable": false,
        "displayLabelKey": "TAB_LABEL_MAP"
      },
      {
        "id": "contract",
        "editable": false,
        "displayLabelKey": "TAB_LABEL_MAP"
      },
      {
        "id": "custom_properties",
        "editable": false,
        "displayLabelKey": "TAB_LABEL_MAP"
      }
    ],
    "dummy": {
      "id": "21dd6360-d1f2-4810-8759-6ab92c4f033e",
      "name": "31",
      "displayName": "Sales Chart",
      "fullyQualifiedName": "sample_superset.31",
      "description": ""
    },
    "file": "utils/ChartDetailsClassBase.ts"
  },
  "Directory": {
    "heights": {
      "KnowledgePanel.Description": 2,
      "KnowledgePanel.DirectoryChildren": 8,
      "KnowledgePanel.DataProducts": 2,
      "KnowledgePanel.Tags": 2,
      "KnowledgePanel.GlossaryTerms": 2,
      "KnowledgePanel.CustomProperties": 4,
      "KnowledgePanel.KnowledgeArticle": 2
    },
    "heightMap": {
      "KnowledgePanel.Description": 2,
      "KnowledgePanel.DirectoryChildren": 8,
      "KnowledgePanel.DataProducts": 2,
      "KnowledgePanel.Tags": 2,
      "KnowledgePanel.GlossaryTerms": 2,
      "KnowledgePanel.CustomProperties": 4
    },
    "heightFallback": 1,
    "layoutAppliesTo": [
      "children"
    ],
    "defaultLayout": [
      {
        "h": 10.5,
        "i": "KnowledgePanel.LeftPanel",
        "w": 6,
        "x": 0,
        "y": 0,
        "children": [
          {
            "h": 2,
            "i": "KnowledgePanel.Description",
            "w": 1,
            "x": 0,
            "y": 0,
            "static": false
          },
          {
            "h": 8,
            "i": "KnowledgePanel.DirectoryChildren",
            "w": 1,
            "x": 0,
            "y": 1,
            "static": false
          }
        ],
        "static": true
      },
      {
        "h": 2,
        "i": "KnowledgePanel.DataProducts",
        "w": 2,
        "x": 6,
        "y": 1,
        "static": false
      },
      {
        "h": 2,
        "i": "KnowledgePanel.Tags",
        "w": 2,
        "x": 6,
        "y": 2,
        "static": false
      },
      {
        "h": 2,
        "i": "KnowledgePanel.GlossaryTerms",
        "w": 2,
        "x": 6,
        "y": 3,
        "static": false
      },
      {
        "h": 2,
        "i": "KnowledgePanel.KnowledgeArticle",
        "w": 2,
        "x": 6,
        "y": 5,
        "static": false
      },
      {
        "h": 4,
        "i": "KnowledgePanel.CustomProperties",
        "w": 2,
        "x": 6,
        "y": 6,
        "static": false
      }
    ],
    "widgets": [
      {
        "fqn": "KnowledgePanel.Description",
        "labelKey": "label.description",
        "gridSizes": [
          "small",
          "large"
        ]
      },
      {
        "fqn": "KnowledgePanel.DirectoryChildren",
        "labelKey": "label.children",
        "gridSizes": [
          "large"
        ]
      },
      {
        "fqn": "KnowledgePanel.DataProducts",
        "labelKey": "label.data-product-plural",
        "gridSizes": [
          "small"
        ]
      },
      {
        "fqn": "KnowledgePanel.Tags",
        "labelKey": "label.tag-plural",
        "gridSizes": [
          "small"
        ]
      },
      {
        "fqn": "KnowledgePanel.GlossaryTerms",
        "labelKey": "label.glossary-term-plural",
        "gridSizes": [
          "small"
        ]
      },
      {
        "fqn": "KnowledgePanel.CustomProperties",
        "labelKey": "label.custom-property-plural",
        "gridSizes": [
          "small",
          "large"
        ]
      },
      {
        "fqn": "KnowledgePanel.KnowledgeArticle",
        "labelKey": "label.article-plural",
        "gridSizes": [
          "large"
        ]
      }
    ],
    "tabs": [
      {
        "id": "children",
        "editable": true,
        "displayLabelKey": "TAB_LABEL_MAP"
      },
      {
        "id": "activity_feed",
        "editable": false,
        "displayLabelKey": "TAB_LABEL_MAP"
      },
      {
        "id": "lineage",
        "editable": false,
        "displayLabelKey": "TAB_LABEL_MAP"
      },
      {
        "id": "contract",
        "editable": false,
        "displayLabelKey": "TAB_LABEL_MAP"
      },
      {
        "id": "custom_properties",
        "editable": false,
        "displayLabelKey": "TAB_LABEL_MAP"
      }
    ],
    "dummy": {
      "id": "867ee20c-b254-475c-b0ef-50195c07039a",
      "name": "Social_Media",
      "displayName": "Social Media Assets",
      "fullyQualifiedName": "sample_google_drive.Marketing.Campaigns_2024.Social_Media",
      "description": "Images and videos for social media"
    },
    "file": "utils/DirectoryClassBase.ts"
  },
  "File": {
    "heights": {
      "KnowledgePanel.Description": 2,
      "KnowledgePanel.DataProducts": 2,
      "KnowledgePanel.Tags": 2,
      "KnowledgePanel.GlossaryTerms": 2,
      "KnowledgePanel.CustomProperties": 4,
      "KnowledgePanel.KnowledgeArticle": 2
    },
    "heightMap": {
      "KnowledgePanel.Description": 2,
      "KnowledgePanel.DataProducts": 2,
      "KnowledgePanel.Tags": 2,
      "KnowledgePanel.GlossaryTerms": 2,
      "KnowledgePanel.CustomProperties": 4
    },
    "heightFallback": 1,
    "layoutAppliesTo": [
      "overview"
    ],
    "defaultLayout": [
      {
        "h": 2.5,
        "i": "KnowledgePanel.LeftPanel",
        "w": 6,
        "x": 0,
        "y": 0,
        "children": [
          {
            "h": 2,
            "i": "KnowledgePanel.Description",
            "w": 1,
            "x": 0,
            "y": 0,
            "static": false
          }
        ],
        "static": true
      },
      {
        "h": 2,
        "i": "KnowledgePanel.DataProducts",
        "w": 2,
        "x": 6,
        "y": 1,
        "static": false
      },
      {
        "h": 2,
        "i": "KnowledgePanel.Tags",
        "w": 2,
        "x": 6,
        "y": 2,
        "static": false
      },
      {
        "h": 2,
        "i": "KnowledgePanel.GlossaryTerms",
        "w": 2,
        "x": 6,
        "y": 3,
        "static": false
      },
      {
        "h": 2,
        "i": "KnowledgePanel.KnowledgeArticle",
        "w": 2,
        "x": 6,
        "y": 5,
        "static": false
      },
      {
        "h": 4,
        "i": "KnowledgePanel.CustomProperties",
        "w": 2,
        "x": 6,
        "y": 6,
        "static": false
      }
    ],
    "widgets": [
      {
        "fqn": "KnowledgePanel.Description",
        "labelKey": "label.description",
        "gridSizes": [
          "small",
          "large"
        ]
      },
      {
        "fqn": "KnowledgePanel.DataProducts",
        "labelKey": "label.data-product-plural",
        "gridSizes": [
          "small"
        ]
      },
      {
        "fqn": "KnowledgePanel.Tags",
        "labelKey": "label.tag-plural",
        "gridSizes": [
          "small"
        ]
      },
      {
        "fqn": "KnowledgePanel.GlossaryTerms",
        "labelKey": "label.glossary-term-plural",
        "gridSizes": [
          "small"
        ]
      },
      {
        "fqn": "KnowledgePanel.CustomProperties",
        "labelKey": "label.custom-property-plural",
        "gridSizes": [
          "small",
          "large"
        ]
      },
      {
        "fqn": "KnowledgePanel.KnowledgeArticle",
        "labelKey": "label.article-plural",
        "gridSizes": [
          "large"
        ]
      }
    ],
    "tabs": [
      {
        "id": "overview",
        "editable": true,
        "displayLabelKey": "TAB_LABEL_MAP"
      },
      {
        "id": "schema",
        "editable": false,
        "displayLabelKey": "TAB_LABEL_MAP"
      },
      {
        "id": "activity_feed",
        "editable": false,
        "displayLabelKey": "TAB_LABEL_MAP"
      },
      {
        "id": "lineage",
        "editable": false,
        "displayLabelKey": "TAB_LABEL_MAP"
      },
      {
        "id": "contract",
        "editable": false,
        "displayLabelKey": "TAB_LABEL_MAP"
      },
      {
        "id": "custom_properties",
        "editable": false,
        "displayLabelKey": "TAB_LABEL_MAP"
      }
    ],
    "dummy": {
      "id": "6e5d3382-c46c-43b3-82d2-0b927b9b9946",
      "name": "marketing_strategy_2024.pdf",
      "displayName": "Marketing Strategy 2024",
      "fullyQualifiedName": "sample_google_drive.Marketing.\"marketing_strategy_2024.pdf\"",
      "description": "Comprehensive marketing strategy document for 2024"
    },
    "file": "utils/FileClassBase.ts"
  },
  "Spreadsheet": {
    "heights": {
      "KnowledgePanel.Description": 2,
      "KnowledgePanel.Worksheets": 8,
      "KnowledgePanel.DataProducts": 2,
      "KnowledgePanel.Tags": 2,
      "KnowledgePanel.GlossaryTerms": 2,
      "KnowledgePanel.CustomProperties": 4,
      "KnowledgePanel.KnowledgeArticle": 2
    },
    "heightMap": {
      "KnowledgePanel.Description": 2,
      "KnowledgePanel.Worksheets": 8,
      "KnowledgePanel.DataProducts": 2,
      "KnowledgePanel.Tags": 2,
      "KnowledgePanel.GlossaryTerms": 2,
      "KnowledgePanel.CustomProperties": 4
    },
    "heightFallback": 1,
    "layoutAppliesTo": [
      "worksheets"
    ],
    "defaultLayout": [
      {
        "h": 10.5,
        "i": "KnowledgePanel.LeftPanel",
        "w": 6,
        "x": 0,
        "y": 0,
        "children": [
          {
            "h": 2,
            "i": "KnowledgePanel.Description",
            "w": 1,
            "x": 0,
            "y": 0,
            "static": false
          },
          {
            "h": 8,
            "i": "KnowledgePanel.Worksheets",
            "w": 1,
            "x": 0,
            "y": 1,
            "static": false
          }
        ],
        "static": true
      },
      {
        "h": 2,
        "i": "KnowledgePanel.DataProducts",
        "w": 2,
        "x": 6,
        "y": 1,
        "static": false
      },
      {
        "h": 2,
        "i": "KnowledgePanel.Tags",
        "w": 2,
        "x": 6,
        "y": 2,
        "static": false
      },
      {
        "h": 2,
        "i": "KnowledgePanel.GlossaryTerms",
        "w": 2,
        "x": 6,
        "y": 3,
        "static": false
      },
      {
        "h": 2,
        "i": "KnowledgePanel.KnowledgeArticle",
        "w": 2,
        "x": 6,
        "y": 5,
        "static": false
      },
      {
        "h": 4,
        "i": "KnowledgePanel.CustomProperties",
        "w": 2,
        "x": 6,
        "y": 6,
        "static": false
      }
    ],
    "widgets": [
      {
        "fqn": "KnowledgePanel.Description",
        "labelKey": "label.description",
        "gridSizes": [
          "small",
          "large"
        ]
      },
      {
        "fqn": "KnowledgePanel.Worksheets",
        "labelKey": "label.worksheet-plural",
        "gridSizes": [
          "large"
        ]
      },
      {
        "fqn": "KnowledgePanel.DataProducts",
        "labelKey": "label.data-product-plural",
        "gridSizes": [
          "small"
        ]
      },
      {
        "fqn": "KnowledgePanel.Tags",
        "labelKey": "label.tag-plural",
        "gridSizes": [
          "small"
        ]
      },
      {
        "fqn": "KnowledgePanel.GlossaryTerms",
        "labelKey": "label.glossary-term-plural",
        "gridSizes": [
          "small"
        ]
      },
      {
        "fqn": "KnowledgePanel.CustomProperties",
        "labelKey": "label.custom-property-plural",
        "gridSizes": [
          "small",
          "large"
        ]
      },
      {
        "fqn": "KnowledgePanel.KnowledgeArticle",
        "labelKey": "label.article-plural",
        "gridSizes": [
          "large"
        ]
      }
    ],
    "tabs": [
      {
        "id": "worksheets",
        "editable": true,
        "displayLabelKey": "TAB_LABEL_MAP"
      },
      {
        "id": "activity_feed",
        "editable": false,
        "displayLabelKey": "TAB_LABEL_MAP"
      },
      {
        "id": "lineage",
        "editable": false,
        "displayLabelKey": "TAB_LABEL_MAP"
      },
      {
        "id": "contract",
        "editable": false,
        "displayLabelKey": "TAB_LABEL_MAP"
      },
      {
        "id": "custom_properties",
        "editable": false,
        "displayLabelKey": "TAB_LABEL_MAP"
      }
    ],
    "dummy": {
      "id": "492de8cb-2d1d-4dd2-982d-a16cbaff9be7",
      "name": "campaign_performance_tracker",
      "displayName": "Campaign Performance Tracker",
      "fullyQualifiedName": "sample_google_drive.campaign_performance_tracker",
      "description": "Real-time tracking of marketing campaign metrics and ROI"
    },
    "file": "utils/SpreadsheetClassBase.ts"
  },
  "Worksheet": {
    "heights": {
      "KnowledgePanel.Description": 2,
      "KnowledgePanel.WorksheetColumns": 8,
      "KnowledgePanel.DataProducts": 2,
      "KnowledgePanel.Tags": 2,
      "KnowledgePanel.GlossaryTerms": 2,
      "KnowledgePanel.CustomProperties": 4,
      "KnowledgePanel.KnowledgeArticle": 2
    },
    "heightMap": {
      "KnowledgePanel.Description": 2,
      "KnowledgePanel.WorksheetColumns": 8,
      "KnowledgePanel.DataProducts": 2,
      "KnowledgePanel.Tags": 2,
      "KnowledgePanel.GlossaryTerms": 2,
      "KnowledgePanel.CustomProperties": 4
    },
    "heightFallback": 1,
    "layoutAppliesTo": [
      "schema"
    ],
    "defaultLayout": [
      {
        "h": 10.5,
        "i": "KnowledgePanel.LeftPanel",
        "w": 6,
        "x": 0,
        "y": 0,
        "children": [
          {
            "h": 2,
            "i": "KnowledgePanel.Description",
            "w": 1,
            "x": 0,
            "y": 0,
            "static": false
          },
          {
            "h": 8,
            "i": "KnowledgePanel.WorksheetColumns",
            "w": 1,
            "x": 0,
            "y": 1,
            "static": false
          }
        ],
        "static": true
      },
      {
        "h": 2,
        "i": "KnowledgePanel.DataProducts",
        "w": 2,
        "x": 6,
        "y": 1,
        "static": false
      },
      {
        "h": 2,
        "i": "KnowledgePanel.Tags",
        "w": 2,
        "x": 6,
        "y": 2,
        "static": false
      },
      {
        "h": 2,
        "i": "KnowledgePanel.GlossaryTerms",
        "w": 2,
        "x": 6,
        "y": 3,
        "static": false
      },
      {
        "h": 2,
        "i": "KnowledgePanel.KnowledgeArticle",
        "w": 2,
        "x": 6,
        "y": 5,
        "static": false
      },
      {
        "h": 4,
        "i": "KnowledgePanel.CustomProperties",
        "w": 2,
        "x": 6,
        "y": 6,
        "static": false
      }
    ],
    "widgets": [
      {
        "fqn": "KnowledgePanel.Description",
        "labelKey": "label.description",
        "gridSizes": [
          "small",
          "large"
        ]
      },
      {
        "fqn": "KnowledgePanel.WorksheetColumns",
        "labelKey": "label.column-plural",
        "gridSizes": [
          "large"
        ]
      },
      {
        "fqn": "KnowledgePanel.DataProducts",
        "labelKey": "label.data-product-plural",
        "gridSizes": [
          "small"
        ]
      },
      {
        "fqn": "KnowledgePanel.Tags",
        "labelKey": "label.tag-plural",
        "gridSizes": [
          "small"
        ]
      },
      {
        "fqn": "KnowledgePanel.GlossaryTerms",
        "labelKey": "label.glossary-term-plural",
        "gridSizes": [
          "small"
        ]
      },
      {
        "fqn": "KnowledgePanel.CustomProperties",
        "labelKey": "label.custom-property-plural",
        "gridSizes": [
          "small",
          "large"
        ]
      },
      {
        "fqn": "KnowledgePanel.KnowledgeArticle",
        "labelKey": "label.article-plural",
        "gridSizes": [
          "large"
        ]
      }
    ],
    "tabs": [
      {
        "id": "schema",
        "editable": true,
        "displayLabelKey": "TAB_LABEL_MAP"
      },
      {
        "id": "activity_feed",
        "editable": false,
        "displayLabelKey": "TAB_LABEL_MAP"
      },
      {
        "id": "lineage",
        "editable": false,
        "displayLabelKey": "TAB_LABEL_MAP"
      },
      {
        "id": "contract",
        "editable": false,
        "displayLabelKey": "TAB_LABEL_MAP"
      },
      {
        "id": "custom_properties",
        "editable": false,
        "displayLabelKey": "TAB_LABEL_MAP"
      }
    ],
    "dummy": {
      "id": "20180ea6-8a42-4b81-bfce-1c55b8b84e35",
      "name": "Sales_Pipeline",
      "displayName": "Sales Pipeline",
      "fullyQualifiedName": "sample_google_drive.sales_forecast_2024.Sales_Pipeline",
      "description": "Active sales opportunities tracking"
    },
    "file": "utils/WorksheetClassBase.ts"
  },
  "Domain": {
    "heights": {
      "KnowledgePanel.Description": 4,
      "KnowledgePanel.Owners": 1.5,
      "KnowledgePanel.Tier": 1.5,
      "KnowledgePanel.Certification": 1.5,
      "KnowledgePanel.Tags": 2,
      "KnowledgePanel.GlossaryTerms": 2,
      "KnowledgePanel.Experts": 2,
      "KnowledgePanel.DomainType": 2,
      "KnowledgePanel.CustomProperties": 4,
      "KnowledgePanel.KnowledgeArticle": 2
    },
    "heightMap": {
      "KnowledgePanel.Description": 4,
      "KnowledgePanel.Owners": 1.5,
      "KnowledgePanel.Tier": 1.5,
      "KnowledgePanel.Certification": 1.5,
      "KnowledgePanel.Tags": 2,
      "KnowledgePanel.GlossaryTerms": 2,
      "KnowledgePanel.Experts": 2,
      "KnowledgePanel.DomainType": 2,
      "KnowledgePanel.CustomProperties": 4
    },
    "heightFallback": 1,
    "layoutAppliesTo": [
      "documentation"
    ],
    "defaultLayout": [
      {
        "h": 4.5,
        "i": "KnowledgePanel.LeftPanel",
        "w": 6,
        "x": 0,
        "y": 0,
        "children": [
          {
            "h": 4,
            "i": "KnowledgePanel.Description",
            "w": 1,
            "x": 0,
            "y": 0,
            "static": false
          }
        ],
        "static": true
      },
      {
        "h": 1.5,
        "i": "KnowledgePanel.Owners",
        "w": 2,
        "x": 6,
        "y": 0,
        "static": false
      },
      {
        "h": 1.5,
        "i": "KnowledgePanel.Tier",
        "w": 2,
        "x": 6,
        "y": 1,
        "static": false
      },
      {
        "h": 1.5,
        "i": "KnowledgePanel.Certification",
        "w": 2,
        "x": 6,
        "y": 2,
        "static": false
      },
      {
        "h": 2,
        "i": "KnowledgePanel.Tags",
        "w": 2,
        "x": 6,
        "y": 3,
        "static": false
      },
      {
        "h": 2,
        "i": "KnowledgePanel.GlossaryTerms",
        "w": 2,
        "x": 6,
        "y": 4,
        "static": false
      },
      {
        "h": 2,
        "i": "KnowledgePanel.Experts",
        "w": 2,
        "x": 6,
        "y": 5,
        "static": false
      },
      {
        "h": 2,
        "i": "KnowledgePanel.DomainType",
        "w": 2,
        "x": 6,
        "y": 6,
        "static": false
      },
      {
        "h": 4,
        "i": "KnowledgePanel.CustomProperties",
        "w": 2,
        "x": 6,
        "y": 7,
        "static": false
      }
    ],
    "widgets": [
      {
        "fqn": "KnowledgePanel.Description",
        "labelKey": "label.description",
        "gridSizes": [
          "small",
          "large"
        ]
      },
      {
        "fqn": "KnowledgePanel.Owners",
        "labelKey": "label.owner-plural",
        "gridSizes": [
          "large"
        ]
      },
      {
        "fqn": "KnowledgePanel.Experts",
        "labelKey": "label.expert-plural",
        "gridSizes": [
          "large"
        ]
      },
      {
        "fqn": "KnowledgePanel.DomainType",
        "labelKey": "label.domain-type",
        "gridSizes": [
          "large"
        ]
      },
      {
        "fqn": "KnowledgePanel.CustomProperties",
        "labelKey": "label.custom-property-plural",
        "gridSizes": [
          "small",
          "large"
        ]
      },
      {
        "fqn": "KnowledgePanel.KnowledgeArticle",
        "labelKey": "label.article-plural",
        "gridSizes": [
          "large"
        ]
      }
    ],
    "tabs": [
      {
        "id": "documentation",
        "editable": true,
        "displayLabelKey": "TAB_LABEL_MAP"
      },
      {
        "id": "subdomains",
        "editable": false,
        "displayLabelKey": "TAB_LABEL_MAP"
      },
      {
        "id": "data_products",
        "editable": false,
        "displayLabelKey": "TAB_LABEL_MAP"
      },
      {
        "id": "activity_feed",
        "editable": false,
        "displayLabelKey": "TAB_LABEL_MAP"
      },
      {
        "id": "assets",
        "editable": false,
        "displayLabelKey": "TAB_LABEL_MAP"
      },
      {
        "id": "custom_properties",
        "editable": false,
        "displayLabelKey": "TAB_LABEL_MAP"
      },
      {
        "id": "data_observability",
        "editable": false,
        "displayLabelKey": "TAB_LABEL_MAP"
      }
    ],
    "dummy": {
      "id": "31c2b84e-b87a-4e47-934f-9c5309fbb7c3",
      "name": "Engineering",
      "displayName": "Engineering",
      "fullyQualifiedName": "Engineering",
      "description": "Domain related engineering development."
    },
    "file": "utils/Domain/DomainClassBase.ts"
  },
  "DataProduct": {
    "heights": {
      "KnowledgePanel.Description": 4,
      "KnowledgePanel.Owners": 1.5,
      "KnowledgePanel.Tier": 1.5,
      "KnowledgePanel.Certification": 1.5,
      "KnowledgePanel.Tags": 2,
      "KnowledgePanel.GlossaryTerms": 2,
      "KnowledgePanel.Experts": 2,
      "KnowledgePanel.Domain": 1.5,
      "KnowledgePanel.CustomProperties": 4,
      "KnowledgePanel.KnowledgeArticle": 2
    },
    "heightMap": {
      "KnowledgePanel.Description": 4,
      "KnowledgePanel.Owners": 1.5,
      "KnowledgePanel.Tier": 1.5,
      "KnowledgePanel.Certification": 1.5,
      "KnowledgePanel.Tags": 2,
      "KnowledgePanel.GlossaryTerms": 2,
      "KnowledgePanel.Experts": 2,
      "KnowledgePanel.Domain": 1.5,
      "KnowledgePanel.CustomProperties": 4
    },
    "heightFallback": 1,
    "layoutAppliesTo": [
      "documentation"
    ],
    "defaultLayout": [
      {
        "h": 4.5,
        "i": "KnowledgePanel.LeftPanel",
        "w": 6,
        "x": 0,
        "y": 0,
        "children": [
          {
            "h": 4,
            "i": "KnowledgePanel.Description",
            "w": 1,
            "x": 0,
            "y": 0,
            "static": false
          }
        ],
        "static": true
      },
      {
        "h": 1.5,
        "i": "KnowledgePanel.Domain",
        "w": 2,
        "x": 6,
        "y": 0,
        "static": false
      },
      {
        "h": 1.5,
        "i": "KnowledgePanel.Owners",
        "w": 2,
        "x": 6,
        "y": 1,
        "static": false
      },
      {
        "h": 1.5,
        "i": "KnowledgePanel.Tier",
        "w": 2,
        "x": 6,
        "y": 2,
        "static": false
      },
      {
        "h": 1.5,
        "i": "KnowledgePanel.Certification",
        "w": 2,
        "x": 6,
        "y": 3,
        "static": false
      },
      {
        "h": 2,
        "i": "KnowledgePanel.Tags",
        "w": 2,
        "x": 6,
        "y": 4,
        "static": false
      },
      {
        "h": 2,
        "i": "KnowledgePanel.GlossaryTerms",
        "w": 2,
        "x": 6,
        "y": 5,
        "static": false
      },
      {
        "h": 2,
        "i": "KnowledgePanel.Experts",
        "w": 2,
        "x": 6,
        "y": 6,
        "static": false
      },
      {
        "h": 2,
        "i": "KnowledgePanel.KnowledgeArticle",
        "w": 2,
        "x": 6,
        "y": 7,
        "static": false
      },
      {
        "h": 4,
        "i": "KnowledgePanel.CustomProperties",
        "w": 2,
        "x": 6,
        "y": 8,
        "static": false
      }
    ],
    "widgets": [
      {
        "fqn": "KnowledgePanel.Description",
        "labelKey": "label.description",
        "gridSizes": [
          "small",
          "large"
        ]
      },
      {
        "fqn": "KnowledgePanel.Domain",
        "labelKey": "label.domain",
        "gridSizes": [
          "large"
        ]
      },
      {
        "fqn": "KnowledgePanel.Owners",
        "labelKey": "label.owner-plural",
        "gridSizes": [
          "large"
        ]
      },
      {
        "fqn": "KnowledgePanel.Experts",
        "labelKey": "label.expert-plural",
        "gridSizes": [
          "large"
        ]
      },
      {
        "fqn": "KnowledgePanel.CustomProperties",
        "labelKey": "label.custom-property-plural",
        "gridSizes": [
          "small",
          "large"
        ]
      },
      {
        "fqn": "KnowledgePanel.KnowledgeArticle",
        "labelKey": "label.article-plural",
        "gridSizes": [
          "large"
        ]
      }
    ],
    "tabs": [
      {
        "id": "documentation",
        "editable": true,
        "displayLabelKey": "TAB_LABEL_MAP"
      },
      {
        "id": "activity_feed",
        "editable": false,
        "displayLabelKey": "TAB_LABEL_MAP"
      },
      {
        "id": "input_output_ports",
        "editable": false,
        "displayLabelKey": "TAB_LABEL_MAP"
      },
      {
        "id": "assets",
        "editable": false,
        "displayLabelKey": "TAB_LABEL_MAP"
      },
      {
        "id": "contract",
        "editable": false,
        "displayLabelKey": "TAB_LABEL_MAP"
      },
      {
        "id": "data_observability",
        "editable": false,
        "displayLabelKey": "TAB_LABEL_MAP"
      },
      {
        "id": "custom_properties",
        "editable": false,
        "displayLabelKey": "TAB_LABEL_MAP"
      }
    ],
    "dummy": {
      "id": "dummy-data-product",
      "name": "Sample Data Product",
      "displayName": "Sample Data Product",
      "fullyQualifiedName": "sample.dataProduct",
      "description": "This is a sample data product for demonstration purposes"
    },
    "file": "utils/DataProduct/DataProductClassBase.ts"
  },
  "Tag": {
    "heights": {
      "KnowledgePanel.Description": 4,
      "KnowledgePanel.Owners": 1.5,
      "KnowledgePanel.Domain": 1.5
    },
    "heightMap": {
      "KnowledgePanel.Description": 4,
      "KnowledgePanel.Owners": 1.5,
      "KnowledgePanel.Domain": 1.5
    },
    "heightFallback": 1,
    "layoutAppliesTo": [
      "overview"
    ],
    "defaultLayout": [
      {
        "h": 4.5,
        "i": "KnowledgePanel.LeftPanel",
        "w": 6,
        "x": 0,
        "y": 0,
        "children": [
          {
            "h": 4,
            "i": "KnowledgePanel.Description",
            "w": 1,
            "x": 0,
            "y": 0,
            "static": false
          }
        ],
        "static": true
      },
      {
        "h": 1.5,
        "i": "KnowledgePanel.Domain",
        "w": 2,
        "x": 6,
        "y": 0,
        "static": false
      },
      {
        "h": 1.5,
        "i": "KnowledgePanel.Owners",
        "w": 2,
        "x": 6,
        "y": 1,
        "static": false
      }
    ],
    "widgets": [
      {
        "fqn": "KnowledgePanel.Description",
        "labelKey": "label.description",
        "gridSizes": [
          "small",
          "large"
        ]
      },
      {
        "fqn": "KnowledgePanel.Domain",
        "labelKey": "label.domain",
        "gridSizes": [
          "large"
        ]
      },
      {
        "fqn": "KnowledgePanel.Owners",
        "labelKey": "label.owner-plural",
        "gridSizes": [
          "large"
        ]
      },
      {
        "fqn": "KnowledgePanel.KnowledgeArticle",
        "labelKey": "label.article-plural",
        "gridSizes": [
          "large"
        ]
      }
    ],
    "tabs": [
      {
        "id": "overview",
        "editable": true,
        "displayLabelKey": "TAB_LABEL_MAP"
      },
      {
        "id": "assets",
        "editable": false,
        "displayLabelKey": "TAB_LABEL_MAP"
      },
      {
        "id": "activity_feed",
        "editable": false,
        "displayLabelKey": "TAB_LABEL_MAP"
      },
      {
        "id": "custom_properties",
        "editable": false,
        "displayLabelKey": "TAB_LABEL_MAP"
      },
      {
        "id": "data_observability",
        "editable": false,
        "displayLabelKey": "TAB_LABEL_MAP"
      }
    ],
    "dummy": {
      "id": "dummy-tag",
      "name": "Sample Tag",
      "displayName": "Sample Tag",
      "fullyQualifiedName": "sample.classification.tag",
      "description": "This is a sample tag for demonstration purposes"
    },
    "file": "utils/TagClassBase.ts"
  },
  "DataMarketplace": {
    "heights": {
      "KnowledgePanel.MarketplaceDataProducts": 1,
      "KnowledgePanel.MarketplaceDomains": 1
    },
    "heightMap": {
      "KnowledgePanel.MarketplaceDataProducts": 1,
      "KnowledgePanel.MarketplaceDomains": 1
    },
    "heightFallback": 1,
    "layoutAppliesTo": [
      "overview"
    ],
    "defaultLayout": [
      {
        "h": 1,
        "i": "KnowledgePanel.MarketplaceDataProducts",
        "w": 8,
        "x": 0,
        "y": 0,
        "static": false
      },
      {
        "h": 1,
        "i": "KnowledgePanel.MarketplaceDomains",
        "w": 8,
        "x": 0,
        "y": 1,
        "static": false
      }
    ],
    "widgets": [
      {
        "fqn": "KnowledgePanel.MarketplaceDataProducts",
        "labelKey": "label.data-product-plural",
        "gridSizes": [
          "large"
        ]
      },
      {
        "fqn": "KnowledgePanel.MarketplaceDomains",
        "labelKey": "label.domain-plural",
        "gridSizes": [
          "large"
        ]
      },
      {
        "fqn": "KnowledgePanel.KnowledgeArticle",
        "labelKey": "label.article-plural",
        "gridSizes": [
          "large"
        ]
      }
    ],
    "tabs": [
      {
        "id": "overview",
        "editable": true,
        "displayLabelKey": "TAB_LABEL_MAP"
      }
    ],
    "dummy": {},
    "file": "utils/DataMarketplace/DataMarketplaceClassBase.ts"
  },
  "Glossary": {
    "heights": {
      "KnowledgePanel.Header": 1,
      "KnowledgePanel.Description": 2,
      "KnowledgePanel.Tags": 2,
      "KnowledgePanel.Domain": 1.5,
      "KnowledgePanel.CustomProperties": 4,
      "KnowledgePanel.Tabs": 8,
      "KnowledgePanel.Synonyms": 2,
      "KnowledgePanel.RelatedTerms": 2,
      "KnowledgePanel.References": 2,
      "KnowledgePanel.Owner": 2,
      "KnowledgePanel.Reviewer": 2,
      "KnowledgePanel.TermsTable": 7.5,
      "KnowledgePanel.WorkflowHistory": 2
    },
    "heightMap": {},
    "heightFallback": 2,
    "layoutAppliesTo": [
      "terms"
    ],
    "defaultLayout": [
      {
        "h": 9.8,
        "i": "KnowledgePanel.LeftPanel",
        "w": 6,
        "x": 0,
        "y": 0,
        "children": [
          {
            "h": 2,
            "i": "KnowledgePanel.Description",
            "w": 1,
            "x": 0,
            "y": 0,
            "static": false
          },
          {
            "h": 7.5,
            "i": "KnowledgePanel.TermsTable",
            "w": 1,
            "x": 0,
            "y": 0,
            "static": false
          }
        ],
        "static": true
      },
      {
        "h": 1.5,
        "i": "KnowledgePanel.Domain",
        "w": 2,
        "x": 6,
        "y": 0
      },
      {
        "h": 2,
        "i": "KnowledgePanel.Owners",
        "w": 2,
        "x": 6,
        "y": 1,
        "static": false
      },
      {
        "h": 2,
        "i": "KnowledgePanel.Reviewer",
        "w": 2,
        "x": 6,
        "y": 2,
        "static": false
      },
      {
        "h": 2,
        "i": "KnowledgePanel.Tags",
        "w": 2,
        "x": 6,
        "y": 3,
        "static": false
      }
    ],
    "widgets": [
      {
        "fqn": "KnowledgePanel.Description",
        "labelKey": "label.description",
        "gridSizes": [
          "small",
          "large"
        ]
      },
      {
        "fqn": "KnowledgePanel.TermsTable",
        "labelKey": "label.term-plural",
        "gridSizes": [
          "large"
        ]
      },
      {
        "fqn": "KnowledgePanel.Domain",
        "labelKey": "label.domain-plural",
        "gridSizes": [
          "small"
        ]
      },
      {
        "fqn": "KnowledgePanel.References",
        "labelKey": "label.reference-plural",
        "gridSizes": [
          "small"
        ]
      },
      {
        "fqn": "KnowledgePanel.Reviewer",
        "labelKey": "label.reviewer-plural",
        "gridSizes": [
          "small"
        ]
      },
      {
        "fqn": "KnowledgePanel.CustomProperties",
        "labelKey": "label.custom-property-plural",
        "gridSizes": [
          "small",
          "large"
        ]
      },
      {
        "fqn": "KnowledgePanel.Tags",
        "labelKey": "label.tag-plural",
        "gridSizes": [
          "small"
        ]
      },
      {
        "fqn": "KnowledgePanel.KnowledgeArticle",
        "labelKey": "label.article-plural",
        "gridSizes": [
          "large"
        ]
      }
    ],
    "tabs": [
      {
        "id": "terms",
        "editable": true,
        "displayLabelKey": "TAB_LABEL_MAP"
      },
      {
        "id": "review",
        "editable": false,
        "displayLabelKey": "TAB_LABEL_MAP"
      },
      {
        "id": "relations_graph",
        "editable": false,
        "displayLabelKey": "TAB_LABEL_MAP"
      },
      {
        "id": "activity_feed",
        "editable": false,
        "displayLabelKey": "TAB_LABEL_MAP"
      }
    ],
    "dummy": {},
    "file": "utils/CustomizeGlossaryPage/CustomizeGlossaryPage.ts"
  },
  "GlossaryTerm": {
    "heights": {
      "KnowledgePanel.Header": 1,
      "KnowledgePanel.Description": 2,
      "KnowledgePanel.Tags": 2,
      "KnowledgePanel.Domain": 2,
      "KnowledgePanel.CustomProperties": 4,
      "KnowledgePanel.Tabs": 10,
      "KnowledgePanel.Synonyms": 2,
      "KnowledgePanel.RelatedTerms": 2,
      "KnowledgePanel.References": 2,
      "KnowledgePanel.Owner": 2,
      "KnowledgePanel.Reviewer": 2,
      "KnowledgePanel.TermsTable": 1,
      "KnowledgePanel.WorkflowHistory": 1
    },
    "heightMap": {
      "KnowledgePanel.Header": 1,
      "KnowledgePanel.Description": 2,
      "KnowledgePanel.Tags": 2,
      "KnowledgePanel.Domain": 2,
      "KnowledgePanel.CustomProperties": 4,
      "KnowledgePanel.Tabs": 10,
      "KnowledgePanel.Synonyms": 2,
      "KnowledgePanel.RelatedTerms": 2,
      "KnowledgePanel.References": 2,
      "KnowledgePanel.Owner": 2,
      "KnowledgePanel.Reviewer": 2,
      "KnowledgePanel.WorkflowHistory": 1
    },
    "heightFallback": 2,
    "layoutAppliesTo": [
      "overview"
    ],
    "defaultLayout": [
      {
        "h": 7,
        "i": "KnowledgePanel.LeftPanel",
        "w": 6,
        "x": 0,
        "y": 0,
        "children": [
          {
            "h": 2,
            "i": "KnowledgePanel.Description",
            "w": 1,
            "x": 0,
            "y": 0,
            "static": false
          },
          {
            "h": 2,
            "i": "KnowledgePanel.Synonyms",
            "w": 0.5,
            "x": 0,
            "y": 1,
            "static": false
          },
          {
            "h": 2,
            "i": "KnowledgePanel.References",
            "w": 0.5,
            "x": 0,
            "y": 2,
            "static": false
          },
          {
            "h": 2,
            "i": "KnowledgePanel.Tags",
            "w": 0.5,
            "x": 3,
            "y": 2,
            "static": false
          },
          {
            "h": 2,
            "i": "KnowledgePanel.RelatedTerms",
            "w": 1,
            "x": 0,
            "y": 3,
            "static": false
          }
        ],
        "static": true
      },
      {
        "h": 1,
        "i": "KnowledgePanel.WorkflowHistory",
        "w": 2,
        "x": 6,
        "y": 0,
        "static": false
      },
      {
        "h": 2,
        "i": "KnowledgePanel.Domain",
        "w": 2,
        "x": 6,
        "y": 1,
        "static": false
      },
      {
        "h": 2,
        "i": "KnowledgePanel.Owner",
        "w": 2,
        "x": 6,
        "y": 2,
        "static": false
      },
      {
        "h": 2,
        "i": "KnowledgePanel.Reviewer",
        "w": 2,
        "x": 6,
        "y": 3,
        "static": false
      },
      {
        "h": 4,
        "i": "KnowledgePanel.CustomProperties",
        "w": 2,
        "x": 6,
        "y": 4,
        "static": false
      }
    ],
    "widgets": [
      {
        "fqn": "KnowledgePanel.Description",
        "labelKey": "label.description",
        "gridSizes": [
          "small",
          "large"
        ]
      },
      {
        "fqn": "KnowledgePanel.TermsTable",
        "labelKey": "label.term-plural",
        "gridSizes": [
          "large"
        ]
      },
      {
        "fqn": "KnowledgePanel.Domain",
        "labelKey": "label.domain-plural",
        "gridSizes": [
          "small"
        ]
      },
      {
        "fqn": "KnowledgePanel.References",
        "labelKey": "label.reference-plural",
        "gridSizes": [
          "small"
        ]
      },
      {
        "fqn": "KnowledgePanel.Reviewer",
        "labelKey": "label.reviewer-plural",
        "gridSizes": [
          "small"
        ]
      },
      {
        "fqn": "KnowledgePanel.CustomProperties",
        "labelKey": "label.custom-property-plural",
        "gridSizes": [
          "small",
          "large"
        ]
      },
      {
        "fqn": "KnowledgePanel.Tags",
        "labelKey": "label.tag-plural",
        "gridSizes": [
          "small"
        ]
      },
      {
        "fqn": "KnowledgePanel.KnowledgeArticle",
        "labelKey": "label.article-plural",
        "gridSizes": [
          "large"
        ]
      },
      {
        "fqn": "KnowledgePanel.Owner",
        "labelKey": "label.owner-plural",
        "gridSizes": [
          "small"
        ]
      },
      {
        "fqn": "KnowledgePanel.Synonyms",
        "labelKey": "label.synonym-plural",
        "gridSizes": [
          "small"
        ]
      },
      {
        "fqn": "KnowledgePanel.RelatedTerms",
        "labelKey": "label.related-term-plural",
        "gridSizes": [
          "small"
        ]
      }
    ],
    "tabs": [
      {
        "id": "overview",
        "editable": true,
        "displayLabelKey": "TAB_LABEL_MAP"
      },
      {
        "id": "glossary_terms",
        "editable": false,
        "displayLabelKey": "TAB_LABEL_MAP"
      },
      {
        "id": "assets",
        "editable": false,
        "displayLabelKey": "TAB_LABEL_MAP"
      },
      {
        "id": "activity_feed",
        "editable": false,
        "displayLabelKey": "TAB_LABEL_MAP"
      },
      {
        "id": "relations_graph",
        "editable": false,
        "displayLabelKey": "TAB_LABEL_MAP"
      },
      {
        "id": "custom_properties",
        "editable": false,
        "displayLabelKey": "TAB_LABEL_MAP"
      },
      {
        "id": "data_observability",
        "editable": false,
        "displayLabelKey": "TAB_LABEL_MAP"
      }
    ],
    "dummy": {},
    "file": "utils/CustomizeGlossaryTerm/CustomizeGlossaryTermBaseClass.ts"
  }
};
