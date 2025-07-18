#!/bin/bash
set -e

# Create multiple databases
for db in zkfair_state zkfair_pool zkfair_api; do
  echo "Creating database: $db"
  psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" <<-EOSQL
    CREATE DATABASE $db;
    GRANT ALL PRIVILEGES ON DATABASE $db TO $POSTGRES_USER;
EOSQL
done

echo "Databases created successfully!"