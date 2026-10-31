# Copyright 2026 SmartMetadata authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0
#

"""Amazon S3 storage connector (Metadata + Sampler + Connection).

Official OM ``storage/s3`` BaseSpec is Metadata + Sampler + Connection.
Clean-room Sequence* pattern (no CCL copy). Live boto3 readers optional.
"""

from __future__ import annotations

from collections.abc import Callable, Iterable, Sequence
from dataclasses import dataclass, field
from typing import Any, Protocol

from smartmetadata_ingestion.config import SourceConfig
from smartmetadata_ingestion.connectors.registry import register_source
from smartmetadata_ingestion.connectors.select import is_selected
from smartmetadata_ingestion.errors import WorkflowError
from smartmetadata_ingestion.records import (
    ContainerRecord,
    StorageServiceRecord,
    WorkflowRecord,
)


@dataclass(frozen=True, slots=True)
class ContainerRow:
    name: str
    display_name: str | None = None
    description: str | None = None
    parent_name: str | None = None  # relative parent container name within service, or None for top-level bucket
    parent_fqn: str | None = None  # full parent FQN when known
    prefix: str | None = None
    number_of_objects: float | None = None
    size: float | None = None
    file_formats: list[str] | None = None
    source_url: str | None = None
    full_path: str | None = None
    data_model: dict[str, Any] | None = None


@dataclass(frozen=True, slots=True)
class ObjectSampleRow:
    key: str
    size: int | None = None
    etag: str | None = None
    last_modified: str | None = None
    storage_class: str | None = None


class StorageCatalogReader(Protocol):
    def test_connection(self) -> None: ...

    def list_containers(self) -> Sequence[ContainerRow]: ...


class StorageObjectSampler(Protocol):
    def sample_objects(self, *, bucket: str, prefix: str = "", limit: int = 50) -> Sequence[ObjectSampleRow]: ...


class SequenceStorageCatalogReader:
    def __init__(
        self,
        *,
        containers: Sequence[ContainerRow] = (),
        fail_test: bool = False,
    ) -> None:
        self._containers = list(containers)
        self._fail_test = fail_test

    def test_connection(self) -> None:
        if self._fail_test:
            raise WorkflowError("s3 test connection failed")

    def list_containers(self) -> Sequence[ContainerRow]:
        return self._containers


class SequenceStorageObjectSampler:
    def __init__(self, *, samples: dict[str, Sequence[ObjectSampleRow]] | None = None) -> None:
        self._samples = {k: list(v) for k, v in (samples or {}).items()}

    def sample_objects(self, *, bucket: str, prefix: str = "", limit: int = 50) -> Sequence[ObjectSampleRow]:
        key = f"{bucket}:{prefix}"
        rows = self._samples.get(key) or self._samples.get(bucket) or []
        return list(rows)[:limit]


class S3BotoCatalogReader:
    """Lists buckets and optional top-level prefixes via an injectable boto3 client."""

    def __init__(
        self,
        *,
        client: Any,
        bucket_names: Sequence[str] | None = None,
        console_endpoint_url: str | None = None,
        list_prefixes: bool = True,
    ) -> None:
        if client is None:
            raise WorkflowError("s3 boto3 client is required")
        self._client = client
        self._bucket_names = [b for b in (bucket_names or []) if b]
        self._console = (console_endpoint_url or "").rstrip("/") or None
        self._list_prefixes = list_prefixes

    def test_connection(self) -> None:
        try:
            if self._bucket_names:
                for name in self._bucket_names:
                    self._client.head_bucket(Bucket=name)
            else:
                self._client.list_buckets()
        except WorkflowError:
            raise
        except Exception as exc:  # noqa: BLE001 — surface as workflow error
            raise WorkflowError(f"s3 test connection failed: {exc}") from exc

    def list_containers(self) -> Sequence[ContainerRow]:
        rows: list[ContainerRow] = []
        for bucket in self._iter_buckets():
            source_url = f"{self._console}/{bucket}" if self._console else None
            rows.append(
                ContainerRow(
                    name=bucket,
                    display_name=bucket,
                    prefix=f"/{bucket}/",
                    full_path=f"s3://{bucket}",
                    source_url=source_url,
                )
            )
            if self._list_prefixes:
                for prefix in self._list_common_prefixes(bucket):
                    # prefix like "engineering/" -> nested under bucket
                    name = prefix.rstrip("/").split("/")[-1]
                    if not name:
                        continue
                    rows.append(
                        ContainerRow(
                            name=name,
                            display_name=name,
                            parent_name=bucket,
                            prefix=f"/{bucket}/{prefix}",
                            full_path=f"s3://{bucket}/{prefix}",
                            source_url=f"{self._console}/{bucket}/{prefix}" if self._console else None,
                        )
                    )
        return rows

    def _iter_buckets(self) -> list[str]:
        if self._bucket_names:
            return list(self._bucket_names)
        payload = self._client.list_buckets()
        buckets = payload.get("Buckets") if isinstance(payload, dict) else None
        names: list[str] = []
        if isinstance(buckets, list):
            for item in buckets:
                if isinstance(item, dict) and item.get("Name"):
                    names.append(str(item["Name"]))
        return names

    def _list_common_prefixes(self, bucket: str) -> list[str]:
        try:
            payload = self._client.list_objects_v2(Bucket=bucket, Delimiter="/")
        except Exception:
            return []
        if not isinstance(payload, dict):
            return []
        out: list[str] = []
        for entry in payload.get("CommonPrefixes") or []:
            if isinstance(entry, dict) and entry.get("Prefix"):
                out.append(str(entry["Prefix"]))
        return out


