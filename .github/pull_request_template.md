Describe the problem and resulting behavior.

Validation:

- [ ] `lets-travel/jenkins` passed for this revision (Java, dashboard, provisioning, configuration and Sonar candidate analysis).
- [ ] `lets-travel/live-tests` passed (container deployment, TLS, logging, Chrome/Firefox and replica recovery).
- [ ] Source changes were reviewed and any findings resolved. Record independent approval only when an independent reviewer actually participated.
- [ ] Runtime, schema and operational changes are documented.
- [ ] No credentials or private deployment data are included.

Keep source and verification limitations explicit. Do not merge with missing or failed checks. This portfolio uses a documented solo-maintainer policy: required checks apply to administrators, while the required independent approval count is zero. Course credentials do not belong in GitHub Actions.
