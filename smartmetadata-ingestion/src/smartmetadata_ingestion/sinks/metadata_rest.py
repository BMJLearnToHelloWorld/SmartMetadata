# Copyright 2026 SmartMetadata authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

from __future__ import annotations

import logging
import traceback
from collections import OrderedDict
from dataclasses import dataclass, field
from typing import Any, Protocol

from smartmetadata_ingestion.client.rest import RestClient
from smartmetadata_ingestion.config import WorkflowConfig
from smartmetadata_ingestion.errors import RestError, WorkflowError
from smartmetadata_ingestion.topology import SeenSet
from smartmetadata_ingestion.records import (
    ChartRecord,
    DashboardRecord,
    DashboardServiceRecord,
    StorageServiceRecord,
    ContainerRecord,
    PipelineServiceRecord,
    PipelineRecord,
    DatabaseRecord,
    DatabaseServiceRecord,
    LifeCycleRecord,
    LineageRecord,
    EntityRef,
    MessagingServiceRecord,
    SchemaRecord,
    ColumnRecord,
    StoredProcedureRecord,
    TableConstraintRecord,
    TablePartitionRecord,
    TableRecord,
    TagLabelRecord,
    TopicRecord,
    UsageRecord,
    QueryRecord,
    ProfileRecord,
    TestCaseResultRecord,
    ClassificationRecord,
    TagRecord,
    AppRecord,
    WorkflowRecord,
)

logger = logging.getLogger(__name__)

# Log lines stay bounded: bulk responses can carry whole entities, and a
# fail-closed error embeds the response repr.
_LOG_TEXT_LIMIT = 500


def _truncate_text(text: str, limit: int = _LOG_TEXT_LIMIT) -> str:
    return text if len(text) <= limit else text[:limit] + "…"


# Owner names resolve to EntityReference ids once per run; the cache is
# bounded so a run with many distinct owners cannot grow it without limit.
_OWNER_CACHE_MAX = 512


class OwnerResolver:
    """Resolve ownerConfig owner names to EntityReference dicts.

    The create-request schema requires ``id`` on every EntityReference,
    so a bare name is never sent: each name is looked up as a user,
    then as a team, and a name matching neither fails the run loudly
    instead of landing an unresolvable owner.
    """

    def __init__(self, client: Any) -> None:
        self._client = client
        self._cache: OrderedDict[str, dict[str, Any]] = OrderedDict()

    def resolve(self, names: list[str]) -> list[dict[str, Any]]:
        refs: list[dict[str, Any]] = []
        for name in names:
            ref = self._cache.get(name)
            if ref is None:
                ref = self._lookup(name)
                self._cache[name] = ref
                while len(self._cache) > _OWNER_CACHE_MAX:
                    self._cache.popitem(last=False)
            refs.append(ref)
        return refs

    def _lookup(self, name: str) -> dict[str, Any]:
        get_user = getattr(self._client, "get_user_by_name", None)
        get_team = getattr(self._client, "get_team_by_name", None)
        if not callable(get_user) or not callable(get_team):
            raise WorkflowError(
                f"cannot resolve owner {name!r}: the catalog client "
                "has no user/team lookup"
            )
        for getter, entity_type in ((get_user, "user"), (get_team, "team")):
            try:
                entity = getter(name)
            except RestError as exc:
                if exc.status_code == 404:
                    continue
                raise
            entity_id = entity.get("id") if isinstance(entity, dict) else None
            if not entity_id:
                raise WorkflowError(
                    f"owner lookup for {name!r} returned no id"
                )
            return {
                "id": entity_id,
                "type": entity_type,
                "name": entity.get("name") or name,
                "fullyQualifiedName": entity.get("fullyQualifiedName") or name,
            }
        raise WorkflowError(
            f"owner {name!r} matches no user or team in the catalog"
        )


class PipelineResolver:
    """Resolve pipeline FQNs to EntityReference dicts carrying the server id.

    Pin's EntityReference schema requires ``["id", "type"]``, and pin's
    pipeline sources resolve the pipeline with ``get_by_name`` before
    building the lineage edge (Airflow ``metadata.py:890-899``,
    Dagster ``metadata.py:269-272``, Airbyte ``metadata.py:469`` @
    ``a3012259ca``). A bare-FQN reference is rejected by the server with
    400, so the sink resolves here — the one place with a client — before
    writing the edge. A pipeline the catalog does not know fails the run
    loudly, like an unresolvable owner above, instead of sending a
    payload the server is guaranteed to reject.
    """

    def __init__(self, client: Any) -> None:
        self._client = client
        self._cache: OrderedDict[str, dict[str, Any]] = OrderedDict()

    def resolve(self, fqn: str) -> dict[str, Any]:
        ref = self._cache.get(fqn)
        if ref is None:
            ref = self._lookup(fqn)
            self._cache[fqn] = ref
            while len(self._cache) > _OWNER_CACHE_MAX:
                self._cache.popitem(last=False)
        return ref

    def _lookup(self, fqn: str) -> dict[str, Any]:
        get_pipeline = getattr(self._client, "get_pipeline_by_name", None)
        if not callable(get_pipeline):
            raise WorkflowError(
                f"cannot resolve pipeline {fqn!r}: the catalog client "
                "has no pipeline lookup"
            )
        try:
            entity = get_pipeline(fqn)
        except RestError as exc:
            if exc.status_code == 404:
                raise WorkflowError(
                    f"pipeline {fqn!r} matches no pipeline in the catalog; "
                    "a pipeline-attributed lineage edge needs a resolvable pipeline"
                ) from exc
            raise
        entity_id = entity.get("id") if isinstance(entity, dict) else None
        if not entity_id:
            raise WorkflowError(
                f"pipeline lookup for {fqn!r} returned no id"
            )
        return {
            "id": entity_id,
            "type": "pipeline",
            "name": entity.get("name") or fqn.rsplit(".", 1)[-1],
            "fullyQualifiedName": entity.get("fullyQualifiedName") or fqn,
        }


