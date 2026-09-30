"""Collect only this Compose project's logs and forward JSON lines to Loki.
Docker socket access is privileged even with a read-only bind mount. Run this
collector only on a trusted deployment host, never inside an untrusted PR build.
"""

import os, time, json, threading
import docker, requests

client = docker.from_env()
active = set()


def follow(container):
    service = container.labels.get("com.docker.compose.service", "unknown")
    try:
        for line in container.logs(stream=True, follow=True, tail=0, timestamps=True):
            text = line.decode(errors="replace").strip()
            if not text:
                continue
            body = {
                "streams": [
                    {
                        "stream": {
                            "project": os.environ["COMPOSE_PROJECT"],
                            "service": service,
                            "container": container.name,
                        },
                        "values": [[str(time.time_ns()), text]],
                    }
                ]
            }
            for attempt in range(3):
                try:
                    requests.post(
                        "https://loki:3100/loki/api/v1/push",
                        json=body,
                        timeout=5,
                        verify="/certs/ca.crt",
                    ).raise_for_status()
                    break
                except requests.RequestException:
                    time.sleep(attempt + 1)
    except docker.errors.DockerException as error:
        print(type(error).__name__, flush=True)
    finally:
        active.discard(container.id)


while True:
    try:
        for container in client.containers.list(
            filters={
                "label": "com.docker.compose.project=" + os.environ["COMPOSE_PROJECT"]
            }
        ):
            if container.id not in active and container.labels.get(
                "com.docker.compose.service"
            ) not in {"loki", "log-collector", "grafana"}:
                active.add(container.id)
                threading.Thread(target=follow, args=(container,), daemon=True).start()
    except docker.errors.DockerException as error:
        print(type(error).__name__, flush=True)
    time.sleep(5)
