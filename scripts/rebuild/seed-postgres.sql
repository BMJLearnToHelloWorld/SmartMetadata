-- Seed for the product build-test job (py-run-build-tests).
-- Creates the source data the postgres example ingests
-- (smartmetadata-ingestion/examples/postgres-metadata.yaml).
-- Must stay in sync with scripts/rebuild/validate_product_ingest.py
-- (EXPECTED_TABLES) and the job's PG_* environment.
-- Runs once via the postgres container's /docker-entrypoint-initdb.d.
CREATE TABLE IF NOT EXISTS public.customers (
    id INTEGER PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(200)
);
CREATE TABLE IF NOT EXISTS public.orders (
    id INTEGER PRIMARY KEY,
    customer_id INTEGER NOT NULL REFERENCES public.customers (id),
    total NUMERIC(10, 2) NOT NULL
);
INSERT INTO public.customers (id, name, email) VALUES
    (1, 'Ada Lovelace', 'ada@example.com'),
    (2, 'Alan Turing', 'alan@example.com')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.orders (id, customer_id, total) VALUES
    (101, 1, 99.50),
    (102, 2, 149.00)
ON CONFLICT (id) DO NOTHING;
CREATE OR REPLACE VIEW public.customer_orders AS
SELECT customer_id, SUM(total) AS total FROM public.orders GROUP BY customer_id;