def _resolve_lineage_pipeline(
    record: LineageRecord, resolver: PipelineResolver
) -> LineageRecord:
    """LineageRecord whose pipeline ref carries the server id.

    A ref that already carries an id, and an edge with no pipeline, are
    returned unchanged; only a bare-FQN ref is resolved, so a seed that
    already carries ids never pays a lookup.
    """
    pipeline = record.pipeline
    if pipeline is None or pipeline.id:
        return record
    fqn = pipeline.fully_qualified_name
    if not fqn:
        raise WorkflowError(
            f"lineage edge {record.from_entity.fqn}->{record.to_entity.fqn} "
            "names a pipeline with neither id nor fullyQualifiedName; "
            "the server requires an id on the pipeline reference"
        )
    ref = resolver.resolve(fqn)
    return record.model_copy(
        update={
            "pipeline": EntityRef(
                type=ref.get("type") or pipeline.type,
                fully_qualified_name=ref.get("fullyQualifiedName") or fqn,
                id=ref.get("id"),
                name=ref.get("name") or pipeline.name,
            )
        }
    )


def _payload_label(kind: str, payload: dict[str, Any]) -> str:
    """The record label a bulk payload stands for (``kind:fqn``).

    Bulk payloads carry the bare name plus the parent FQN, which is
    exactly how the record's own ``label()`` reads.
    """
    parent = (
        payload.get("databaseSchema")
        or payload.get("database")
        or payload.get("service")
        or payload.get("fullyQualifiedName")
        or ""
    )
    name = payload.get("name") or ""
    fqn = f"{parent}.{name}" if parent and name else (name or kind)
    return f"{kind}:{fqn}"


@dataclass
class FlushFailure:
    """One record whose flush did not persist it."""

    kind: str
    payload: dict[str, Any]
    error: str
    stack_trace: str | None = None
    label: str = ""

    def __post_init__(self) -> None:
        if not self.label:
            self.label = _payload_label(self.kind, self.payload)


@dataclass
class FlushResult:
    """The outcome of one or more flushes, drained by the caller.

    ``succeeded`` counts truly-flushed records per kind (official
    ``_flush_buffer``: only ``result.successRequest`` counts);
    ``failed`` carries one entry per record that did not persist, so the
    caller can record each as its own failure instead of one batch error.
    """

    succeeded: dict[str, int] = field(default_factory=dict)
    failed: list[FlushFailure] = field(default_factory=list)

    def __bool__(self) -> bool:
        return bool(self.succeeded or self.failed)


class Sink(Protocol):
    def write(self, record: WorkflowRecord) -> Any: ...

    def flush(self) -> Any: ...


def _owners_for(
    resolver: OwnerResolver, record: TableRecord | StoredProcedureRecord
) -> list[dict[str, Any]]:
    """Resolved owner references for a record, or [] when it names none."""
    if not record.owner_names:
        return []
    return resolver.resolve(list(record.owner_names))


