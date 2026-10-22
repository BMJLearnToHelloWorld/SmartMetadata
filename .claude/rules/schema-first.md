---
description: Schema-first — edit JSON Schemas, regenerate Java, never hand-edit generated output
paths: "openmetadata-spec/src/main/resources/json/schema/**"
---

# Schema-first: edit schemas, never generated output

JSON Schemas in `openmetadata-spec/` are the source of truth. Compliant reference:
`openmetadata-spec/src/main/resources/json/schema/entity/data/table.json`.

- **Edit the schema, then regenerate Java. Never hand-edit generated POJOs.**
- **Java POJOs** → `openmetadata-spec/target/generated-sources/jsonschema2pojo/**`
  (build-time; never committed). `mvn -pl openmetadata-spec,openmetadata-service -am test-compile`
- Official CCL Pydantic (`ingestion/src/metadata/generated`) and React
  TypeScript (`openmetadata-ui/.../generated`) trees were **purged**.
  Product ingest/UI do not consume those generated clients.
- Schema conventions: `$id` matches the file path; `title` is camelCase of the
  filename; `javaType` follows `org.openmetadata.schema.{category}.{ClassName}`;
  use `$ref`; `additionalProperties: false` on connection schemas.
