"""Local E2E query transport; accepts fixture SQL/Cypher on stdin, never credentials.

Uses only this checkout's Compose project and database. Intended for the live
test harness, which owns and cleans its unique records. Do not run against a
production checkout. Failed commands suppress raw output containing config.
"""
import argparse
from pathlib import Path
import subprocess
import sys
from process_runtime import run_command

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("database", choices=("postgres", "neo4j"))
args = parser.parse_args()
root = Path(__file__).resolve().parents[1]
command = ["docker", "compose", "exec", "-T", args.database]
if args.database == "postgres":
    command += ["psql", "-At", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "travelplan"]
else:
    command += ["sh", "-c",
                'JAVA_OPTS="-Xms16m -Xmx96m -XX:ActiveProcessorCount=2 -Djavax.net.ssl.trustStore=/certificates/truststore.p12 -Djavax.net.ssl.trustStorePassword=changeit" '
                'cypher-shell --format plain -a bolt+s://neo4j:7687 -u neo4j -p "${NEO4J_AUTH#*/}"']
try:
    result = run_command(command, cwd=root, input=sys.stdin.buffer.read(), capture_output=True, timeout=25)
except (subprocess.TimeoutExpired, OSError) as error:
    raise SystemExit("Database test transport failed: " + type(error).__name__) from None
if result.returncode:
    raise SystemExit("Database test query failed; inspect the private local service logs")
sys.stdout.buffer.write(result.stdout)