class MetadataRestSink:
    def __init__(
        self,
        client: RestClient,
        *,
        owner_resolver: OwnerResolver | None = None,
        pipeline_resolver: PipelineResolver | None = None,
    ):
        self._client = client
        self._owner_resolver = owner_resolver or OwnerResolver(client)
        self._pipeline_resolver = pipeline_resolver or PipelineResolver(client)
        self.written: list[str] = []
        # Query-link dedupe for QueryRecord writes: one usage/users/
        # usedBy PUT per (query, table) per run. Bounded — when full
        # it clears and re-PUTs (idempotent), rather than growing
        # with the query-log size.
        self._query_links: set[tuple[str, str]] = set()

    def write(self, record: WorkflowRecord) -> Any:
        if isinstance(record, DatabaseServiceRecord):
            result = self._client.upsert_database_service(_service_payload(record))
        elif isinstance(record, MessagingServiceRecord):
            result = self._client.upsert_messaging_service(_messaging_service_payload(record))
        elif isinstance(record, DashboardServiceRecord):
            result = self._client.upsert_dashboard_service(_dashboard_service_payload(record))
        elif isinstance(record, StorageServiceRecord):
            result = self._client.upsert_storage_service(_storage_service_payload(record))
        elif isinstance(record, PipelineServiceRecord):
            result = self._client.upsert_pipeline_service(_pipeline_service_payload(record))
        elif isinstance(record, DatabaseRecord):
            result = self._client.upsert_database(_database_payload(record))
        elif isinstance(record, SchemaRecord):
            result = self._client.upsert_schema(_schema_payload(record))
        elif isinstance(record, TableRecord):
            result = self._client.upsert_table(
                _table_payload(record, owners=_owners_for(self._owner_resolver, record))
            )
        elif isinstance(record, StoredProcedureRecord):
            result = self._client.upsert_stored_procedure(
                _stored_procedure_payload(
                    record, owners=_owners_for(self._owner_resolver, record)
                )
            )
        elif isinstance(record, TopicRecord):
            result = self._client.upsert_topic(_topic_payload(record))
            _write_topic_sample_data(self._client, record, result)
        elif isinstance(record, ChartRecord):
            result = self._client.upsert_chart(_chart_payload(record))
        elif isinstance(record, DashboardRecord):
            result = self._client.upsert_dashboard(_dashboard_payload(record))
        elif isinstance(record, ContainerRecord):
            result = self._client.upsert_container(_container_payload(record))
        elif isinstance(record, PipelineRecord):
            result = self._client.upsert_pipeline(_pipeline_payload(record))
        elif isinstance(record, LineageRecord):
            result = self._client.put_lineage(
                record.from_entity.type,
                record.from_entity.fqn,
                record.to_entity.type,
                record.to_entity.fqn,
                _lineage_details(
                    _resolve_lineage_pipeline(record, self._pipeline_resolver)
                ),
            )
        elif isinstance(record, UsageRecord):
            result = self._client.put_usage_by_name(
                record.entity_type,
                record.fqn,
                date=record.date,
                count=record.count,
            )
        elif isinstance(record, QueryRecord):
            result = _write_query(self._client, record, self._query_links)
        elif isinstance(record, ProfileRecord):
            result = _write_profile(self._client, record)
        elif isinstance(record, TestCaseResultRecord):
            result = self._client.post_test_case_result(
                record.test_case_fqn,
                _test_case_result_payload(record),
            )
        elif isinstance(record, ClassificationRecord):
            result = self._client.upsert_classification(
                _classification_payload(record)
            )
        elif isinstance(record, TagRecord):
            result = self._client.upsert_tag(_tag_payload(record))
        elif isinstance(record, AppRecord):
            result = self._client.upsert_app(_app_payload(record))
        else:
            raise WorkflowError(f"sink cannot write {type(record).__name__}")
        self.written.append(record.label())
        return result

    def flush(self) -> None:
        return None


def build_sink(config: WorkflowConfig, client: RestClient, sink: Sink | None = None) -> Sink:
    if sink is not None:
        return sink
    if config.sink.type != "metadata-rest":
        raise WorkflowError(f"unsupported sink type {config.sink.type}")
    if config.sink.use_bulk:
        return BulkMetadataRestSink(
            client,
            batch_size=config.sink.bulk_batch_size,
            override_metadata=config.source.override_metadata,
        )
    return MetadataRestSink(client)