class S3BotoObjectSampler:
    def __init__(self, *, client: Any) -> None:
        if client is None:
            raise WorkflowError("s3 boto3 client is required for sampler")
        self._client = client

    def sample_objects(self, *, bucket: str, prefix: str = "", limit: int = 50) -> Sequence[ObjectSampleRow]:
        try:
            payload = self._client.list_objects_v2(Bucket=bucket, Prefix=prefix or "", MaxKeys=max(1, limit))
        except Exception as exc:  # noqa: BLE001
            raise WorkflowError(f"s3 sample failed for {bucket}: {exc}") from exc
        rows: list[ObjectSampleRow] = []
        if not isinstance(payload, dict):
            return rows
        for item in payload.get("Contents") or []:
            if not isinstance(item, dict) or not item.get("Key"):
                continue
            lm = item.get("LastModified")
            rows.append(
                ObjectSampleRow(
                    key=str(item["Key"]),
                    size=int(item["Size"]) if item.get("Size") is not None else None,
                    etag=str(item["ETag"]).strip('"') if item.get("ETag") else None,
                    last_modified=str(lm) if lm is not None else None,
                    storage_class=str(item["StorageClass"]) if item.get("StorageClass") else None,
                )
            )
        return rows


def build_boto3_client(aws_config: dict[str, Any]) -> Any:
    """Create a boto3 S3 client from official awsCredentials fields."""
    try:
        import boto3
        from botocore.config import Config as BotoConfig
    except ImportError as exc:  # pragma: no cover - optional extra
        raise WorkflowError(
            "s3 connector requires boto3; install smartmetadata-ingestion[s3]"
        ) from exc

    region = aws_config.get("awsRegion") or aws_config.get("aws_region")
    if not region:
        raise WorkflowError("s3 awsConfig.awsRegion is required")
    kwargs: dict[str, Any] = {"service_name": "s3", "region_name": str(region)}
    key = aws_config.get("awsAccessKeyId") or aws_config.get("aws_access_key_id")
    secret = aws_config.get("awsSecretAccessKey") or aws_config.get("aws_secret_access_key")
    token = aws_config.get("awsSessionToken") or aws_config.get("aws_session_token")
    if key:
        kwargs["aws_access_key_id"] = str(key)
    if secret:
        kwargs["aws_secret_access_key"] = str(secret)
    if token:
        kwargs["aws_session_token"] = str(token)
    endpoint = aws_config.get("endPointURL") or aws_config.get("endpoint_url")
    if endpoint:
        kwargs["endpoint_url"] = str(endpoint)
    profile = aws_config.get("profileName") or aws_config.get("profile_name")
    session_kwargs: dict[str, Any] = {}
    if profile:
        session_kwargs["profile_name"] = str(profile)
    session = boto3.session.Session(**session_kwargs)
    # assume role optional
    role_arn = aws_config.get("assumeRoleArn")
    if role_arn:
        sts = session.client("sts", region_name=str(region))
        assume_kwargs: dict[str, Any] = {
            "RoleArn": str(role_arn),
            "RoleSessionName": str(
                aws_config.get("assumeRoleSessionName") or "OpenMetadataSession"
            ),
        }
        source_identity = aws_config.get("assumeRoleSourceIdentity")
        if source_identity:
            assume_kwargs["SourceIdentity"] = str(source_identity)
        creds = sts.assume_role(**assume_kwargs)["Credentials"]
        kwargs["aws_access_key_id"] = creds["AccessKeyId"]
        kwargs["aws_secret_access_key"] = creds["SecretAccessKey"]
        kwargs["aws_session_token"] = creds["SessionToken"]
    return session.client(**kwargs, config=BotoConfig(retries={"max_attempts": 3}))


