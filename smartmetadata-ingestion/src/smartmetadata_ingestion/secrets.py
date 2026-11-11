# Copyright 2026 SmartMetadata authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

"""Secret references (``secret:<id>``) for server connections.

Ports the official secrets-manager contract at pin ``a3012259ca``:

- The server sends a pipeline whose JWT is a ``secret:<id>`` reference
  whenever an external secrets manager is configured (the server
  re-encrypts the connection with ``store=false`` before sending it, so
  the reference — never the value — crosses the wire), and the plaintext
  token otherwise (the ``db`` manager stores secrets Fernet-encrypted in
  the server database and is not an external reference: its
  ``isSecret`` is false).
- ``dump_with_safe_jwt`` (official ``operations/deploy.py``) writes the
  stored value as-is — ``get_secret_value(skip_secret_manager=True)`` —
  so a reference stays a reference on disk and is never resolved at
  deploy time.
- The reference is resolved to the real Bearer only when a client is
  built (official ``get_secret_value()``), so rotating the secret takes
  effect on the next DAG parse without a re-deploy.

The product has no cloud secrets-manager clients (no AWS/GCP/Azure/K8s
SDKs in the tree): a reference for an unregistered provider fails
loudly instead of being used literally as a Bearer (which would 401
mysteriously at run time). The ``db`` provider resolves per the
official ``DBSecretsManager`` — the id itself is the value. Operators
and tests can register a resolver for any provider with
:func:`register_secret_resolver`.
ADR:2026-11-11-pipeline-deep-dive-python
"""

from __future__ import annotations

import copy
import json
from collections.abc import Callable
from typing import Any

SECRET_PREFIX = "secret:"

# provider name -> (secret_id, loader) -> secret value. A registry keyed
# by provider name (a small fixed set), not a cache: entries are only
# added explicitly, never per request.
_RESOLVERS: dict[str, Callable[[str, str | None], str]] = {}


class SecretsResolutionError(Exception):
    """A ``secret:<id>`` reference cannot be resolved to a value."""


def is_secret_reference(value: Any) -> bool:
    """Whether ``value`` is a ``secret:<id>`` reference (not a value)."""
    return isinstance(value, str) and value.startswith(SECRET_PREFIX)


def register_secret_resolver(
    provider: str, resolver: Callable[[str, str | None], str]
) -> None:
    """Register how ``secret:<id>`` resolves for one provider.

    ``resolver`` receives the secret id (the part after ``secret:``) and
    the configured loader, and returns the secret value. Replaces any
    previous resolver for the provider.
    """
    _RESOLVERS[provider] = resolver


def reset_secret_resolvers() -> None:
    """Drop all registered resolvers (tests)."""
    _RESOLVERS.clear()


def resolve_secret(
    value: str,
    *,
    provider: str | None = None,
    loader: str | None = None,
) -> str:
    """Resolve a ``secret:<id>`` reference to its value; other values pass through.

    The ``db`` provider (and no provider at all, the official default)
    resolves per the official ``DBSecretsManager``: the id itself is the
    value, nothing external is consulted. Any other provider needs a
    registered resolver — without one this raises instead of handing
    the literal reference to a client as a Bearer.
    """
    if not is_secret_reference(value):
        return value
    secret_id = value[len(SECRET_PREFIX):]
    if not secret_id:
        raise SecretsResolutionError("secret reference has no id")
    if not provider or provider == "db":
        return secret_id
    resolver = _RESOLVERS.get(provider)
    if resolver is None:
        raise SecretsResolutionError(
            f"no secrets client for provider {provider!r}: "
            f"cannot resolve secret {secret_id!r}"
        )
    try:
        return resolver(secret_id, loader)
    except SecretsResolutionError:
        raise
    except Exception as exc:
        raise SecretsResolutionError(
            f"could not resolve secret {secret_id!r} "
            f"from provider {provider!r}: {exc}"
        ) from exc


def safe_jwt_for_storage(
    jwt_token: str,
    *,
    provider: str | None = None,
    loader: str | None = None,
) -> str:
    """The JWT as it may be written to the deployed config file.

    A ``secret:<id>`` reference is returned unchanged — it is never
    resolved at dump time (official ``dump_with_safe_jwt`` calls
    ``get_secret_value(skip_secret_manager=True)``). Anything else is
    returned unchanged too: with no external manager configured the
    server sends the plaintext token and the file keeps it, exactly as
    official does. The server is responsible for sending the reference
    form when a manager is configured; the plugin must not invent one.
    """
    return jwt_token


def dump_with_safe_jwt(pipeline: dict[str, Any]) -> str:
    """Serialize a pipeline for the deployed config file, JWT kept safe.

    Port of official ``operations/deploy.py::dump_with_safe_jwt``: the
    JWT is written in its stored form — a ``secret:<id>`` reference when
    the server sent one, the plaintext token when no secrets manager is
    configured — and never resolved here. The input dict is not mutated.
    """
    stored = copy.deepcopy(pipeline)
    connection = stored.get("openMetadataServerConnection")
    if isinstance(connection, dict):
        security = connection.get("securityConfig")
        if isinstance(security, dict):
            jwt_token = security.get("jwtToken")
            if isinstance(jwt_token, str) and jwt_token:
                security["jwtToken"] = safe_jwt_for_storage(
                    jwt_token,
                    provider=connection.get("secretsManagerProvider"),
                    loader=connection.get("secretsManagerLoader"),
                )
    return json.dumps(stored, ensure_ascii=True)