class BulkMetadataRestSink:
    """Buffer create/update payloads and flush via Apache /bulk endpoints.

    Records share ONE buffer in arrival order. When the buffer reaches
    ``batch_size`` (or at close / before a non-buffered write) it flushes:
    the buffer is grouped by kind, groups go out in hierarchy-depth order
    with arrival order kept inside each group, and one bulk call is made
    per group. A group whose bulk call or response recording raises
    records that group's payloads as failed; the remaining groups still
    run — a flush never raises.

    A buffered record is NOT yet persisted when ``write()`` returns:
    flush outcomes accumulate in :attr:`_flush_result` and the caller
    drains them with :meth:`take_flush_result` (after each write, and
    from :meth:`flush` at close). Only records a flush reports in
    ``successRequest`` count as succeeded; each failed payload becomes
    one :class:`FlushFailure` (official ``_flush_buffer``).
    """

    # Hierarchy depth per buffered kind, derived from the pin topology
    # trees (behavior spec only): depth = tree layer x 100 + stage index
    # within the node, the minimum across topologies. Topic sits at layer
    # 1 stage 0 (100); database, chart, container and pipeline at layer 1
    # stage 1 (101); dashboard at layer 1 stage 3 (103); schema at layer 2
    # stage 1 (201); storedProcedure at layer 3 stage 0 (300) — ahead of
    # table at layer 3 stage 1 (301). Groups sort by depth with a stable
    # sort, so kinds sharing a depth keep first-arrival order, as in the
    # pin's grouping sort.
    _KIND_DEPTH: dict[str, int] = {
        "topic": 100,
        "database": 101,
        "chart": 101,
        "container": 101,
        "pipeline": 101,
        "dashboard": 103,
        "schema": 201,
        "storedProcedure": 300,
        "table": 301,
    }

    # Bulk endpoint per buffered kind, on the catalog client.
    _BULK_METHODS: dict[str, str] = {
        "database": "bulk_upsert_databases",
        "schema": "bulk_upsert_schemas",
        "table": "bulk_upsert_tables",
        "storedProcedure": "bulk_upsert_stored_procedures",
        "topic": "bulk_upsert_topics",
        "chart": "bulk_upsert_charts",
        "dashboard": "bulk_upsert_dashboards",
        "container": "bulk_upsert_containers",
        "pipeline": "bulk_upsert_pipelines",
    }

    def __init__(
        self,
        client: RestClient,
        *,
        batch_size: int = 100,
        override_metadata: bool = False,
        owner_resolver: OwnerResolver | None = None,
        pipeline_resolver: PipelineResolver | None = None,
    ) -> None:
        self._owner_resolver = owner_resolver or OwnerResolver(client)
        self._pipeline_resolver = pipeline_resolver or PipelineResolver(client)
        self._inner = MetadataRestSink(
            client,
            owner_resolver=self._owner_resolver,
            pipeline_resolver=self._pipeline_resolver,
        )
        self._client = client
        self._batch_size = batch_size
        # The bulk overrideMetadata query param: the server reads it from
        # the bulk URI to allow overwriting user-curated fields. The
        # single-write path has no server support for it.
        self._override_metadata = override_metadata
        self.written: list[str] = self._inner.written
        self.seen = SeenSet()
        self._flush_result = FlushResult()
        # One shared buffer: (kind, payload) pairs in arrival order.
        self._buffer: list[tuple[str, dict]] = []

    def buffers(self, record: WorkflowRecord) -> bool:
        """Whether ``write()`` only buffers this record (not yet persisted).

        Mirrors ``write()`` exactly: the nine buffered kinds, with a
        sampled topic taking the immediate path (its sample PUT needs the
        topic id from the single-write upsert).
        """
        if isinstance(record, TopicRecord):
            return not (record.sample_data and record.sample_data.messages)
        return isinstance(
            record,
            (
                DatabaseRecord,
                SchemaRecord,
                TableRecord,
                StoredProcedureRecord,
                ChartRecord,
                DashboardRecord,
                ContainerRecord,
                PipelineRecord,
            ),
        )

    def take_flush_result(self) -> FlushResult | None:
        """Return and clear the accumulated flush outcomes, if any."""
        if not self._flush_result:
            return None
        result, self._flush_result = self._flush_result, FlushResult()
        return result

    def write(self, record: WorkflowRecord) -> Any:
        self.seen.add(record)
        if isinstance(record, DatabaseRecord):
            self._buffer.append(("database", _database_payload(record)))
            self.written.append(record.label())
            return self._flush_if_full()
        if isinstance(record, SchemaRecord):
            self._buffer.append(("schema", _schema_payload(record)))
            self.written.append(record.label())
            return self._flush_if_full()
        if isinstance(record, TableRecord):
            self._buffer.append(
                (
                    "table",
                    _table_payload(record, owners=_owners_for(self._owner_resolver, record)),
                )
            )
            self.written.append(record.label())
            return self._flush_if_full()
        if isinstance(record, StoredProcedureRecord):
            self._buffer.append(
                (
                    "storedProcedure",
                    _stored_procedure_payload(
                        record, owners=_owners_for(self._owner_resolver, record)
                    ),
                )
            )
            self.written.append(record.label())
            return self._flush_if_full()
        if isinstance(record, TopicRecord):
            if record.sample_data and record.sample_data.messages:
                # The sample PUT needs the topic id from the upsert
                # response, which the bulk path does not return per topic:
                # flush, then single-write (upsert + sample PUT).
                self._flush_all()
                return self._inner.write(record)
            self._buffer.append(("topic", _topic_payload(record)))
            self.written.append(record.label())
            return self._flush_if_full()
        if isinstance(record, ChartRecord):
            self._buffer.append(("chart", _chart_payload(record)))
            self.written.append(record.label())
            return self._flush_if_full()
        if isinstance(record, DashboardRecord):
            self._buffer.append(("dashboard", _dashboard_payload(record)))
            self.written.append(record.label())
            return self._flush_if_full()
        if isinstance(record, ContainerRecord):
            self._buffer.append(("container", _container_payload(record)))
            self.written.append(record.label())
            return self._flush_if_full()
        if isinstance(record, PipelineRecord):
            self._buffer.append(("pipeline", _pipeline_payload(record)))
            self.written.append(record.label())
            return self._flush_if_full()
        # Flush buffered parents before services/lineage so wire order stays parent-first.
        self._flush_all()
        return self._inner.write(record)

    def flush(self) -> FlushResult | None:
        """Flush every buffer and return the drained outcome, if any."""
        self._flush_all()
        return self.take_flush_result()

    def _flush_if_full(self) -> None:
        if len(self._buffer) >= self._batch_size:
            self._flush_all()

    def _flush_all(self) -> None:
        if not self._buffer:
            return None
        buffered, self._buffer = self._buffer, []
        groups: dict[str, list[dict]] = {}
        for kind, payload in buffered:
            groups.setdefault(kind, []).append(payload)
        # Groups go out in hierarchy-depth order; the sort is stable, so
        # kinds sharing a depth keep first-arrival order.
        for kind in sorted(groups, key=lambda name: self._KIND_DEPTH[name]):
            self._flush_group(kind, groups[kind])

    def _flush_group(self, kind: str, payloads: list[dict]) -> None:
        """One bulk call for one kind; any failure is recorded, never raised.

        The call and its response recording share one broad isolation
        boundary: whatever goes wrong, every payload in the group becomes
        one per-record failure and the remaining groups still run.
        """
        try:
            bulk_upsert = getattr(self._client, self._BULK_METHODS[kind])
            result = bulk_upsert(payloads, override_metadata=self._override_metadata)
            self._record_flush_response(kind, payloads, result)
        except Exception as exc:
            # The whole group was refused or unrecordable: every payload
            # in it failed, each as its own failure — not one group error.
            # The refusal itself gets one line naming the group; each
            # payload's failure is logged by _record_flush_failure.
            logger.error(
                "bulk %s flush refused for %d payload(s): %s",
                kind,
                len(payloads),
                exc,
            )
            logger.debug("bulk %s flush refusal traceback: %s", kind, traceback.format_exc())
            for payload in payloads:
                self._record_flush_failure(kind, payload, str(exc), traceback.format_exc())

    def _record_flush_response(self, kind: str, payloads: list[dict], result: Any) -> None:
        """Count a bulk response (BulkOperationResult) per record.

        ``successRequest`` entries are the records that landed;
        ``failedRequest`` entries carry the original ``request`` plus a
        ``message``. A response without either list is a failure for
        every payload: nothing was observably landed, so nothing counts
        as succeeded (fail closed — an unobservable flush must not
        count as a success).
        """
        if isinstance(result, dict) and ("successRequest" in result or "failedRequest" in result):
            succeeded = result.get("successRequest") or []
            failed = result.get("failedRequest") or []
            if succeeded:
                current = self._flush_result.succeeded.get(kind, 0)
                self._flush_result.succeeded[kind] = current + len(succeeded)
            logger.info(
                "bulk %s flush: %d payload(s), %d succeeded, %d failed",
                kind,
                len(payloads),
                len(succeeded),
                len(failed),
            )
            for entry in failed:
                if isinstance(entry, dict):
                    request = entry.get("request")
                    payload = request if isinstance(request, dict) else entry
                    error = entry.get("message") or str(entry)
                else:
                    payload, error = {}, str(entry)
                self._record_flush_failure(kind, payload, error)
            return
        # No result lists at all (e.g. an empty-body 200, which
        # RestClient.request() returns as None): fail closed, one
        # failure per payload and zero succeeded. The response shape is
        # logged once per group — it is the only evidence for whether
        # the server answered at all — and each payload's failure is
        # logged by _record_flush_failure with its label.
        logger.error(
            "bulk %s flush failed closed for %d payload(s): unexpected %s response: %s",
            kind,
            len(payloads),
            type(result).__name__,
            _truncate_text(repr(result)),
        )
        for payload in payloads:
            self._record_flush_failure(kind, payload, f"unexpected bulk response: {result!r}")

    def _record_flush_failure(
        self,
        kind: str,
        payload: dict,
        error: str,
        stack_trace: str | None = None,
    ) -> None:
        failure = FlushFailure(
            kind=kind,
            payload=dict(payload),
            error=error,
            stack_trace=stack_trace,
        )
        self._flush_result.failed.append(failure)
        # Per-step failure logging: every failure the workflow counts
        # gets one log line naming the record and the reason, so a run's
        # "N failed" is auditable from the log alone. ERROR level, so it
        # shows with the default logging setup — the live 87.8% run named
        # no step because failures were only visible in the JSON report.
        logger.error("sink flush failed: %s: %s", failure.label, _truncate_text(failure.error))





