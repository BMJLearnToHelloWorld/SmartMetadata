# Copyright 2026 SmartMetadata authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

"""P-39: secret references are never resolved at dump time, only at use."""

from __future__ import annotations

import json

import pytest

from smartmetadata_ingestion.secrets import (
    SecretsResolutionError,
    dump_with_safe_jwt,
    is_secret_reference,
    register_secret_resolver,
    reset_secret_resolvers,
    resolve_secret,
)


@pytest.fixture(autouse=True)
def _clean_registry():
    reset_secret_resolvers()
    yield
    reset_secret_resolvers()


def _pipeline(jwt: str, *, provider: str | None = None) -> dict:
    connection: dict = {
        "hostPort": "http://openmetadata-server:8585/api",
        "securityConfig": {"jwtToken": jwt},
    }
    if provider is not None:
        connection["secretsManagerProvider"] = provider
    return {"name": "demo", "openMetadataServerConnection": connection}


def test_is_secret_reference() -> None:
    assert is_secret_reference("secret:/super/secret") is True
    assert is_secret_reference("secret:") is True
    assert is_secret_reference("plain-token") is False
    assert is_secret_reference(None) is False


def test_dump_with_safe_jwt_keeps_reference_and_never_resolves() -> None:
    register_secret_resolver("aws", lambda secret_id, loader: "resolved-value")
    dumped = dump_with_safe_jwt(_pipeline("secret:/super/secret", provider="aws"))
    parsed = json.loads(dumped)
    jwt = parsed["openMetadataServerConnection"]["securityConfig"]["jwtToken"]
    assert jwt == "secret:/super/secret"
    assert "resolved-value" not in dumped


def test_dump_with_safe_jwt_keeps_plaintext_when_unconfigured() -> None:
    dumped = dump_with_safe_jwt(_pipeline("plain-token"))
    parsed = json.loads(dumped)
    assert parsed["openMetadataServerConnection"]["securityConfig"]["jwtToken"] == "plain-token"


def test_dump_with_safe_jwt_does_not_mutate_input() -> None:
    pipeline = _pipeline("secret:/super/secret", provider="aws")
    dump_with_safe_jwt(pipeline)
    jwt = pipeline["openMetadataServerConnection"]["securityConfig"]["jwtToken"]
    assert jwt == "secret:/super/secret"


def test_resolve_secret_db_provider_returns_id() -> None:
    # Official DBSecretsManager semantics: the id itself is the value.
    assert resolve_secret("secret:/super/secret", provider="db") == "/super/secret"
    assert resolve_secret("secret:/super/secret") == "/super/secret"


def test_resolve_secret_plaintext_passes_through() -> None:
    assert resolve_secret("plain-token", provider="aws") == "plain-token"


def test_resolve_secret_unregistered_provider_raises() -> None:
    # Never hand the literal reference to a client as a Bearer.
    with pytest.raises(SecretsResolutionError, match="no secrets client"):
        resolve_secret("secret:/super/secret", provider="aws")


def test_resolve_secret_registered_resolver_resolves() -> None:
    register_secret_resolver("aws", lambda secret_id, loader: f"resolved-{secret_id}")
    assert (
        resolve_secret("secret:/super/secret", provider="aws", loader="my-loader")
        == "resolved-/super/secret"
    )


def test_resolve_secret_empty_id_raises() -> None:
    with pytest.raises(SecretsResolutionError, match="no id"):
        resolve_secret("secret:", provider="aws")
