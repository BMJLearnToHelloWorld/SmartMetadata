# Pipeline sourceConfig becomes a schema-driven form (P-08(b)+(d))

- **Status:** Accepted
- **Revisions:** v1 2026-11-12 (initial)
- **Deciders:** Bai (scope: pipeline deep-dive P-08(b)+(d))
- **Guard:** `smartmetadata-ui/src/ingestion/ingestionSchemas.test.ts`, `smartmetadata-ui/src/components/ingestion/SchemaDrivenSourceConfigForm.test.ts`, `smartmetadata-ui/src/ingestion/sourceConfig.test.ts`, `smartmetadata-ui/src/views/ingestion/AddServiceIngestionView.test.ts`, `smartmetadata-ui/src/views/ingestion/EditPipelineView.test.ts`
- **Related:** `~/workspace/work/pipeline-deep-dive/REPORT.md` §4 (P-08); upstream pin `a3012259ca` (`openmetadata-ui/.../utils/IngestionWorkflowUtils.ts`, `utils/IngestionConfigUtils.ts:245-284`, `utils/JSONSchemaFormUtils.ts`, `utils/ServiceConnectionUtils.ts:181-193`, `constants/ServiceUISchema.constant.ts`, `components/Settings/Services/Ingestion/IngestionWorkflowForm/IngestionWorkflowForm.tsx`)

## Context

The pipeline add/edit forms rendered `sourceConfig` from seven
hand-written fields (`ServiceFilterFields`): `includeViews`,
`includeSchemas`, `includeTopics`, `generateSampleData`,
`includeDashboards`, `includeCharts`, `includeContainers`. Official's
step 1 is a JSON-Schema-driven RJSF form: the schema is selected per
`(pipelineType, serviceCategory)` from the 19 `jsons/ingestionSchemas`
files, with AJV validation, a custom `validateOwnerConfigMaps`
validator, and `cleanWorkFlowData` on submit. The product therefore
missed 100+ fields (database metadata alone has 28 schema properties,
profiler 17, lineage 20, dbt 15 with a required `dbtConfigSource`),
had no excludes inputs anywhere, and sent the wrong config `type`
for `api`/`mlmodel`/`search`/`drive` (fixed in P-08(a)). The form
chain (P-08(a)+(c)) fixed the type mapping and the create-time prefill
from the service connection, and left (b) excludes and (d) the full
schema-driven form to this item.

## Decision

- **The 19 resolver schemas are vendored verbatim.** The files under
  `smartmetadata-ui/src/ingestion/schemas/` are byte-identical copies
  of the pin's `jsons/ingestionSchemas/*.json` used by
  `IngestionWorkflowUtils` (18 pipeline schemas plus
  `testSuitePipeline.json`). They are data, not code: no field is
  pruned, renamed, or re-defaulted. They load by dynamic `import()` so
  the UI bundle does not carry ~1.2 MB of JSON up front
  (`testSuitePipeline.json` alone is 954 KB — it loads only when a
  TestSuite schema form opens). The sub-directory schemas
  (`dbtconfig/`, `engine/`, `parserconfig/`, `policyagentconfig/`,
  `reverseingestionconfig/`, `storage/`) are not vendored: no resolver
  schema `$ref`s them (all `$ref`s are internal `#/definitions/...`
  or `#/properties/...` pointers).
- **The resolver is a faithful port of `IngestionWorkflowUtils`.**
  `getSchemaByWorkflowType(pipelineType, serviceCategory)` merges the
  per-type resolver (`WORKFLOW_TYPE_SCHEMA_RESOLVERS`, including the
  `METADATA_SCHEMA_BY_SERVICE_CATEGORY` table and the
  storage/messaging/database auto-classification split) and applies
  the same schema-level omissions official applies in
  `IngestionWorkflowForm`: `shardedTables` is omitted unless the
  service type is BigQuery, and the six ElasticSearch-connection
  fields (`useSSL`, `verifyCerts`, `timeout`, `caCerts`,
  `useAwsCredentials`, `regionName`) are omitted for
  `elasticSearchReindex` pipelines (official omits them from the form
  data on change and on submit; omitting them from the schema has the
  identical observable effect). Types with no resolver entry
  (`application`, `policyAgent`, `reverseMetadata`) resolve to `{}`
  plus the custom properties, exactly like official's `?? {}`.
  `serviceCategory` is derived from the product `ServiceKind`
  (`database` → `DATABASE_SERVICES`, `metadata` →
  `METADATA_SERVICES`, `api` → `API_SERVICES`, and so on); kinds
  official has no schema for (`llm`, `mcp`, `security`) resolve to
  `{}`.
- **Custom properties are not merged into the form schema.** Official
  merges `name`, `displayName`, `enableDebugLog` (and
  `rootProcessingEngine` for profiler) into the RJSF schema, but the
  product renders those as first-class wizard fields outside the
  schema form (name card P-15, owners P-13, debug-log checkbox P-14).
  The form's data is the `sourceConfig.config` object; the views own
  the rest of the request. `getWorkflowCustomProperties` is still
  ported, including the Spark-agent condition for
  `rootProcessingEngine` (`type` default `ingestionRunner`, `id`
  required) — the product's `getSparkAgentField()` returns
  `undefined`, because no Spark agent integration exists in the
  product, so the field never renders. That is the same behaviour as
  the OSS base at the pin (its `getSparkAgentField()` also returns
  `undefined`; no override exists in the pin). The
  `processingEngine` request field already exists on
  `CreateIngestionPipelineRequest`; on edit it is preserved by the
  P-07 spread (the loaded pipeline never carries it, so `compare`
  emits no op for it).
