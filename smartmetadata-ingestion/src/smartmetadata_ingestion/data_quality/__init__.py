# Copyright 2026 SmartMetadata authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

"""Server-pulled data-quality execution (Wave 2 H track 3).

Pulls test definitions from the catalog (``source``), compiles each case
into a validator (``builder`` + ``validators`` + ``table_diff``) and runs
it against the source database through the existing scalar execute
callback. See ADR:2026-11-08-test-suite-server-pull and
ADR:2026-11-08-validator-compile-table-diff-params.
"""

from __future__ import annotations
