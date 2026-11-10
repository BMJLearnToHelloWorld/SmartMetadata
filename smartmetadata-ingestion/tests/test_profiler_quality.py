# Copyright 2026 SmartMetadata authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

from __future__ import annotations

import json

import httpx
import pytest

from smartmetadata_ingestion.client.rest import RestClient
from smartmetadata_ingestion.config import AuthConfig, ServerConfig
from smartmetadata_ingestion.connectors.base import parse_static_record
from smartmetadata_ingestion.errors import WorkflowError
from smartmetadata_ingestion.records import ProfileRecord, TestCaseResultRecord
from smartmetadata_ingestion.sinks.metadata_rest import MetadataRestSink


def _jwt_server() -> ServerConfig:
    return ServerConfig(
        host_port="http://catalog.test/api",
        auth=AuthConfig(type="jwt", jwt_token="bot-token"),
    )


def test_client_profile_and_test_result_paths() -> None:
    seen: list[tuple[str, str, dict | None]] = []

    def handler(request: httpx.Request) -> httpx.Response:
        body = json.loads(request.content.decode()) if request.content else None
        seen.append((request.method, request.url.path, body))
        return httpx.Response(200, json={"ok": True})

    with RestClient(_jwt_server(), transport=httpx.MockTransport(handler)) as client:
        client.post_entity_profile_by_name(
            "table",
            "svc.db.s.t",
            {
                "entityType": "table",
                "profileType": "table",
                "profileData": {"timestamp": 1, "rowCount": 10},
            },
        )
        client.put_table_profile(
            "uuid-1",
            {"tableProfile": {"timestamp": 1, "rowCount": 10}},
        )
        client.post_test_case_result(
            "suite.case",
            {
                "timestamp": 100,
                "testCaseStatus": "Success",
                "testResultValue": [{"name": "value", "value": "1"}],
            },
        )
    assert seen[0][0:2] == (
        "POST",
        "/api/v1/entity/profiles/name/table/svc.db.s.t",
    )
    assert seen[1][0:2] == ("PUT", "/api/v1/tables/uuid-1/tableProfile")
    assert seen[2][0:2] == (
        "POST",
        "/api/v1/dataQuality/testCases/testCaseResults/suite.case",
    )
    assert seen[2][2]["fqn"] == "suite.case"
    assert seen[2][2]["testCaseStatus"] == "Success"


def test_sink_writes_entity_profile_and_test_result() -> None:
    calls: list[tuple] = []

    class Fake:
        def post_entity_profile_by_name(self, entity_type, fqn, payload):
            calls.append(("profile", entity_type, fqn, payload))
            return payload

        def post_test_case_result(self, test_case_fqn, payload):
            calls.append(("tcr", test_case_fqn, payload))
            return payload

    sink = MetadataRestSink(Fake())  # type: ignore[arg-type]
    sink.write(
        ProfileRecord(
            fqn="svc.db.s.t",
            profile_data={"timestamp": 1, "rowCount": 3},
            profile_type="table",
            timestamp=1,
        )
    )
    sink.write(
        TestCaseResultRecord(
            test_case_fqn="suite.case",
            timestamp=100,
            test_case_status="Failed",
            test_result_value=[{"name": "value", "value": "0"}],
            failed_rows=2,
        )
    )
    assert calls[0][0] == "profile"
    assert calls[0][3]["profileData"]["rowCount"] == 3
    assert calls[1][0] == "tcr"
    assert calls[1][2]["testCaseStatus"] == "Failed"
    assert calls[1][2]["failedRows"] == 2


def test_sink_posts_each_column_profile_on_fqn_path() -> None:
    calls: list[tuple] = []

    class Fake:
        def post_entity_profile_by_name(self, entity_type, fqn, payload):
            calls.append(("profile", entity_type, fqn, payload))
            return payload

    sink = MetadataRestSink(Fake())  # type: ignore[arg-type]
    sink.write(
        ProfileRecord(
            fqn="svc.db.s.t",
            profile_data={"timestamp": 1, "rowCount": 3},
            profile_type="table",
            timestamp=1,
            column_profile=[
                {"name": "id", "nullCount": 0, "distinctCount": 3},
                {"name": "amount", "nullCount": 1, "distinctCount": 2},
            ],
        )
    )
    assert len(calls) == 3
    assert calls[0][3]["profileType"] == "table"
    assert calls[0][3]["profileData"]["rowCount"] == 3
    for call, name in ((calls[1], "id"), (calls[2], "amount")):
        assert call[1] == "table"
        assert call[2] == "svc.db.s.t"
        assert call[3]["profileType"] == "column"
        assert call[3]["profileData"]["name"] == name
        assert call[3]["timestamp"] == 1
    assert calls[1][3]["profileData"] == {"name": "id", "nullCount": 0, "distinctCount": 3}
    assert calls[2][3]["profileData"] == {"name": "amount", "nullCount": 1, "distinctCount": 2}


def test_sink_fqn_path_without_columns_posts_table_only() -> None:
    calls: list[tuple] = []

    class Fake:
        def post_entity_profile_by_name(self, entity_type, fqn, payload):
            calls.append(("profile", entity_type, fqn, payload))
            return payload

    sink = MetadataRestSink(Fake())  # type: ignore[arg-type]
    sink.write(
        ProfileRecord(
            fqn="svc.db.s.t",
            profile_data={"timestamp": 1, "rowCount": 3},
            profile_type="table",
            timestamp=1,
        )
    )
    assert len(calls) == 1
    assert calls[0][3]["profileType"] == "table"


