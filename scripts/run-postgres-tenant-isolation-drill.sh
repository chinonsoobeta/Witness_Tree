#!/bin/zsh
set -euo pipefail

# Starts a throwaway Postgres container, runs the direct tenant-isolation
# harness against it, and removes the container. It touches no data root, no
# AWS resource, and no real personal data: the two seeded accounts are
# fictional and the container is deleted on exit.
#
# Usage: scripts/run-postgres-tenant-isolation-drill.sh [--keep]
#   --keep leaves the container running so a failure can be inspected.

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CONTAINER="${WITNESS_TREE_PG_CONTAINER:-witness-tree-rls-drill}"
IMAGE="${WITNESS_TREE_PG_IMAGE:-postgres:17-alpine}"
DATABASE="witness_tree_rls"
PASSWORD="$(head -c 24 /dev/urandom | od -An -tx1 | tr -d ' \n')"
KEEP=0
[[ "${1:-}" == "--keep" ]] && KEEP=1

fail() { print -u2 -- "Stopped: $1"; exit "${2:-1}"; }
cleanup() { (( KEEP )) || docker rm -f "$CONTAINER" >/dev/null 2>&1 || true; unset PASSWORD; }
trap cleanup EXIT

command -v docker >/dev/null || fail "docker is required; the harness was NOT EXECUTED" 75
docker info >/dev/null 2>&1 || fail "no docker daemon is reachable; the harness was NOT EXECUTED" 75

docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
docker run -d --name "$CONTAINER" -e POSTGRES_PASSWORD="$PASSWORD" -e POSTGRES_DB="$DATABASE" "$IMAGE" >/dev/null \
  || fail "could not start $IMAGE; the harness was NOT EXECUTED" 75

for _ in {1..60}; do
  docker exec "$CONTAINER" pg_isready -q -U postgres -d "$DATABASE" && break
  sleep 1
done
docker exec "$CONTAINER" pg_isready -q -U postgres -d "$DATABASE" || fail "Postgres did not become ready; the harness was NOT EXECUTED" 75

WITNESS_TREE_PG_CONTAINER="$CONTAINER" \
WITNESS_TREE_PG_DATABASE="$DATABASE" \
WITNESS_TREE_PG_ADMIN_PASSWORD="$PASSWORD" \
  node "$ROOT/scripts/check-postgres-tenant-isolation.mjs"