def _classification_payload(record: ClassificationRecord) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "name": record.name,
        "description": record.description,
    }
    if record.display_name is not None:
        payload["displayName"] = record.display_name
    if record.provider is not None:
        payload["provider"] = record.provider
    if record.mutually_exclusive is not None:
        payload["mutuallyExclusive"] = record.mutually_exclusive
    return payload


def _tag_payload(record: TagRecord) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "name": record.name,
        "description": record.description,
    }
    if record.classification is not None:
        payload["classification"] = record.classification
    if record.parent is not None:
        payload["parent"] = record.parent
    if record.display_name is not None:
        payload["displayName"] = record.display_name
    if record.provider is not None:
        payload["provider"] = record.provider
    if record.mutually_exclusive is not None:
        payload["mutuallyExclusive"] = record.mutually_exclusive
    return payload


def _app_payload(record: AppRecord) -> dict[str, Any]:
    payload: dict[str, Any] = {"name": record.name}
    if record.display_name is not None:
        payload["displayName"] = record.display_name
    if record.description is not None:
        payload["description"] = record.description
    if record.bot is not None:
        payload["bot"] = record.bot
    if record.app_configuration is not None:
        payload["appConfiguration"] = record.app_configuration
    if record.app_schedule is not None:
        payload["appSchedule"] = record.app_schedule
    if record.supports_interrupt is not None:
        payload["supportsInterrupt"] = record.supports_interrupt
    if record.allow_bot_impersonation is not None:
        payload["allowBotImpersonation"] = record.allow_bot_impersonation
    return payload


def _write_topic_sample_data(
    client: RestClient, record: TopicRecord, upsert_result: Any
) -> None:
    """PUT sampled messages after the topic upsert (official write_topic_sample_data).

    Only when messages is non-empty; a missing topic id (an upsert response
    without one) cannot address the endpoint, so the write is skipped with
    a warning. A failed PUT propagates: the record is counted failed and
    the run continues (the product's equivalent of official's per-record
    StackTraceError) — a failed sample write is never silently dropped.
    ADR:2026-11-08-sampler-messaging-config-surface
    """
    if not record.sample_data or not record.sample_data.messages:
        return None
    topic_id = upsert_result.get("id") if isinstance(upsert_result, dict) else None
    if not topic_id:
        logger.warning(
            "cannot write sample data for topic %s: upsert returned no id",
            record.name,
        )
        return None
    client.ingest_topic_sample_data(
        str(topic_id), {"messages": list(record.sample_data.messages)}
    )


