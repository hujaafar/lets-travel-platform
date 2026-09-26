#!/bin/sh
set -eu
chown vault:vault /runtime
exec docker-entrypoint.sh "$@"