- **RJSF default seeding is replicated, probe-grounded.**
  `applySchemaDefaults(schema, data)` reproduces
  `@rjsf/utils@5.24.13` `getDefaultFormState` (the pin's version,
  verified by running it against the vendored schemas in
  `/tmp/rjsf-probe`): explicit `default`s seed; objects seed from
  their inner defaults when any exist (`incremental`,
  `shardedTables`, `ownerConfig.enableInheritance`); `oneOf` fields
  with no value take the first branch and seed its defaults
  (`processingEngine` → `{type: 'Native'}`,
  `profileSampleConfig.config` → the dynamic-sampling branch,
  `dbtConfigSource` → the cloud branch); arrays seed to `[]` unless
  a default exists (`metrics` seeds its 19-value default list);
  filter patterns seed to `{includes: [], excludes: []}` and are
  then dropped on submit by `cleanWorkFlowData`. Seeding runs under
  the provided values, so a saved config (edit) or a service
  prefill (create) always wins over a default.
- **Validation is AJV, `strict: false`.** The schemas use
  `format: password` / `format: uri`, which stock AJV does not know;
  official's `@rjsf/validator-ajv8` tolerates them, and so does the
  product's validator (`new Ajv({allErrors: true, strict: false})`).
  `validateOwnerConfigMaps` is ported verbatim (ownerConfig
  `database` / `databaseSchema` / `table` map rows with a name but
  an empty owner are errors; `newKey*` rows are skipped because
  `formatAdditionalProperties` drops them on submit).
  `cleanWorkFlowData` and `formatAdditionalProperties` are ported
  verbatim from `IngestionWorkflowUtils.ts` and
  `JSONSchemaFormUtils.ts`.
- **Field rendering follows the official uiSchema.** The form renders
  the schema's properties in `ui:order` order — filter-pattern
  fields first, then the rest; `type` is hidden (the config type is
  computed by `sourceConfigTypeForPipeline`, P-08(a));
  `incremental` and `enableAutoPartitionDetection` are hidden unless
  the service connection reports the corresponding support flag;
  `defaultManifest` renders as a JSON textarea (official's
  `manifestJson` widget); `format: password` renders a password
  input. Filter-pattern objects render as includes + excludes text
  inputs (P-08(b)): one pattern per line or comma-separated, the
  product's existing `splitCsv` convention. String arrays render as
  textareas, enum arrays as multi-selects, arrays of objects as
  add/remove rows, `additionalProperties` maps as key-value rows,
  `oneOf`/`anyOf` as a branch selector plus the branch's fields.
- **Prefill widens to the schema's filter-pattern fields (P-08(c)
  completed).** `getDefaultFilterPropertyValues` now takes the
  resolved schema: on create it keeps the service connection.config
  keys that are filter-pattern fields of the schema (port of
  `IngestionConfigUtils.getDefaultFilterPropertyFieldsFromSchema` +
  `getFilteredSchema(..., false)`); on edit it returns the saved
  `sourceConfig.config` filtered to the schema's filter-pattern
  fields. The form itself seeds from the whole saved config on edit
  (every schema key reads back), so excludes and all other schema
  fields round-trip.
- **`buildSourceConfig` is rebuilt on the schema form.**
  `buildSourceConfig({pipelineType, serviceKind, sourceConfigData,
  existingConfig})` returns `{config: {type,
  ...cleanWorkFlowData(formatAdditionalProperties(sourceConfigData))}}`.
  The form data overlays the saved config on edit, so keys the schema
  does not model survive (the P-07 guarantee); on create the base is
  `{}`. The hand-written per-kind branches and `formHintsFromSourceConfig`
  are deleted. `PipelineFormValues` drops the seven hand-written
  filter fields and gains `sourceConfigData`.
- **`ServiceFilterFields` stays for the service wizard.**
  `AddServiceView` still renders the hand-written filter step: that
  step writes filter *defaults* into the service connection, not a
  pipeline `sourceConfig`, and official's Add Service step 3 renders
  the same per-kind filter fields. Only the two pipeline forms switch
  to the schema-driven form.

## Consequences

- Creating or editing a pipeline now offers every schema field for
  its `(pipelineType, serviceCategory)` — including excludes inputs
  on every filter pattern, profiler metrics/sampling/threads/timeout,
  dbt config sources, lineage/usage options, and the dashboard /
  messaging / storage / mlmodel / api / search / drive fields that
  were entirely absent.
- Saving an untouched edit now writes the schema defaults into the
  config (official RJSF behaviour): the edit PATCH gains `add` ops
  for defaulted keys missing from the saved config. The edit test is
  retargeted to assert exactly those ops.
- The UI bundle gains `ajv` and 19 lazily-loaded JSON schemas; no
  schema JSON is in the initial bundle.
- Live verification still owed: a profiler create with metrics +
  sampling actually persists and runs; a dbt create with a cloud
  config source deploys; excludes actually exclude at run time
  (P-11's regex engine); an edit of a pipeline whose saved config
  carries an unknown key keeps that key.
