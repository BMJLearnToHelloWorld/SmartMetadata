# Copyright 2026 SmartMetadata authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

"""Lineage source base: the four channels, in pin order, chunked.

``LineageSource._iter`` runs view → stored-procedure → query →
cross-database (design §3.7), each gated by its config toggle.
Per-engine variation is DATA supplied by the connector subclasses:
the view enumerator, the query-log wiring (spec + connect builder +
engine provider, shared with usage), and the opt-in procedure
provider. The channels themselves — parsing, binding, column
lineage, incremental skips, override deletes — live in the shared
channel modules, not in the connectors.

Chunking and threads follow the pin: items are grouped into chunks
of 200 and processed with in-process threading (multiprocessing is
deliberately disabled — child processes would not share the
temp-table graph), ``max_workers`` from the ``threads`` knob. A
per-item budget bounds each worker; items that time out or raise
unexpectedly are skipped with a warning and counted, while REST
and workflow errors propagate — a server outage must fail the run,
never degrade into silent skips (§3.9).

The query channel is additionally gated on the connection schema
DECLARING ``supportsLineageExtraction`` (field presence on the
connection model, not its value): the declaration set below is
read from the connection schemas, and an engine outside it warns
and skips the channel while the other channels run unaffected.

Cross-database lineage has no separate scan in this
implementation: when ``processCrossDatabaseLineage`` names other
services, the binding resolver attempts those services during the
view/query/procedure channels, and edges landing on a foreign
service are labeled ``CrossDatabaseLineage``. The channel step
itself validates the configuration (enabled-but-unnamed warns)
and otherwise runs the shared resolution — the observable behavior
of the pin's connector overrides, without per-engine cross-database
SQL the spec does not define.
"""

from __future__ import annotations

import logging
from collections.abc import Callable, Iterable, Iterator
from concurrent.futures import ThreadPoolExecutor
from concurrent.futures import TimeoutError as FutureTimeoutError
from dataclasses import dataclass, field
from typing import Any

from smartmetadata_ingestion.client.rest import RestClient
from smartmetadata_ingestion.config import SourceConfig
from smartmetadata_ingestion.errors import RestError, WorkflowError
from smartmetadata_ingestion.lineage.dialect import Dialect
from smartmetadata_ingestion.lineage.graphs import TempTableGraph
from smartmetadata_ingestion.lineage.parser import resolve_parser_type
from smartmetadata_ingestion.lineage.procedure_lineage import (
    ProcedureLineageChannel,
    ProcedureProvider,
)
from smartmetadata_ingestion.lineage.query_lineage import (
    IncrementalChecker,
    QueryLineageProcessor,
    pairs_to_column_lineage,
)
from smartmetadata_ingestion.lineage.resolution import LineageBindingResolver
from smartmetadata_ingestion.lineage.view_lineage import ViewEnumerator, ViewLineageChannel
from smartmetadata_ingestion.records import (
    LineageEndpoint,
    LineageRecord,
    TableQueryRecord,
    WorkflowRecord,
)
from smartmetadata_ingestion.usage.query_log import QueryLogSource

logger = logging.getLogger(__name__)

# Items per processing chunk (design §3.7: CHUNK_SIZE = 200).
CHUNK_SIZE = 200

# Per-item processing budget in seconds (design §3.7:
# QUERY_PROCESSING_TIMEOUT = 300). The parser's own per-query
# timeout (``parsingTimeoutLimit``) bounds the parse itself; this
# bounds the whole item including its REST reads.
QUERY_PROCESSING_TIMEOUT = 300

# Timed-out items tolerated per run before the run fails: a few
# pathological queries must not abort a run, but a run losing many
# items to timeouts is failing, not succeeding with a subset.
MAX_ACTIVE_TIMED_OUT_ITEMS = 10

# Engines whose connection schema declares ``supportsLineageExtraction``
# (verified against openmetadata-spec connection JSONs). Doris,
# MariaDB, and Greenplum declare only
# ``supportsViewLineageExtraction`` and are absent here — their
# query channel warns and skips, exactly as the pin's
# field-presence gate behaves.
SUPPORTS_LINEAGE_EXTRACTION_ENGINES = frozenset(
    {
        "postgres",
        "mysql",
        "snowflake",
        "databricks",
        "unitycatalog",
        "mssql",
        "redshift",
        "timescale",
    }
)


