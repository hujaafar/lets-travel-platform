#!/bin/sh
set -eu
attempt=0
until test -s /run/secrets/application.properties && grep -q '^SERVICE_KEY=.' /run/secrets/application.properties; do
  attempt=$((attempt + 1))
  if [ "$attempt" -ge 90 ]; then echo 'Vault configuration was not available after 180 seconds' >&2; exit 1; fi
  sleep 2
done
exec java -XX:MaxRAMPercentage=55 -XX:ActiveProcessorCount=2 -Djavax.net.ssl.trustStore=/certs/truststore.p12 -Djavax.net.ssl.trustStorePassword=changeit -jar /app/app.jar