class S3Sampler:
    """Sampler surface matching OM service_spec ``sampler_class``.

    Unit BehaviorMatched via injectable StorageObjectSampler. Live archive /
    parquet schema inference remains Partial (see plan).
    """

    def __init__(
        self,
        config: SourceConfig,
        *,
        sampler: StorageObjectSampler | None = None,
        client_factory: Callable[[dict[str, Any]], Any] | None = None,
    ) -> None:
        self._config = config
        self._sampler = sampler
        self._client_factory = client_factory or build_boto3_client

    def sample(self, *, bucket: str, prefix: str = "", limit: int = 50) -> list[dict[str, Any]]:
        sampler = self._sampler or self._build_sampler()
        rows = sampler.sample_objects(bucket=bucket, prefix=prefix, limit=limit)
        return [
            {
                "key": row.key,
                "size": row.size,
                "etag": row.etag,
                "lastModified": row.last_modified,
                "storageClass": row.storage_class,
            }
            for row in rows
        ]

    def _build_sampler(self) -> StorageObjectSampler:
        raw = dict(self._config.connection or {})
        aws = raw.get("awsConfig") if isinstance(raw.get("awsConfig"), dict) else raw
        client = self._client_factory(dict(aws or {}))
        return S3BotoObjectSampler(client=client)


@register_source("s3")
class S3Source:
    def __init__(
        self,
        config: SourceConfig,
        *,
        reader: StorageCatalogReader | None = None,
        sampler: StorageObjectSampler | None = None,
        client_factory: Callable[[dict[str, Any]], Any] | None = None,
    ) -> None:
        self._config = config
        self._reader = reader
        self._sampler = sampler
        self._client_factory = client_factory or build_boto3_client
        self._owns_client: Any | None = None

    def prepare(self) -> None:
        reader = self._reader or self._build_reader()
        reader.test_connection()

    def close(self) -> None:
        return None

    def produce(self) -> Iterable[WorkflowRecord]:
        yield self._service_record()
        reader = self._reader or self._build_reader()
        # Ensure connection works for live path when produce runs without prepare.
        reader.test_connection()
        service = self._config.service_name
        emitted_fqn: dict[str, str] = {}
        for row in self._selected_containers(reader):
            parent_fqn = row.parent_fqn
            if parent_fqn is None and row.parent_name:
                parent_fqn = emitted_fqn.get(row.parent_name) or f"{service}.{row.parent_name}"
            if parent_fqn:
                fqn = f"{parent_fqn}.{row.name}"
            else:
                fqn = f"{service}.{row.name}"
            emitted_fqn[row.name] = fqn
            yield ContainerRecord(
                name=row.name,
                service=service,
                display_name=row.display_name,
                description=row.description,
                parent_fqn=parent_fqn,
                prefix=row.prefix,
                number_of_objects=row.number_of_objects,
                size=row.size,
                file_formats=list(row.file_formats) if row.file_formats else None,
                source_url=row.source_url,
                full_path=row.full_path,
                data_model=row.data_model,
            )

    def sampler(self) -> S3Sampler:
        return S3Sampler(
            self._config,
            sampler=self._sampler,
            client_factory=self._client_factory,
        )

    def _service_record(self) -> StorageServiceRecord:
        raw = dict(self._config.connection or {})
        connection_config = _public_s3_connection(raw, store_secrets=self._config.store_connection_secrets)
        return StorageServiceRecord(
            name=self._config.service_name,
            service_type="S3",
            display_name=self._config.service_display_name,
            connection={"config": connection_config} if connection_config else None,
        )

    def _build_reader(self) -> StorageCatalogReader:
        raw = dict(self._config.connection or {})
        aws = raw.get("awsConfig") if isinstance(raw.get("awsConfig"), dict) else {}
        if not aws and (raw.get("awsRegion") or raw.get("awsAccessKeyId")):
            aws = raw
        client = self._client_factory(dict(aws or {}))
        bucket_names = raw.get("bucketNames") or raw.get("bucket_names") or []
        if isinstance(bucket_names, str):
            bucket_names = [b.strip() for b in bucket_names.split(",") if b.strip()]
        console = raw.get("consoleEndpointURL") or raw.get("console_endpoint_url")
        return S3BotoCatalogReader(
            client=client,
            bucket_names=list(bucket_names) if isinstance(bucket_names, (list, tuple)) else [],
            console_endpoint_url=str(console) if console else None,
        )

    def _selected_containers(self, reader: StorageCatalogReader) -> list[ContainerRow]:
        include = self._config.include_containers
        exclude = self._config.exclude_containers
        selected: list[ContainerRow] = []
        for row in reader.list_containers():
            key = row.display_name or row.name
            if not is_selected(key, include=include, exclude=exclude) and not is_selected(
                row.name, include=include, exclude=exclude
            ):
                continue
            selected.append(row)
        return selected


