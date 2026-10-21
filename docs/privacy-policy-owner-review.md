# Privacy policy owner review

This is an internal checklist, not part of the public `/privacy` page. Update the policy if any item changes or if a verified answer affects what visitors should be told.

## Confirm before publication

- If Cloudflare Email Routing configuration changes, confirm the destination and Gmail handling and update the public policy if needed.
- Cloudflare's retention period for technical Email Routing records is still unverified. Do not publish a specific period unless Cloudflare confirms it. The public policy discloses this uncertainty; Gmail message storage is described separately.
- Have counsel or the owner confirm any jurisdiction-specific disclosures or additional procedure required for data access, correction, or deletion requests before adding legal promises.
- Verify which Docmark hostnames and routes receive Cloudflare Web Analytics automatic injection in production. The zone API review confirms that Web Analytics is enabled with automatic installation; Cloudflare's documentation describes general behavior.

## Configuration recorded from the Cloudflare API review

- Zone: `jorgegallardo.cl`.
- Cloudflare Web Analytics / RUM: enabled with automatic installation.
- Browser Integrity Check: enabled.
- Security Level: Medium.
- Bot Fight Mode: disabled.
- Zaraz: no third-party tools configured.
- Email Routing: enabled for `docmark.jorgegallardo.cl`.
- Cloudflare security or verification mechanisms may use technical cookies depending on the request and check applied.

The public policy links to Cloudflare's current documentation rather than promising that its practices will remain unchanged.
