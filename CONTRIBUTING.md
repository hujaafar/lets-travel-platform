# Contributing

## Set up the project

Follow the [README](README.md) and [local development guide](docs/DEVELOPMENT.md). Keep generated credentials, `.env`, database backups, and provider keys outside Git. Run integration tests against a development deployment.

## Branches and commits

Start from the current `main` branch and create a branch for one coherent change:

```bash
git switch main
git pull --ff-only
git switch -c feature/journey-filters
```

Use `feature/`, `fix/`, or `docs/` branch names. Split changes into commits that can be understood and reviewed independently. Commit the implementation with the tests needed to verify its behavior; document operational or schema changes with the relevant change.

Write concise commit subjects with a clear purpose:

```text
feat: add departure-date filters to journey search
fix: preserve booking capacity during uncertain payment reconciliation
docs: document local account access and startup
test: cover manager ownership when editing itineraries
```

Do not add empty commits to inflate activity. Preserve published history and avoid force-pushing `main`.

## Author identity

Use your name and a verified email associated with your GitHub account, or its GitHub-provided noreply address:

```bash
git config user.name "Your Name"
git config user.email "your-verified-email@example.com"
```

These settings affect future commits in the checkout. GitHub links contributions through the commit email, rather than the display name alone. Changing a profile name does not require rewriting existing commits.

## Validation

| Change | Relevant checks |
| --- | --- |
| Java behavior | Maven tests and affected service checks |
| Interface behavior | Vitest, TypeScript/build, affected browser workflows |
| Infrastructure | Python tests, manifest validation, deployment and TLS checks |
| Documentation | Verify command accuracy, relative links, screenshots, and consistency with the implementation |

From the repository root:

```bash
./mvnw test
python -m unittest discover -s scripts/tests -v
```

From `dashboard/`:

```bash
npm ci
npx prettier --check src e2e scripts
npm test
npm run build
```

Run the relevant Playwright workflows with the application running. Hosted CI performs the full Jenkins/Sonar and Ansible/live-browser verification. A workflow definition alone is not a successful test result; inspect the checks for the actual PR revision.

## Pull requests

Describe the problem, resulting behavior, and relevant validation. Include interface screenshots when they help assess a visual change. Keep the scope focused and explain any deployment or data migration steps.

Both `lets-travel/jenkins` and `lets-travel/live-tests` must pass before merging. `main` requires an up-to-date branch and resolved conversations; enforcement applies to administrators. Force pushes and branch deletion are disabled.

The repository uses a solo-maintainer policy with zero required independent approvals. Record independent review only when another reviewer actually participated. Review your own diff and resolve findings before merging.

See the [CI workflow guide](docs/GITHUB-WORKFLOW.md) for runner isolation, evidence artifacts, and Sonar quality-gate interpretation.
