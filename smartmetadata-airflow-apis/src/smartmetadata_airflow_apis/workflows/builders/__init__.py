# Copyright 2026 SmartMetadata authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

"""DAG builders, one per pipeline type. Importing this package registers them."""

from smartmetadata_airflow_apis.workflows.builders import metadata as _metadata  # noqa: F401