def _write_profile(client: RestClient, record: ProfileRecord) -> Any:
    if record.fqn:
        payload: dict[str, Any] = {
            "entityType": record.entity_type,
        }
        if record.profile_data is not None:
            payload["profileData"] = record.profile_data
        elif record.table_profile is not None:
            payload["profileData"] = record.table_profile
        else:
            raise WorkflowError("profile record requires profileData or tableProfile")
        if record.profile_type:
            payload["profileType"] = record.profile_type
        if record.timestamp is not None:
            payload["timestamp"] = record.timestamp
        result = client.post_entity_profile_by_name(record.entity_type, record.fqn, payload)
        # The fqn path used to post only the table profile and silently drop
        # record.column_profile. Each column profile is its own
        # CreateEntityProfile (profileType "column") on the same table FQN;
        # the server stores it against the column FQN resolved from
        # profileData.name (ADR:2026-11-08-profiler-fqn-path-posts-column-profiles).
        # A failed column post raises like a failed table post: it must
        # surface, never be swallowed.
        for column in record.column_profile:
            column_payload: dict[str, Any] = {
                "entityType": record.entity_type,
                "profileType": "column",
                "profileData": column,
            }
            if record.timestamp is not None:
                column_payload["timestamp"] = record.timestamp
            client.post_entity_profile_by_name(record.entity_type, record.fqn, column_payload)
        # The fqn path also used to drop record.system_profile. Each system
        # profile is its own CreateEntityProfile (profileType "system") on
        # the same table FQN; the server stores it keyed by timestamp +
        # operation inside profileData (ADR:2026-11-08-profiler-fqn-path-posts-column-profiles).
        # A failed system post raises like a failed table post: it must
        # surface, never be swallowed.
        for system in record.system_profile:
            system_payload: dict[str, Any] = {
                "entityType": record.entity_type,
                "profileType": "system",
                "profileData": system,
            }
            if record.timestamp is not None:
                system_payload["timestamp"] = record.timestamp
            client.post_entity_profile_by_name(record.entity_type, record.fqn, system_payload)
        return result
    if record.table_id:
        if record.table_profile is None:
            raise WorkflowError("legacy table profile requires tableProfile + tableId")
        payload = {"tableProfile": record.table_profile}
        if record.column_profile:
            payload["columnProfile"] = list(record.column_profile)
        if record.system_profile:
            payload["systemProfile"] = list(record.system_profile)
        return client.put_table_profile(record.table_id, payload)
    raise WorkflowError("profile record requires fqn or tableId")


def _test_case_result_payload(record: TestCaseResultRecord) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "timestamp": record.timestamp,
        "testCaseStatus": record.test_case_status,
        "testResultValue": list(record.test_result_value),
    }
    if record.result is not None:
        payload["result"] = record.result
    if record.sample_data is not None:
        payload["sampleData"] = record.sample_data
    if record.passed_rows is not None:
        payload["passedRows"] = record.passed_rows
    if record.failed_rows is not None:
        payload["failedRows"] = record.failed_rows
    if record.passed_rows_percentage is not None:
        payload["passedRowsPercentage"] = record.passed_rows_percentage
    if record.failed_rows_percentage is not None:
        payload["failedRowsPercentage"] = record.failed_rows_percentage
    if record.duration is not None:
        payload["duration"] = record.duration
    return payload


# Query-link dedupe cap for QueryRecord writes (see MetadataRestSink).
MAX_QUERY_LINK_DEDUPE = 10000


def _query_payload(record: QueryRecord) -> dict[str, Any]:
    """A ``CreateQueryRequest`` dict. The name is omitted — the server
    derives it as the MD5 of the stored text — and the service is the
    service name, resolved server-side to the service reference."""
    payload: dict[str, Any] = {
        "query": record.query,
        "service": record.service_name,
        "exclude_usage": record.exclude_usage,
        "processedLineage": record.processed_lineage,
    }
    if record.dialect is not None:
        payload["dialect"] = record.dialect
    if record.query_type is not None:
        payload["query_type"] = record.query_type
    if record.duration is not None:
        payload["duration"] = record.duration
    if record.query_date_ms is not None:
        payload["queryDate"] = record.query_date_ms
    if record.triggered_by_fqn is not None:
        payload["triggeredBy"] = {
            "type": "storedProcedure",
            "fullyQualifiedName": record.triggered_by_fqn,
        }
    return payload


def _write_query(
    client: RestClient,
    record: QueryRecord,
    link_dedupe: set[tuple[str, str]],
) -> Any:
    """Upsert the Query entity, then link its tables and user.

    Usage links need table ids, resolved by FQN (a table that cannot
    be resolved drops out of the links with a warning — the query
    itself is still stored). User resolution mirrors the usage stage:
    a catalog user becomes BOTH a ``users`` FQN and a raw ``usedBy``
    name; anything else becomes only a ``usedBy`` name. Link PUTs
    are idempotent, so dedupe is a traffic saving, not a correctness
    requirement."""
    created = client.upsert_query(_query_payload(record))
    query_id = str(created.get("id", ""))
    if not query_id:
        raise WorkflowError("query create response has no id")
    query_key = str(created.get("fullyQualifiedName") or created.get("name") or query_id)
    for table_fqn in record.table_fqns:
        link_key = (query_key, table_fqn)
        if link_key in link_dedupe:
            continue
        link_dedupe.add(link_key)
        if len(link_dedupe) > MAX_QUERY_LINK_DEDUPE:
            link_dedupe.clear()
            link_dedupe.add(link_key)
        try:
            table = client.get_table_by_name(table_fqn)
        except RestError as exc:
            if exc.status_code == 404:
                logger.warning(
                    "skipping query usage link to unresolvable table %s", table_fqn
                )
                continue
            raise
        table_id = str(table.get("id", ""))
        if table_id:
            client.add_query_usage(query_id, [{"id": table_id, "type": "table"}])
    if record.user_name:
        user_key = (query_key, f"user:{record.user_name}")
        if user_key not in link_dedupe:
            link_dedupe.add(user_key)
            try:
                user = client.get_user_by_name(record.user_name)
            except RestError as exc:
                if exc.status_code == 404:
                    client.add_query_used_by(query_id, [record.user_name])
                else:
                    raise
            else:
                user_fqn = user.get("fullyQualifiedName")
                if isinstance(user_fqn, str) and user_fqn:
                    client.add_query_users(query_id, [user_fqn])
                    client.add_query_used_by(query_id, [record.user_name])
                else:
                    client.add_query_used_by(query_id, [record.user_name])
    return created


