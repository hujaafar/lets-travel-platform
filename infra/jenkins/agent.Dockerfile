FROM maven:3.9.11-eclipse-temurin-21 AS maven
FROM node:22-bookworm-slim AS node
FROM docker:29-cli AS docker
FROM jenkins/inbound-agent:jdk21
USER root
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 python3-venv curl openssh-client ca-certificates \
    && rm -rf /var/lib/apt/lists/*
COPY --from=maven /usr/share/maven /usr/share/maven
COPY --from=node /usr/local/bin/node /usr/local/bin/node
COPY --from=node /usr/local/lib/node_modules /usr/local/lib/node_modules
COPY --from=docker /usr/local/bin/docker /usr/local/bin/docker
COPY --from=docker /usr/local/libexec/docker/cli-plugins /usr/local/libexec/docker/cli-plugins
RUN ln -s /usr/share/maven/bin/mvn /usr/local/bin/mvn \
    && ln -s /usr/local/lib/node_modules/npm/bin/npm-cli.js /usr/local/bin/npm \
    && ln -s /usr/local/lib/node_modules/npm/bin/npx-cli.js /usr/local/bin/npx \
    && python3 -m venv /opt/ci \
    && /opt/ci/bin/pip install --no-cache-dir ansible-core==2.19.0 cryptography==46.0.3
ENV PATH="/opt/ci/bin:${PATH}"
ENV MAVEN_OPTS="-Xmx384m -XX:ActiveProcessorCount=2"
COPY infra/ansible/requirements.yml /tmp/requirements.yml
ENV ANSIBLE_COLLECTIONS_PATH=/opt/ansible/collections
RUN ansible-galaxy collection install -r /tmp/requirements.yml -p /opt/ansible/collections
# Browser OS dependencies are prepared in the image, so jobs stay unprivileged.
COPY dashboard/package.json dashboard/package-lock.json /tmp/browser-deps/
RUN cd /tmp/browser-deps && npm ci --ignore-scripts \
    && npx playwright install-deps chromium firefox \
    && rm -rf /tmp/browser-deps /var/lib/apt/lists/*
USER jenkins