@dataclass
class LineageSummary:
    """Per-channel outcome counts for one run, merged in the main
    thread. The workflow logs this at the end of a run so an empty
    run says which channels found nothing, instead of succeeding
    silently."""

    views_seen: int = 0
    views_filtered: int = 0
    views_skipped_not_cataloged: int = 0
    views_skipped_incremental: int = 0
    view_edges: int = 0
    view_overrides: int = 0
    procedures_seen: int = 0
    procedures_skipped: int = 0
    procedure_edges: int = 0
    procedure_queries: int = 0
    queries_seen: int = 0
    queries_skipped_incremental: int = 0
    queries_unparseable: int = 0
    query_edges: int = 0
    query_records: int = 0
    temp_edges: int = 0
    timed_out_items: int = 0
    failed_items: int = 0
    # Channel-level warning events (C-11/B-4): one per all-disabled,
    # empty-channel, unsupported-engine, or unnamed-cross-database
    # warning. Read by LineageSource.warning_count, never logged here.
    channel_warnings: int = 0
    # Query-log engines whose history read failed in the query
    # channel (C-11/B-4); set once the channel's records are consumed.
    query_log_engine_failures: int = 0
    channels_attempted: list[str] = field(default_factory=list)

    def log(self) -> None:
        logger.info(
            "lineage run summary: channels=%s views=%d viewEdges=%d "
            "procedures=%d procedureEdges=%d queries=%d queryEdges=%d "
            "queryRecords=%d tempEdges=%d skippedIncremental=%d "
            "timedOut=%d failed=%d",
            ",".join(self.channels_attempted),
            self.views_seen,
            self.view_edges,
            self.procedures_seen,
            self.procedure_edges,
            self.queries_seen,
            self.query_edges,
            self.query_records,
            self.temp_edges,
            self.views_skipped_incremental + self.queries_skipped_incremental,
            self.timed_out_items,
            self.failed_items,
        )