def test_sink_legacy_table_id_path_still_bundles_columns() -> None:
    calls: list[tuple] = []

    class Fake:
        def put_table_profile(self, table_id, payload):
            calls.append(("table-profile", table_id, payload))
            return payload

    sink = MetadataRestSink(Fake())  # type: ignore[arg-type]
    sink.write(
        ProfileRecord(
            table_id="uuid-1",
            table_profile={"timestamp": 1, "rowCount": 3},
            column_profile=[{"name": "id", "nullCount": 0}],
            system_profile=[{"timestamp": 1, "operation": "INSERT"}],
        )
    )
    assert len(calls) == 1
    assert calls[0][0] == "table-profile"
    assert calls[0][1] == "uuid-1"
    assert calls[0][2]["tableProfile"] == {"timestamp": 1, "rowCount": 3}
    assert calls[0][2]["columnProfile"] == [{"name": "id", "nullCount": 0}]
    assert calls[0][2]["systemProfile"] == [{"timestamp": 1, "operation": "INSERT"}]


def test_sink_posts_each_system_profile_on_fqn_path() -> None:
    calls: list[tuple] = []

    class Fake:
        def post_entity_profile_by_name(self, entity_type, fqn, payload):
            calls.append(("profile", entity_type, fqn, payload))
            return payload

    sink = MetadataRestSink(Fake())  # type: ignore[arg-type]
    sink.write(
        ProfileRecord(
            fqn="svc.db.s.t",
            profile_data={"timestamp": 1, "rowCount": 3},
            profile_type="table",
            timestamp=1,
            system_profile=[
                {"timestamp": 1, "operation": "INSERT", "rowsAffected": 10},
                {"timestamp": 2, "operation": "DELETE", "rowsAffected": 4},
            ],
        )
    )
    assert len(calls) == 3
    assert calls[0][3]["profileType"] == "table"
    assert calls[0][3]["profileData"]["rowCount"] == 3
    for call, operation in ((calls[1], "INSERT"), (calls[2], "DELETE")):
        assert call[1] == "table"
        assert call[2] == "svc.db.s.t"
        assert call[3]["profileType"] == "system"
        assert call[3]["profileData"]["operation"] == operation
        assert call[3]["timestamp"] == 1
    assert calls[1][3]["profileData"] == {
        "timestamp": 1,
        "operation": "INSERT",
        "rowsAffected": 10,
    }
    assert calls[2][3]["profileData"] == {
        "timestamp": 2,
        "operation": "DELETE",
        "rowsAffected": 4,
    }


def test_sink_fqn_path_without_system_posts_table_and_columns_only() -> None:
    calls: list[tuple] = []

    class Fake:
        def post_entity_profile_by_name(self, entity_type, fqn, payload):
            calls.append(("profile", entity_type, fqn, payload))
            return payload

    sink = MetadataRestSink(Fake())  # type: ignore[arg-type]
    sink.write(
        ProfileRecord(
            fqn="svc.db.s.t",
            profile_data={"timestamp": 1, "rowCount": 3},
            profile_type="table",
            timestamp=1,
            column_profile=[{"name": "id", "nullCount": 0}],
        )
    )
    assert len(calls) == 2
    assert calls[0][3]["profileType"] == "table"
    assert calls[1][3]["profileType"] == "column"
    assert all(call[3]["profileType"] != "system" for call in calls)


def test_sink_failing_system_post_surfaces() -> None:
    calls: list[str] = []

    class Fake:
        def post_entity_profile_by_name(self, entity_type, fqn, payload):
            calls.append(payload["profileType"])
            if payload.get("profileType") == "system":
                raise WorkflowError("system post failed")
            return payload

    sink = MetadataRestSink(Fake())  # type: ignore[arg-type]
    with pytest.raises(WorkflowError, match="system post failed"):
        sink.write(
            ProfileRecord(
                fqn="svc.db.s.t",
                profile_data={"timestamp": 1, "rowCount": 3},
                profile_type="table",
                timestamp=1,
                column_profile=[{"name": "id", "nullCount": 0}],
                system_profile=[{"timestamp": 1, "operation": "INSERT"}],
            )
        )
    assert calls == ["table", "column", "system"]


def test_sink_failing_column_post_surfaces() -> None:
    calls: list[str] = []

    class Fake:
        def post_entity_profile_by_name(self, entity_type, fqn, payload):
            calls.append(payload["profileType"])
            if payload.get("profileType") == "column":
                raise WorkflowError("column post failed")
            return payload

    sink = MetadataRestSink(Fake())  # type: ignore[arg-type]
    with pytest.raises(WorkflowError, match="column post failed"):
        sink.write(
            ProfileRecord(
                fqn="svc.db.s.t",
                profile_data={"timestamp": 1, "rowCount": 3},
                profile_type="table",
                timestamp=1,
                column_profile=[{"name": "id", "nullCount": 0}],
            )
        )
    assert calls == ["table", "column"]


def test_static_profile_and_test_result() -> None:
    profile = parse_static_record(
        {
            "kind": "profile",
            "fqn": "svc.db.s.t",
            "profileData": {"timestamp": 1, "rowCount": 9},
            "profileType": "table",
        },
        default_service="demo",
    )
    assert isinstance(profile, ProfileRecord)
    assert profile.profile_data["rowCount"] == 9
    tcr = parse_static_record(
        {
            "kind": "testCaseResult",
            "testCaseFqn": "suite.case",
            "timestamp": 5,
            "testCaseStatus": "Success",
            "testResultValue": [],
        },
        default_service="demo",
    )
    assert isinstance(tcr, TestCaseResultRecord)
    assert tcr.test_case_status == "Success"