def _lineage_details(record: LineageRecord) -> dict[str, Any]:
    details: dict[str, Any] = {"source": record.source}
    if record.sql_query:
        details["sqlQuery"] = record.sql_query
    if record.description:
        details["description"] = record.description
    if record.columns_lineage:
        details["columnsLineage"] = [
            {
                "fromColumns": list(col.from_columns),
                "toColumn": col.to_column,
                **({"function": col.function} if col.function else {}),
            }
            for col in record.columns_lineage
        ]
    if record.pipeline is not None:
        ref: dict[str, Any] = {"type": record.pipeline.type}
        if record.pipeline.fully_qualified_name:
            ref["fullyQualifiedName"] = record.pipeline.fully_qualified_name
        if record.pipeline.id:
            ref["id"] = record.pipeline.id
        if record.pipeline.name:
            ref["name"] = record.pipeline.name
        details["pipeline"] = ref
    return details




def _dashboard_service_payload(record: DashboardServiceRecord) -> dict[str, Any]:
    payload: dict[str, Any] = {"name": record.name, "serviceType": record.service_type}
    if record.display_name:
        payload["displayName"] = record.display_name
    if record.description:
        payload["description"] = record.description
    if record.connection:
        payload["connection"] = record.connection
    return payload


def _chart_payload(record: ChartRecord) -> dict[str, Any]:
    payload: dict[str, Any] = {"name": record.name, "service": record.service}
    if record.display_name:
        payload["displayName"] = record.display_name
    if record.description:
        payload["description"] = record.description
    if record.chart_type:
        payload["chartType"] = record.chart_type
    if record.source_url:
        payload["sourceUrl"] = record.source_url
    return payload


def _dashboard_payload(record: DashboardRecord) -> dict[str, Any]:
    payload: dict[str, Any] = {"name": record.name, "service": record.service}
    if record.display_name:
        payload["displayName"] = record.display_name
    if record.description:
        payload["description"] = record.description
    if record.source_url:
        payload["sourceUrl"] = record.source_url
    if record.project:
        payload["project"] = record.project
    if record.charts:
        payload["charts"] = list(record.charts)
    return payload

def _service_payload(record: DatabaseServiceRecord) -> dict[str, Any]:
    payload: dict[str, Any] = {"name": record.name, "serviceType": record.service_type}
    if record.display_name:
        payload["displayName"] = record.display_name
    if record.description:
        payload["description"] = record.description
    if record.connection:
        payload["connection"] = record.connection
    return payload


def _messaging_service_payload(record: MessagingServiceRecord) -> dict[str, Any]:
    payload: dict[str, Any] = {"name": record.name, "serviceType": record.service_type}
    if record.display_name:
        payload["displayName"] = record.display_name
    if record.description:
        payload["description"] = record.description
    if record.connection:
        payload["connection"] = record.connection
    return payload


def _topic_payload(record: TopicRecord) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "name": record.name,
        "service": record.service,
        "partitions": max(int(record.partitions), 1),
    }
    if record.description:
        payload["description"] = record.description
    if record.message_schema:
        payload["messageSchema"] = record.message_schema
    if record.cleanup_policies:
        payload["cleanupPolicies"] = record.cleanup_policies
    if record.replication_factor is not None:
        payload["replicationFactor"] = record.replication_factor
    if record.retention_time is not None:
        payload["retentionTime"] = record.retention_time
    if record.maximum_message_size is not None:
        payload["maximumMessageSize"] = record.maximum_message_size
    if record.topic_config:
        payload["topicConfig"] = record.topic_config
    return payload


def _database_payload(record: DatabaseRecord) -> dict[str, Any]:
    payload: dict[str, Any] = {"name": record.name, "service": record.service}
    if record.description:
        payload["description"] = record.description
    return payload


def _schema_payload(record: SchemaRecord) -> dict[str, Any]:
    payload: dict[str, Any] = {"name": record.name, "database": record.database}
    if record.description:
        payload["description"] = record.description
    return payload


def _tag_label_payload(record: TagLabelRecord) -> dict[str, Any]:
    return {
        "tagFQN": record.tag_fqn,
        "source": record.source,
        "labelType": record.label_type,
        "state": record.state,
    }


def _life_cycle_payload(record: LifeCycleRecord) -> dict[str, Any]:
    payload: dict[str, Any] = {}
    for key, access in (
        ("created", record.created),
        ("updated", record.updated),
        ("accessed", record.accessed),
    ):
        if access is None:
            continue
        detail: dict[str, Any] = {"timestamp": access.timestamp}
        if access.accessed_by_a_process is not None:
            detail["accessedByAProcess"] = access.accessed_by_a_process
        payload[key] = detail
    return payload


