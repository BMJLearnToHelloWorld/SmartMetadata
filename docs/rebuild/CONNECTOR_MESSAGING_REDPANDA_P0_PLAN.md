# Messaging Redpanda P0 connector — Redpanda only

**Status:** Locked by Bernie 2026-11-01 t225u continue + fusion Messaging Redpanda P0
**Target:** BehaviorMatched (unit) for official Apache OpenMetadata capability surfaces
**OSS (locked from `ingestion/setup.py` plugins — no invent):**
- **Redpanda plugin:** `{*COMMONS["kafka"]}` — same kafka-python family as Kafka connector
- Product lands optional extra `redpanda` = same pins as `kafka` (`kafka-python>=2.0,<3`)
- No collate packages. No invent lineage/usage/DataDiff beyond official service_spec.

## Scope

| Official tile | SM `source.type` | `serviceType` | Notes |
| --- | --- | --- | --- |
| Redpanda | `redpanda` | `Redpanda` | Connection requires `bootstrapServers`; optional schemaRegistryURL, SASL/security, topicFilterPattern, supportsMetadataExtraction, supportsProfiler |

Not in scope this PR: other messaging tiles (Kinesis/NATS/PubSub); inventing lineage/usage/DataDiff (official `service_spec` is Metadata + Sampler + Connection only).

## Capability chain (1:1 with OM `messaging/redpanda/service_spec`)

| Surface | Official | SM landing |
| --- | --- | --- |
| Connection + Test | RedpandaConnection | bootstrapServers (+ optional REST proxy / kafka-python admin); `test_connection` via topic list or admin |
| Metadata | RedpandaSource | messagingService → topic; reuse existing TopicRecord topology |
| Sampler | RedpandaSampler | injectable Sequence* sample messages; unit BehaviorMatched |
| Lineage | **absent** | no invent |
| Usage | **absent** | no invent |
| DataDiff | **absent** | no invent |
| UI Add Service | OM fields | Redpanda tile + bootstrapServers/schemaRegistryURL (+ securityProtocol) + i18n |

## Design (clean-room; reuse Kafka Sequence* / TopicReader)

1. Reuse `TopicRow` / `TopicReader` / `SequenceTopicReader` / `ConfluentHttpTopicReader` / `KafkaAdminTopicReader` from `connectors.kafka` (Kafka-protocol compatible; same COMMONS kafka extras).
2. New `RedpandaSource` `@register_source("redpanda")` emits `MessagingServiceRecord(service_type="Redpanda")` + `TopicRecord`.
3. Injectable `TopicMessageSampler` + `SequenceTopicMessageSampler`; `RedpandaSampler.sample(topic=...)` for unit BehaviorMatched.
4. Topology/STAGE_ORDER already has messagingService/topic from Kafka — no invent ranks; apache-positive-regression unchanged.
5. Secrets (`saslPassword`, `basicAuthUserInfo`) omitted from catalog connection payload by default.
6. Java/spec already enumerate Redpanda — no schema invent; UI curated messaging list opts Redpanda in.

## Honest Partial

- Live IntegrationVerified against real Redpanda/Kafka cluster deferred (unit uses Sequence* + httpx MockTransport).
- Live kafka-python consumer message sampling deferred — sampler registration matches service_spec; Sequence* BehaviorMatched.
- Profiler **job execution** remains Partial (product `jobs.py` residual).

## Self-review (COMMENT — not APPROVE)

**Landing quality**
- Surfaces match OM BaseSpec (metadata+sampler+connection); connection fields 1:1 `redpandaConnection.json`.
- UI tile + forms use official fields only.
- Unit BehaviorMatched: `test_redpanda.py` + UI connections/cliWorkflow; registry loads `redpanda`.

**Design approach**
- Clean-room Sequence* pattern; reuse Kafka readers (protocol-compatible); live Cursor* deferred (honest Partial).
- OSS locked from setup.py COMMONS kafka.

**Honest Partial**
- Live IntegrationVerified deferred.
- Live consumer sampling deferred.
