# Copyright 2026 SmartMetadata authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

"""Unity Catalog profiler/sampler — re-export dedicated types."""

from smartmetadata_ingestion.connectors.databricks_profiler import (
    UnityCatalogProfilerInterface,
    UnityCatalogSamplerInterface,
)

__all__ = ["UnityCatalogProfilerInterface", "UnityCatalogSamplerInterface"]
