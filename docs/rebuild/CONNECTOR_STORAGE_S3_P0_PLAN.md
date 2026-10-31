# Storage S3 P0 connector — S3 only

**Status:** Locked by Bernie 2026-11-01 t225u continue + fusion/Notion Storage P0 (t222u-type P0)
**Target:** BehaviorMatched (unit) for official Apache OpenMetadata capability surfaces
**OSS (locked from `ingestion/setup.py` plugins — no invent):**
- **S3 plugin:** `{*COMMONS["storage-archive"]}` = pandas, pyarrow, rarfile, py7zr, brotli
- **boto3:** base OM dependency (`boto3>=1.43.101,<2`) — product lands under optional extra `s3` with boto3 + storage-archive
- No collate-data-diff. No invent packages. Not GCS. Not S3 Datalake database connector.

## Scope

| Official tile | SM `source.type` | `serviceType` | Notes |
| --- | --- | --- | --- |
| S3 | `s3` | `S3` | Connection requires `awsConfig` (awsRegion required in schema); optional bucketNames, consoleEndpointURL, containerFilterPattern, supportsMetadataExtraction, supportsProfiler |

Not in scope this PR: GCS/ADLS/CustomStorage; S3 Datalake; inventing lineage/usage/DataDiff (official `service_spec` is Metadata + Sampler + Connection only).

## Capability chain (1:1 with OM `storage/s3/service_spec`)

| Surface | Official | SM landing |
| --- | --- | --- |
| Connection + Test | S3Connection | boto3 client via awsConfig; `test_connection` lists buckets (or filtered names) |
| Metadata | S3Source | storageService → containers (buckets + nested prefixes); parent-before-child |
| Sampler | S3Sampler | injectable sampler returns object-key sample rows; unit Sequence* BehaviorMatched |
| Lineage | **absent** | no invent |
| Usage | **absent** | no invent |
| DataDiff | **absent** | no invent |
| UI Add Service | OM fields | S3 tile + awsConfig/bucketNames/consoleEndpointURL + i18n |

## Design (clean-room, Dashboard/Kafka Sequence* pattern)

1. Injectable `StorageCatalogReader` + `SequenceStorageCatalogReader` for unit BehaviorMatched.
2. Live `S3BotoCatalogReader` with injectable boto3 client factory (no CCL copy).
3. Injectable `StorageObjectSampler` + `SequenceStorageObjectSampler`; live `S3BotoObjectSampler`.
4. New record kinds: `storageService` → `container` (topology ranks 0/1); nested containers emit parents first; REST `/v1/services/storageServices`, `/v1/containers` (+ bulk + deleteStale).
5. Secrets (`awsSecretAccessKey`, `awsSessionToken`) omitted from catalog connection payload by default.
6. Java/spec already enumerate S3 — no schema invent; UI curated list opts S3 in.

## Honest Partial

- Live IntegrationVerified against real AWS/MinIO deferred (unit uses Sequence* + fake boto client).
- Global `storageMetadataConfigSource` oneOf / defaultManifest / deep archive schema inference deferred — P0 lands buckets/prefixes + optional fileFormats/numberOfObjects/size on ContainerRecord; sampler returns object key samples.
- Profiler **job execution** remains Partial (product `jobs.py` residual); sampler registration matches service_spec.

## Self-review (COMMENT — not APPROVE)

**Landing quality**
- Surfaces match OM BaseSpec (metadata+sampler+connection); connection fields 1:1 `s3Connection.json`.
- UI tile + forms use official fields only.
- Unit BehaviorMatched: `test_s3.py` + UI connections/cliWorkflow/sourceConfig; registry loads `s3`.

**Design approach**
- Clean-room Sequence* pattern; live Cursor* deferred (honest Partial).
- OSS locked from setup.py.

**Honest Partial**
- Live IntegrationVerified deferred.
- Manifest/deep archive inference deferred.
