#!/bin/sh
set -eu
cp /certs/tls.key /tmp/postgres.key
chown postgres:postgres /tmp/postgres.key
chmod 600 /tmp/postgres.key
exec docker-entrypoint.sh postgres -c hba_file=/bootstrap/pg_hba.conf -c ssl=on -c ssl_cert_file=/certs/tls.crt -c ssl_key_file=/tmp/postgres.key -c ssl_ca_file=/certs/ca.crt
