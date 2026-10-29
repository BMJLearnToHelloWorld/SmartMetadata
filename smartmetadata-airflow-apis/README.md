# smartmetadata-airflow-apis

Clean-room Airflow plugin HTTP surface that preserves the **Java `AirflowRESTClient`**
path and payload contract (`deploy`, `trigger`, `delete`, `enable`, `disable`,
`status`, `kill`, `health` / `health-auth`, `last_dag_logs`, `ip`, `run_automation`).

This package does **not** import or copy `openmetadata-airflow-apis` (CCL-tainted
headers). Production Airflow DAG file IO remains Partial until a later slice.