class LineageSource:
    """Channel orchestration for one engine's lineage source.

    Subclasses supply the engine's view enumerator, query-log
    wiring, and (opt-in) procedure provider, plus the connection
    test in :meth:`prepare`. The REST client arrives via
    :meth:`bind_client` (the workflow injects its client) or the
    constructor; producing without one fails loudly, since every
    channel binds through REST.
    """

    def __init__(
        self,
        config: SourceConfig,
        *,
        engine_key: str,
        dialect: Dialect,
        client: RestClient | None = None,
        view_enumerator: ViewEnumerator | None = None,
        view_enumerator_factory: Callable[[], ViewEnumerator] | None = None,
        query_log_source: QueryLogSource | None = None,
        query_log_source_factory: Callable[[], QueryLogSource] | None = None,
        procedure_provider: ProcedureProvider | None = None,
        procedure_provider_factory: Callable[[], ProcedureProvider] | None = None,
    ) -> None:
        self._config = config
        self._engine_key = engine_key.strip().lower()
        self._dialect = dialect
        self._client = client
        self._view_enumerator = view_enumerator
        self._view_enumerator_factory = view_enumerator_factory
        self._query_log_source = query_log_source
        self._query_log_source_factory = query_log_source_factory
        self._procedure_provider = procedure_provider
        self._procedure_provider_factory = procedure_provider_factory
        self._summary = LineageSummary()
        self._graph = TempTableGraph()
        self._resolver: LineageBindingResolver | None = None

    @property
    def summary(self) -> LineageSummary:
        return self._summary

    @property
    def warning_count(self) -> int:
        """Warning events for this run (C-11/B-4): channel-level
        warnings, items the channel runner skipped (timeouts +
        unexpected errors), binding-resolution skips from the
        resolver, and query-log engine failures from the query
        channel. Read after ``produce()`` is consumed; zero before
        the first run. The workflow folds this into source-step
        warnings via ``StepStatus.warn``."""
        total = (
            self._summary.channel_warnings
            + self._summary.timed_out_items
            + self._summary.failed_items
            + self._summary.query_log_engine_failures
        )
        if self._resolver is not None:
            total += self._resolver.warning_count
        return total

    def bind_client(self, client: RestClient) -> None:
        """Attach the workflow's REST client (binding, incremental
        checks, and override deletes all read through it)."""
        self._client = client

    def prepare(self) -> None:
        return None

    def close(self) -> None:
        return None

    def produce(self) -> Iterable[WorkflowRecord]:
        config = self._config
        if config.threads < 1:
            raise WorkflowError("threads must be >= 1")
        # Fresh per run, reset before the channels-enabled check so an
        # all-disabled run still reports its warning on a clean summary.
        self._summary = LineageSummary()
        self._graph = TempTableGraph()
        self._resolver = None
        channels_enabled = (
            config.process_view_lineage
            or config.process_stored_procedure_lineage
            or config.process_query_lineage
            or config.process_cross_database_lineage
        )
        if not channels_enabled:
            self._summary.channel_warnings += 1
            logger.warning(
                "all lineage channels are disabled by configuration; "
                "the run produces no lineage"
            )
            return
        client = self._require_client()
        resolver, processor = self._build_processing(client)
        if config.process_view_lineage:
            yield from self._produce_view_channel(client, resolver, processor)
        if config.process_stored_procedure_lineage:
            yield from self._produce_procedure_channel(resolver, processor)
        if config.process_query_lineage:
            yield from self._produce_query_channel(resolver, processor)
        if config.process_cross_database_lineage:
            self._produce_cross_database_channel()
        yield from self._flush_temp_graph()
        self._summary.log()

    def _require_client(self) -> RestClient:
        if self._client is None:
            raise WorkflowError(
                f"lineage source {self._engine_key} has no REST client: "
                "binding resolution needs the catalog, so the workflow "
                "must bind one before producing"
            )
        return self._client

    def _build_processing(
        self, client: RestClient
    ) -> tuple[LineageBindingResolver, QueryLineageProcessor]:
        config = self._config
        connection = config.connection or {}
        resolver = LineageBindingResolver(
            client,
            config.service_name,
            default_database=connection.get("database")
            or connection.get("databaseName")
            or connection.get("catalog"),
            default_schema=connection.get("databaseSchema") or connection.get("schema"),
            cross_database_service_names=config.cross_database_service_names,
            process_cross_database_lineage=config.process_cross_database_lineage,
        )
        checker = (
            IncrementalChecker(client) if config.incremental_lineage_processing else None
        )
        processor = QueryLineageProcessor(
            resolver,
            service_name=config.service_name,
            dialect=self._dialect,
            timeout_seconds=float(config.parsing_timeout_limit),
            parser_type=resolve_parser_type(config.query_parser_config),
            enable_temp_table_lineage=config.enable_temp_table_lineage,
            incremental_checker=checker,
        )
        # Kept so warning_count can read the run's binding skips.
        self._resolver = resolver
        return resolver, processor

    def _produce_view_channel(
        self,
        client: RestClient,
        resolver: LineageBindingResolver,
        processor: QueryLineageProcessor,
    ) -> Iterator[WorkflowRecord]:
        config = self._config
        enumerator = self._view_enumerator or self._build_view_enumerator()
        channel = ViewLineageChannel(
            processor,
            resolver,
            client,
            service_name=config.service_name,
            override_view_lineage=config.override_view_lineage,
            incremental_lineage_processing=config.incremental_lineage_processing,
            include_databases=config.include_databases,
            exclude_databases=config.exclude_databases,
            include_schemas=config.include_schemas,
            exclude_schemas=config.exclude_schemas,
            include_tables=config.include_tables,
            exclude_tables=config.exclude_tables,
            use_fqn_for_filtering=config.use_fqn_for_filtering,
        )
        self._summary.channels_attempted.append("view")
        enumerated = list(enumerator.iter_views())
        views = [view for view in enumerated if channel.selected(view)]
        self._summary.views_filtered = len(enumerated) - len(views)
        if not views:
            self._summary.channel_warnings += 1
            logger.warning(
                "view lineage channel found no views (after filter patterns) "
                "for service %s",
                config.service_name,
            )
            return
        for records, outcome, hops in self._run_chunked(views, channel.process_one):
            self._summary.views_seen += outcome.seen
            self._summary.views_skipped_not_cataloged += outcome.skipped_not_cataloged
            self._summary.views_skipped_incremental += outcome.skipped_incremental
            self._summary.view_edges += outcome.edges
            self._summary.view_overrides += outcome.overrides_deleted
            for hop in hops:
                self._graph.add(hop)
            yield from records

    def _build_view_enumerator(self) -> ViewEnumerator:
        if self._view_enumerator_factory is None:
            raise WorkflowError(
                f"lineage source {self._engine_key} has no view enumerator"
            )
        return self._view_enumerator_factory()

    def _produce_procedure_channel(
        self,
        resolver: LineageBindingResolver,
        processor: QueryLineageProcessor,
    ) -> Iterator[WorkflowRecord]:
        config = self._config
        self._summary.channels_attempted.append("procedure")
        provider = self._procedure_provider or self._build_procedure_provider()
        if provider is None:
            self._summary.channel_warnings += 1
            logger.warning(
                "stored-procedure lineage is not supported for engine %s "
                "in this batch (no CALL-history provider); the channel "
                "is skipped and the other channels run unaffected",
                self._engine_key,
            )
            return
        channel = ProcedureLineageChannel(
            processor,
            resolver,
            service_name=config.service_name,
            include_stored_procedures=config.include_stored_procedures,
            exclude_stored_procedures=config.exclude_stored_procedures,
            use_fqn_for_filtering=config.use_fqn_for_filtering,
        )
        calls = list(
            provider.iter_calls(
                duration_days=config.query_log_duration,
                result_limit=config.result_limit,
            )
        )
        if not calls:
            self._summary.channel_warnings += 1
            logger.warning(
                "stored-procedure lineage channel found no CALLs in the "
                "query-log window for service %s",
                config.service_name,
            )
            return
        for records, outcome, hops in self._run_chunked(calls, channel.process_one):
            self._summary.procedures_seen += outcome.seen
            self._summary.procedures_skipped += (
                outcome.skipped_filtered
                + outcome.skipped_unparseable
                + outcome.skipped_unresolved
                + outcome.skipped_no_code
            )
            self._summary.procedure_edges += outcome.edges + outcome.procedure_edges
            self._summary.procedure_queries += outcome.queries
            for hop in hops:
                self._graph.add(hop)
            yield from records

    def _build_procedure_provider(self) -> ProcedureProvider | None:
        if self._procedure_provider_factory is None:
            return None
        return self._procedure_provider_factory()

    def _produce_query_channel(
        self,
        resolver: LineageBindingResolver,
        processor: QueryLineageProcessor,
    ) -> Iterator[WorkflowRecord]:
        config = self._config
        self._summary.channels_attempted.append("query")
        if self._engine_key not in SUPPORTS_LINEAGE_EXTRACTION_ENGINES:
            self._summary.channel_warnings += 1
            logger.warning(
                "query lineage skipped for engine %s: its connection model "
                "does not declare supportsLineageExtraction; view and "
                "procedure lineage run unaffected",
                self._engine_key,
            )
            return
        query_log = self._query_log_source or self._build_query_log_source()
        records_seen = 0
        for records, outcome in self._run_query_records(query_log, processor):
            records_seen += 1
            yield from records
            self._summary.queries_seen += outcome["seen"]
            self._summary.queries_skipped_incremental += outcome["skipped_incremental"]
            self._summary.queries_unparseable += outcome["unparseable"]
            self._summary.query_edges += outcome["edges"]
            self._summary.query_records += outcome["query_records"]
        # Engine failures surface only after the records are consumed;
        # a query-log double without the counter contributes zero.
        self._summary.query_log_engine_failures = len(
            getattr(query_log, "engine_failures", []) or []
        )
        if records_seen == 0:
            self._summary.channel_warnings += 1
            logger.warning(
                "query lineage channel found no queries in the query-log "
                "window for service %s",
                config.service_name,
            )

    def _build_query_log_source(self) -> QueryLogSource:
        if self._query_log_source_factory is None:
            raise WorkflowError(
                f"lineage source {self._engine_key} has no query-log wiring"
            )
        return self._query_log_source_factory()

    def _run_query_records(
        self,
        query_log: QueryLogSource,
        processor: QueryLineageProcessor,
    ) -> Iterator[tuple[list[WorkflowRecord], dict[str, int]]]:
        """Query records through the chunked processor, one outcome
        per record. Temp hops go to the run graph in the main thread;
        the worker threads never touch it."""
        config = self._config

        def process_one(
            record: TableQueryRecord,
        ) -> tuple[list[WorkflowRecord], dict[str, int], list]:
            processed = processor.process(
                record.query,
                database_name=record.database_name,
                database_schema=record.database_schema,
                emit_query_record=True,
                incremental=config.incremental_lineage_processing,
                user_name=record.user_name,
                query_type=record.query_type,
                duration=record.duration,
                analysis_date=record.analysis_date,
                exclude_usage=record.exclude_usage,
            )
            records: list[WorkflowRecord] = [
                LineageRecord(
                    from_entity=LineageEndpoint(type="table", fqn=edge.from_fqn),
                    to_entity=LineageEndpoint(type="table", fqn=edge.to_fqn),
                    source="CrossDatabaseLineage"
                    if edge.cross_database
                    else "QueryLineage",
                    sql_query=edge.sql_query,
                    columns_lineage=list(edge.columns),
                )
                for edge in processed.edges
            ]
            if processed.query_record is not None:
                records.append(processed.query_record)
            outcome = {
                "seen": 1,
                "skipped_incremental": 1 if processed.skipped_incremental else 0,
                "unparseable": 0 if processed.parsed else 1,
                "edges": len(processed.edges),
                "query_records": 1 if processed.query_record is not None else 0,
            }
            return records, outcome, list(processed.temp_hops)

        for records, outcome, hops in self._run_chunked(
            query_log.produce(), process_one
        ):
            for hop in hops:
                self._graph.add(hop)
            yield records, outcome

    def _produce_cross_database_channel(self) -> None:
        """Cross-database validation step. Resolution across the
        named services already ran inside the other channels; this
        step only reports the configuration state, so an enabled
        channel with no services named is warned about, not
        silently inert."""
        config = self._config
        self._summary.channels_attempted.append("crossDatabase")
        if not config.cross_database_service_names:
            self._summary.channel_warnings += 1
            logger.warning(
                "processCrossDatabaseLineage is enabled but "
                "crossDatabaseServiceNames is empty; no cross-database "
                "resolution was attempted"
            )

    def _flush_temp_graph(self) -> Iterator[WorkflowRecord]:
        if not self._config.enable_temp_table_lineage:
            return
        for edge in self._graph.flush():
            self._summary.temp_edges += 1
            yield LineageRecord(
                from_entity=LineageEndpoint(type="table", fqn=edge.from_fqn),
                to_entity=LineageEndpoint(type="table", fqn=edge.to_fqn),
                source="QueryLineage",
                sql_query=edge.sql_query,
                columns_lineage=pairs_to_column_lineage(edge.columns),
            )

    def _run_chunked(
        self,
        items: Iterable[Any],
        worker: Callable[[Any], Any],
    ) -> Iterator[Any]:
        """Items in chunks of 200, processed by the ``threads`` pool.
        Results stream in submission order. A fatal error (REST or
        workflow) aborts the run; any other per-item failure warns
        and skips that item; timeouts count toward the run's
        tolerance and then fail it."""
        threads = max(1, self._config.threads)
        chunk: list[Any] = []
        for item in items:
            chunk.append(item)
            if len(chunk) >= CHUNK_SIZE:
                yield from self._run_chunk(chunk, worker, threads)
                chunk = []
        if chunk:
            yield from self._run_chunk(chunk, worker, threads)

    def _run_chunk(
        self,
        chunk: list[Any],
        worker: Callable[[Any], Any],
        threads: int,
    ) -> Iterator[Any]:
        with ThreadPoolExecutor(max_workers=threads) as executor:
            futures = [executor.submit(worker, item) for item in chunk]
            for future in futures:
                try:
                    yield future.result(timeout=QUERY_PROCESSING_TIMEOUT)
                except FutureTimeoutError:
                    self._summary.timed_out_items += 1
                    logger.warning(
                        "lineage item exceeded the %ds processing budget; skipping",
                        QUERY_PROCESSING_TIMEOUT,
                    )
                    if self._summary.timed_out_items > MAX_ACTIVE_TIMED_OUT_ITEMS:
                        raise WorkflowError(
                            f"lineage run lost {self._summary.timed_out_items} items "
                            "to processing timeouts; failing instead of succeeding "
                            "with a subset"
                        ) from None
                except (RestError, WorkflowError):
                    for pending in futures:
                        pending.cancel()
                    raise
                except Exception as exc:
                    self._summary.failed_items += 1
                    logger.warning("skipping lineage item after an error: %s", exc)
