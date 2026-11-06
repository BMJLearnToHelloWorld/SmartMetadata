# Copyright 2026 SmartMetadata authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

"""DAG generation: turn a stored IngestionPipeline JSON into an Airflow DAG.

The generated DAG file only names the stored config; this package does the
work at parse time (build the DAG) and at run time (execute the workflow
through the product runner).
"""