def _public_s3_connection(raw: dict[str, Any], *, store_secrets: bool = False) -> dict[str, Any]:
    """Emit official s3Connection shape; omit secrets unless store_connection_secrets."""
    out: dict[str, Any] = {"type": "S3"}
    aws_raw = raw.get("awsConfig") if isinstance(raw.get("awsConfig"), dict) else None
    if aws_raw is None and (raw.get("awsRegion") or raw.get("awsAccessKeyId")):
        aws_raw = raw
    if isinstance(aws_raw, dict):
        aws: dict[str, Any] = {}
        region = aws_raw.get("awsRegion") or aws_raw.get("aws_region")
        if region:
            aws["awsRegion"] = str(region)
        key = aws_raw.get("awsAccessKeyId") or aws_raw.get("aws_access_key_id")
        if key:
            aws["awsAccessKeyId"] = str(key)
        if store_secrets:
            secret = aws_raw.get("awsSecretAccessKey") or aws_raw.get("aws_secret_access_key")
            if secret:
                aws["awsSecretAccessKey"] = str(secret)
            token = aws_raw.get("awsSessionToken") or aws_raw.get("aws_session_token")
            if token:
                aws["awsSessionToken"] = str(token)
        for src, dest in (
            ("endPointURL", "endPointURL"),
            ("endpoint_url", "endPointURL"),
            ("profileName", "profileName"),
            ("profile_name", "profileName"),
            ("assumeRoleArn", "assumeRoleArn"),
            ("assumeRoleSessionName", "assumeRoleSessionName"),
            ("assumeRoleSourceIdentity", "assumeRoleSourceIdentity"),
            ("enabled", "enabled"),
        ):
            if aws_raw.get(src) is not None and dest not in aws:
                aws[dest] = aws_raw[src]
        if aws:
            out["awsConfig"] = aws
    buckets = raw.get("bucketNames") or raw.get("bucket_names")
    if isinstance(buckets, str):
        buckets = [b.strip() for b in buckets.split(",") if b.strip()]
    if isinstance(buckets, list) and buckets:
        out["bucketNames"] = [str(b) for b in buckets]
    console = raw.get("consoleEndpointURL") or raw.get("console_endpoint_url")
    if console:
        out["consoleEndpointURL"] = str(console)
    if raw.get("supportsMetadataExtraction") is not None:
        out["supportsMetadataExtraction"] = bool(raw["supportsMetadataExtraction"])
    if raw.get("supportsProfiler") is not None:
        out["supportsProfiler"] = bool(raw["supportsProfiler"])
    cfp = raw.get("containerFilterPattern")
    if isinstance(cfp, dict):
        out["containerFilterPattern"] = cfp
    return out
