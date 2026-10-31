# Copyright 2026 SmartMetadata authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0
#

from __future__ import annotations

from typing import Any

import pytest

from smartmetadata_ingestion.config import SourceConfig
from smartmetadata_ingestion.connectors.registry import get_source, load_builtin_sources, registered_source_types
from smartmetadata_ingestion.connectors.s3 import (
    ContainerRow,
    ObjectSampleRow,
    S3BotoCatalogReader,
    S3BotoObjectSampler,
    S3Sampler,
    S3Source,
    SequenceStorageCatalogReader,
    SequenceStorageObjectSampler,
)
from smartmetadata_ingestion.errors import WorkflowError
from smartmetadata_ingestion.records import ContainerRecord, StorageServiceRecord
from smartmetadata_ingestion.topology import order_records


class _FakeS3Client:
    def __init__(self, *, buckets: list[str] | None = None, prefixes: dict[str, list[str]] | None = None, objects: dict[str, list[dict[str, Any]]] | None = None, fail: bool = False) -> None:
        self.buckets = buckets or []
        self.prefixes = prefixes or {}
        self.objects = objects or {}
        self.fail = fail
        self.calls: list[str] = []

    def list_buckets(self) -> dict[str, Any]:
        self.calls.append("list_buckets")
        if self.fail:
            raise RuntimeError("boom")
        return {"Buckets": [{"Name": n} for n in self.buckets]}

    def head_bucket(self, Bucket: str) -> dict[str, Any]:
        self.calls.append(f"head_bucket:{Bucket}")
        if self.fail:
            raise RuntimeError("boom")
        if Bucket not in self.buckets and self.buckets:
            raise RuntimeError("missing")
        return {}

    def list_objects_v2(self, Bucket: str, Delimiter: str | None = None, Prefix: str = "", MaxKeys: int = 1000) -> dict[str, Any]:
        self.calls.append(f"list_objects_v2:{Bucket}:{Delimiter}:{Prefix}")
        if Delimiter:
            return {"CommonPrefixes": [{"Prefix": p} for p in self.prefixes.get(Bucket, [])]}
        contents = self.objects.get(Bucket, [])
        return {"Contents": contents[:MaxKeys]}


def test_s3_registered() -> None:
    load_builtin_sources()
    assert "s3" in registered_source_types()
    source = get_source(
        "s3",
        SourceConfig(type="s3", service_name="obj", connection={"awsConfig": {"awsRegion": "us-east-1"}}),
        reader=SequenceStorageCatalogReader(),
    )
    assert isinstance(source, S3Source)


def test_s3_source_emits_service_and_nested_containers() -> None:
    source = S3Source(
        SourceConfig(
            type="s3",
            service_name="s3-prod",
            connection={
                "awsConfig": {
                    "awsRegion": "us-east-1",
                    "awsAccessKeyId": "AKIA",
                    "awsSecretAccessKey": "secret",
                },
                "bucketNames": ["departments", "transactions"],
                "consoleEndpointURL": "https://console.aws.amazon.com/s3/buckets",
            },
            include_containers=["departments", "engineering", "transactions"],
        ),
        reader=SequenceStorageCatalogReader(
            containers=[
                ContainerRow(name="departments", prefix="/departments/"),
                ContainerRow(name="engineering", parent_name="departments", prefix="/departments/engineering/"),
                ContainerRow(name="transactions", prefix="/transactions/", file_formats=["parquet"], number_of_objects=10, size=1024),
                ContainerRow(name="ignored", prefix="/ignored/"),
            ]
        ),
    )
    records = list(source.produce())
    assert records[0].kind == "storageService"
    service = records[0]
    assert isinstance(service, StorageServiceRecord)
    assert service.service_type == "S3"
    assert service.connection["config"]["awsConfig"]["awsRegion"] == "us-east-1"
    assert service.connection["config"]["awsConfig"]["awsAccessKeyId"] == "AKIA"
    assert "awsSecretAccessKey" not in service.connection["config"]["awsConfig"]
    assert service.connection["config"]["bucketNames"] == ["departments", "transactions"]
    containers = [r for r in records if isinstance(r, ContainerRecord)]
    assert [c.name for c in containers] == ["departments", "engineering", "transactions"]
    assert containers[1].parent_fqn == "s3-prod.departments"
    ordered = order_records(records)
    assert ordered[0].kind == "storageService"
    assert all(r.kind == "container" for r in ordered[1:])


def test_s3_boto_reader_lists_buckets_and_prefixes() -> None:
    client = _FakeS3Client(
        buckets=["alpha", "beta"],
        prefixes={"alpha": ["team-a/", "team-b/"]},
    )
    reader = S3BotoCatalogReader(client=client, console_endpoint_url="https://console.example/s3")
    reader.test_connection()
    rows = reader.list_containers()
    names = [r.name for r in rows]
    assert names[0] == "alpha"
    assert "team-a" in names
    assert any(r.parent_name == "alpha" for r in rows if r.name == "team-a")


def test_s3_boto_reader_test_failure() -> None:
    reader = S3BotoCatalogReader(client=_FakeS3Client(fail=True))
    with pytest.raises(WorkflowError, match="test connection failed"):
        reader.test_connection()


def test_s3_sampler_sequence_and_boto() -> None:
    seq = SequenceStorageObjectSampler(
        samples={"lake": [ObjectSampleRow(key="a.parquet", size=12), ObjectSampleRow(key="b.csv", size=3)]}
    )
    sampler = S3Sampler(
        SourceConfig(type="s3", service_name="s3", connection={"awsConfig": {"awsRegion": "us-east-1"}}),
        sampler=seq,
    )
    rows = sampler.sample(bucket="lake", limit=10)
    assert [r["key"] for r in rows] == ["a.parquet", "b.csv"]

    client = _FakeS3Client(objects={"lake": [{"Key": "x.json", "Size": 5, "ETag": '"abc"', "StorageClass": "STANDARD"}]})
    boto_sampler = S3BotoObjectSampler(client=client)
    sampled = boto_sampler.sample_objects(bucket="lake", limit=5)
    assert sampled[0].key == "x.json"
    assert sampled[0].etag == "abc"


def test_s3_source_exposes_sampler() -> None:
    source = S3Source(
        SourceConfig(type="s3", service_name="s3", connection={"awsConfig": {"awsRegion": "us-east-1"}}),
        reader=SequenceStorageCatalogReader(containers=[ContainerRow(name="b1")]),
        sampler=SequenceStorageObjectSampler(samples={"b1": [ObjectSampleRow(key="o1")]}),
    )
    assert source.sampler().sample(bucket="b1")[0]["key"] == "o1"