def _table_constraint_payload(record: TableConstraintRecord) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "constraintType": record.constraint_type,
        "columns": list(record.columns),
    }
    if record.referred_columns is not None:
        payload["referredColumns"] = list(record.referred_columns)
    if record.relationship_type is not None:
        payload["relationshipType"] = record.relationship_type
    return payload


def _column_payload(column: ColumnRecord) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "name": column.name,
        "dataType": column.data_type,
    }
    if column.data_type_display:
        payload["dataTypeDisplay"] = column.data_type_display
    if column.description:
        payload["description"] = column.description
    if column.ordinal_position is not None:
        payload["ordinalPosition"] = column.ordinal_position
    if column.data_length is not None:
        payload["dataLength"] = column.data_length
    if column.array_data_type:
        payload["arrayDataType"] = column.array_data_type
    if column.children:
        payload["children"] = [_column_payload(child) for child in column.children]
    if column.precision is not None:
        payload["precision"] = column.precision
    if column.scale is not None:
        payload["scale"] = column.scale
    if column.constraint is not None:
        payload["constraint"] = column.constraint
    if column.tags:
        payload["tags"] = [_tag_label_payload(tag) for tag in column.tags]
    return payload


def _table_partition_payload(record: TablePartitionRecord) -> dict[str, Any]:
    columns = []
    for column in record.columns:
        item: dict[str, Any] = {
            "columnName": column.column_name,
            "intervalType": column.interval_type,
        }
        if column.interval is not None:
            item["interval"] = column.interval
        columns.append(item)
    return {"columns": columns}


def _table_payload(
    record: TableRecord, *, owners: list[dict[str, Any]] | None = None
) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "name": record.name,
        "databaseSchema": record.database_schema,
        "tableType": record.table_type,
        "columns": [_column_payload(column) for column in record.columns],
    }
    if record.description:
        payload["description"] = record.description
    if record.table_partition is not None:
        payload["tablePartition"] = _table_partition_payload(record.table_partition)
    if record.tags:
        payload["tags"] = [_tag_label_payload(tag) for tag in record.tags]
    if owners:
        payload["owners"] = list(owners)
    if record.schema_definition is not None:
        payload["schemaDefinition"] = record.schema_definition
    if record.table_constraints:
        payload["tableConstraints"] = [
            _table_constraint_payload(item) for item in record.table_constraints
        ]
    if record.life_cycle is not None:
        payload["lifeCycle"] = _life_cycle_payload(record.life_cycle)
    if record.extension is not None:
        payload["extension"] = dict(record.extension)
    return payload


def _stored_procedure_payload(
    record: StoredProcedureRecord, *, owners: list[dict[str, Any]] | None = None
) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "name": record.name,
        "databaseSchema": record.database_schema,
        "storedProcedureCode": {
            "language": record.language,
            "code": record.code,
        },
        "storedProcedureType": record.stored_procedure_type,
    }
    if record.description:
        payload["description"] = record.description
    if record.tags:
        payload["tags"] = [_tag_label_payload(tag) for tag in record.tags]
    if owners:
        payload["owners"] = list(owners)
    if record.life_cycle is not None:
        payload["lifeCycle"] = _life_cycle_payload(record.life_cycle)
    if record.extension is not None:
        payload["extension"] = dict(record.extension)
    return payload

def _storage_service_payload(record: StorageServiceRecord) -> dict[str, Any]:
    payload: dict[str, Any] = {"name": record.name, "serviceType": record.service_type}
    if record.display_name:
        payload["displayName"] = record.display_name
    if record.description:
        payload["description"] = record.description
    if record.connection:
        payload["connection"] = record.connection
    return payload


def _container_payload(record: ContainerRecord) -> dict[str, Any]:
    payload: dict[str, Any] = {"name": record.name, "service": record.service}
    if record.display_name:
        payload["displayName"] = record.display_name
    if record.description:
        payload["description"] = record.description
    if record.parent_fqn:
        payload["parent"] = record.parent_fqn
    if record.prefix:
        payload["prefix"] = record.prefix
    if record.number_of_objects is not None:
        payload["numberOfObjects"] = record.number_of_objects
    if record.size is not None:
        payload["size"] = record.size
    if record.file_formats:
        payload["fileFormats"] = record.file_formats
    if record.source_url:
        payload["sourceUrl"] = record.source_url
    if record.full_path:
        payload["fullPath"] = record.full_path
    if record.data_model:
        payload["dataModel"] = record.data_model
    return payload


def _pipeline_service_payload(record: PipelineServiceRecord) -> dict[str, Any]:
    payload: dict[str, Any] = {"name": record.name, "serviceType": record.service_type}
    if record.display_name:
        payload["displayName"] = record.display_name
    if record.description:
        payload["description"] = record.description
    if record.connection:
        payload["connection"] = record.connection
    return payload


def _pipeline_payload(record: PipelineRecord) -> dict[str, Any]:
    payload: dict[str, Any] = {"name": record.name, "service": record.service}
    if record.display_name:
        payload["displayName"] = record.display_name
    if record.description:
        payload["description"] = record.description
    if record.source_url:
        payload["sourceUrl"] = record.source_url
    if record.concurrency is not None:
        payload["concurrency"] = record.concurrency
    if record.pipeline_location:
        payload["pipelineLocation"] = record.pipeline_location
    if record.schedule_interval:
        payload["scheduleInterval"] = record.schedule_interval
    if record.tasks:
        payload["tasks"] = record.tasks
    if record.state:
        payload["state"] = record.state
    return payload

