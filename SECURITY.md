# Security Policy

## Reporting a Vulnerability

This project handles ENS records, IPFS-pinned policy documents, smart-account session keys, and signed manifests. A vulnerability in any of those layers can affect a deployed agent's authority on chain. Responsible disclosure is appreciated.

**Please do NOT open a public issue for security reports.**

Instead, email **m@oakgroup.co** with:

- A description of the vulnerability
- Steps to reproduce (a minimal proof-of-concept where practical)
- The affected component (`@synthesis/cli`, `@synthesis/resolver`, `@synthesis/conformance`, `@synthesis/site`, or the live deployment)
- Your suggested fix or mitigation, if any

You can expect an initial response within 7 days. Confirmed vulnerabilities will be addressed and disclosed publicly after a fix is shipped.

## Scope

The following are in scope for security reports:

- **Resolver** (`@synthesis/resolver`): record validation, schema validation, JCS canonicalization, hash verification, the SSRF guard, signature recovery
- **CLI** (`@synthesis/cli`): wallet keystore handling, session-key issuance, on-chain record writes, IPFS pinning
- **Conformance suite** (`@synthesis/conformance`): the verifier audit fixtures and Merkle-root construction
- **Site** (`@synthesis/site`): the explorer route, the chat-proxy API route, server-side rendering of unverified user-supplied ENS names

The following are out of scope:

- Bugs in upstream protocols (ENSIP drafts, ERC-8004, World ID, AIP) — file with the relevant standards body
- Vulnerabilities in third-party dependencies whose fix is not yet available — file with the dependency
- Anything that requires already-compromised owner / kernel / session keys to exploit
- The `agency/` runtime daemon (separate repository, not part of this codebase)

## Threat Model Notes

- The resolver runs SSRF-guarded fetches against record-controlled URLs. Reports of bypasses are high priority.
- The chat surface deliberately has no access to the agent's signing key — confirmed reports of escalation paths are high priority.
- Conformance reports include a Merkle root over case results. Canonicalization-bypass reports that produce different roots for the same logical input set are high priority.

## Acknowledgements

Researchers who responsibly disclose are credited (with permission) in the relevant fix's commit message and changelog.
