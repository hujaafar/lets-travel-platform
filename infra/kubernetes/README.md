# Kubernetes and multi-node HA readiness

`base/` is a secret-free Kustomize deployment for the stateless application tier. It runs three replicas of the dashboard and each Java service, spreads them across zones and hosts, uses disruption budgets and autoscaling, denies network traffic by default, and runs containers without privilege escalation or service-account tokens.

Render and validate the base without a cluster:

```bash
kubectl kustomize infra/kubernetes/base > work/travel-plan-kubernetes.yaml
python scripts/verify-kubernetes.py
```

The base expects six pre-created Secrets: `dashboard-tls`, `identity-tls`, `travel-tls`, `payments-tls`, and the three matching `*-runtime` secrets. Runtime secrets must contain `application.properties` and `TLS_PASSWORD`. Never commit those values. Production certificates should be issued by cert-manager or an organization PKI.

`production/` contains reviewed operator inputs for stateful HA:

- CloudNativePG: three PostgreSQL instances with synchronous failover-ready topology, TLS policy, WAL storage and object-store backup configuration.
- Vault: three integrated-Raft replicas spread across zones, TLS-only listeners and persistent storage.
- External Secrets Operator: Kubernetes authentication to Vault and controlled secret synchronization.
- Neo4j: a three-member Enterprise cluster template. It deliberately refuses license acceptance until an operator supplies a valid license and changes `acceptLicenseAgreement` after review.

Replace every `REPLACE_ME`, set real storage classes, issue certificates, pin application images by digest and configure provider-specific load balancers before deployment. A multi-node cluster with at least three failure domains is required. Running these manifests on Docker Desktop or a one-host `kind` cluster validates orchestration only; it does not prove physical high availability.

Use the failure plan in `docs/PRODUCTION-HA.md` to certify a real environment. The plan requires controlled node, zone, database-primary, Vault-leader and Neo4j-member failures plus recovery-time evidence.
