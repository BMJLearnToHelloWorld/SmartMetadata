# Copyright 2026 SmartMetadata authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

"""Authentication and authorization for the plugin routes.

Airflow 3 does not authenticate requests to plugin Flask blueprints, so the
plugin authenticates them itself and fails closed: no credential source, no
matching user, or no permission for the action all refuse the request.

The server always sends Basic auth (``AIRFLOW_USERNAME`` /
``AIRFLOW_PASSWORD``). In production the credential store is the
SimpleAuthManager passwords file the startup script maintains
(``${AIRFLOW_HOME}/simple_auth_manager_passwords.json``); the file only
ever holds the admin user, who is authorized for every DAG action. The
standalone app instead takes explicit credentials or the same two env vars.
"""

from __future__ import annotations

import base64
import binascii
import hmac
import json
import os
from dataclasses import dataclass
from functools import wraps
from pathlib import Path
from typing import Callable

from flask import current_app, jsonify, request

READ = "read"
CREATE = "create"
EDIT = "edit"
DELETE = "delete"

ALL_PERMISSIONS = frozenset({READ, CREATE, EDIT, DELETE})

AUTH_REQUIRED_BODY = {"detail": "Authentication required to access this resource"}
FORBIDDEN_BODY = {"detail": "Access to this resource is not authorized"}


@dataclass(frozen=True)
class User:
    username: str
    permissions: frozenset = ALL_PERMISSIONS


class CredentialStore:
    """A source of username -> password mappings. Returns None when unknown."""

    def password_for(self, username: str) -> str | None:
        raise NotImplementedError


class ExplicitCredentials(CredentialStore):
    def __init__(self, username: str, password: str) -> None:
        self._username = username
        self._password = password

    def password_for(self, username: str) -> str | None:
        if hmac.compare_digest(username, self._username):
            return self._password
        return None


class EnvCredentials(CredentialStore):
    """``AIRFLOW_USERNAME`` / ``AIRFLOW_PASSWORD`` (the server's env names)."""

    def __init__(self, environ: dict[str, str] | None = None) -> None:
        env = os.environ if environ is None else environ
        self._username = env.get("AIRFLOW_USERNAME")
        self._password = env.get("AIRFLOW_PASSWORD")

    def password_for(self, username: str) -> str | None:
        if (
            self._username
            and self._password
            and hmac.compare_digest(username, self._username)
        ):
            return self._password
        return None


class PasswordFileStore(CredentialStore):
    """SimpleAuthManager passwords file: a JSON object of user -> password."""

    def __init__(self, path: str | Path) -> None:
        self._path = Path(path)

    def password_for(self, username: str) -> str | None:
        try:
            data = json.loads(self._path.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            return None
        if not isinstance(data, dict):
            return None
        stored = data.get(username)
        return stored if isinstance(stored, str) else None


class Authenticator:
    def __init__(self, stores: list[CredentialStore]) -> None:
        self._stores = stores

    def authenticate(self, auth_header: str | None) -> User | None:
        if not auth_header or not auth_header.startswith("Basic "):
            return None
        try:
            decoded = base64.b64decode(auth_header[6:], validate=True).decode("utf-8")
        except (binascii.Error, UnicodeDecodeError, ValueError):
            return None
        username, sep, password = decoded.partition(":")
        if not sep or not username:
            return None
        for store in self._stores:
            expected = store.password_for(username)
            if expected is not None and hmac.compare_digest(password, expected):
                return User(username=username)
        return None


def build_authenticator(
    credentials: tuple[str, str] | None,
) -> Authenticator:
    stores: list[CredentialStore] = []
    if credentials is not None:
        stores.append(ExplicitCredentials(*credentials))
    stores.append(EnvCredentials())
    passwords_file = os.environ.get("AIRFLOW__CORE__SIMPLE_AUTH_MANAGER_PASSWORDS_FILE")
    if passwords_file:
        stores.append(PasswordFileStore(passwords_file))
    else:
        home = os.environ.get("AIRFLOW_HOME", "/opt/airflow")
        default_path = Path(home) / "simple_auth_manager_passwords.json"
        if default_path.is_file():
            stores.append(PasswordFileStore(default_path))
    return Authenticator(stores)


def require_permission(action: str) -> Callable:
    """Fail-closed guard: 401 without valid Basic auth, 403 without the action."""

    def decorator(view: Callable) -> Callable:
        @wraps(view)
        def guarded(*args, **kwargs):  # type: ignore[no-untyped-def]
            authenticator: Authenticator | None = current_app.extensions.get(
                "authenticator"
            )
            user = (
                authenticator.authenticate(request.headers.get("Authorization"))
                if authenticator is not None
                else None
            )
            if user is None:
                return jsonify(AUTH_REQUIRED_BODY), 401
            if action not in user.permissions:
                return jsonify(FORBIDDEN_BODY), 403
            return view(*args, **kwargs)

        return guarded

    return decorator
