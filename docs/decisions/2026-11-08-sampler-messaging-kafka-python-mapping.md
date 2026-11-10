# Sampler live read maps official confluent semantics onto kafka-python

- **Status:** Accepted
- **Revisions:** v1 2026-11-08 (initial)
- **Deciders:** H track 1 implementer (Wave 2 milestone, ruling REVIEW-W2-H-TRACKS §2-① condition 6)
- **Guard:** `tests/test_sampler_messaging.py` live poll-loop tests (`test_live_sampler_collects_up_to_limit`, `test_live_sampler_warns_when_underfilled`, `test_live_sampler_skips_undecodable_message_and_continues`, `test_live_sampler_poll_error_does_not_interrupt_run`, `test_live_sampler_timeout_returns_partial`) + consumer-config tests
- **Related:** REVIEW-W2-H-TRACKS.md condition 6; RULING-data-execution.md H-Q-1.2; `docs/decisions/2026-11-08-sampler-messaging-double-gate-fail-closed.md`

## Context

The official sampler reads live messages with confluent-kafka
(`common_broker_source.py:285+` `yield_topic_sample_data`,
`sampler/messaging/kafka/sampler.py:45` `KafkaSampler`). The product uses
kafka-python (pyproject extra `kafka = ["kafka-python>=2.0,<3"]`) and must
not change libraries (condition 6). The two clients differ in shape:
confluent `poll()` returns one message per call; kafka-python
`poll(timeout_ms, max_records)` returns a dict of topic-partition → record
lists. The mapping below is the product's faithful equivalent.

## Decision

- **Budget:** 10 polls / 10s total deadline / at most 10 messages per topic.
  Official polls 10 times and returns one message per poll, so 10 polls =
  10 messages; the product keeps the same budget and stops at the limit.
- **Seek-to-recent-50 on assignment** via a `ConsumerRebalanceListener`
  (official `on_partitions_assignment_to_consumer` seeks each partition to
  latest−50, floored at the beginning offset). The listener is built lazily
  inside the adapter so importing the module never requires kafka-python.
- **Group id** `smartmetadata-sampler-<sha256(service_name)[:16]>`.
  Official groups per entity FQN; the product consumer is shared per run
  and seeks on every assignment, so offsets never carry across topics and a
  per-service group is the honest equivalent.
- **`api_version=(2, 0, 0)` pinned** so consumer construction performs no
  network I/O (kafka-python otherwise probes the broker for its version at
  construction and raises `NoBrokersAvailable` with no broker).
- **Decode is the official strict branch:** strip Confluent framing (drop
  the first 5 bytes iff length ≥ 5 and byte 0 is 0 — magic 0 + 4-byte schema
  id), then strict UTF-8 decode. A binary payload that cannot decode is
  **skipped with a warning, never stored as mojibake** (official
  `decode_message` comment: "a binary payload we cannot type … must be
  skipped by the caller, not stored as mojibake"). Empty values are skipped
  the same way (official `KafkaSampler._fetch_messages` `if value:`).
- **Per-message failure never interrupts the run:** a decode failure warns
  and continues; a poll error warns and continues; a `None` poll ends the
  loop; an underfilled result warns `collected N of M messages`.
- **`consumerConfig` is NOT merged** into the kafka-python consumer: its
  dotted confluent keys have no faithful kafka-python mapping.
- **`consumerConfigSSL` is NOT wired:** the spec carries certificate
  material (`caCertificate`/`sslCertificate`/`sslKey`), not file paths,
  while the official sampler reads attribute names
  (`caLocation`/`certificateLocation`/`keyLocation`) that do not exist in
  the spec — the official's own consumer-SSL branch is effectively dead, so
  there is no faithful mapping to copy. SSL-configured brokers needing
  client certificates fail to connect; the failure warns per topic and the
  run continues. Recorded as residual R-W2H-1.

## Consequences

- `sample()` returns `list[str]` always: injectable sampler rows are
  JSON-serialized (`json.dumps(sort_keys=True, ensure_ascii=False,
  default=str)`); live rows are decoded strings. The only consumer is
  `TopicRecord.sample_data → TopicSampleData.messages` (strings); dict rows
  would be a latent schema violation at the sink.
- Avro/Protobuf binary topics yield no samples (no Avro library in the
  product) — warning per message, run continues. Recorded as residual
  R-W2H-2.
- Revisit if the product ever adopts confluent-kafka: the budget, seek,
  and decode rules above are the contract to re-verify against.
