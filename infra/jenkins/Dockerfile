# syntax=docker/dockerfile:1
FROM jenkins/jenkins:lts-jdk21
USER root
RUN --mount=type=secret,id=build_ca,required=false \
    --mount=type=bind,source=infra/BuildTrustStore.java,target=/tmp/BuildTrustStore.java \
    --mount=type=tmpfs,target=/tmp/build-trust \
    set -eu; if [ -s /run/secrets/build_ca ]; then \
      java /tmp/BuildTrustStore.java "$JAVA_HOME/lib/security/cacerts" /run/secrets/build_ca /tmp/build-trust/cacerts; \
      export JAVA_TOOL_OPTIONS="-Djavax.net.ssl.trustStore=/tmp/build-trust/cacerts -Djavax.net.ssl.trustStorePassword=changeit"; \
    fi; \
    jenkins-plugin-cli --plugins workflow-aggregator git credentials-binding sonar ssh-agent configuration-as-code matrix-auth timestamper junit
USER jenkins
COPY infra/jenkins/casc.yml /usr/share/jenkins/casc.yml
ENV CASC_JENKINS_CONFIG=/usr/share/jenkins/casc.yml
