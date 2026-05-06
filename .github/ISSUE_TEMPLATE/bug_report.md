---
name: Bug report
about: A reproducible defect in the CLI, resolver, conformance suite, or site
title: "<package>: <one-line summary>"
labels: bug
---

## What happened

<!-- One paragraph: what did you do, what did you expect, what actually happened. -->

## Reproduction

<!-- Smallest possible repro. CLI invocation, code snippet, or steps. If it involves a deployed agent, include the ENS name. -->

```
# example
ensemble agent verify <ens-name>
# expected: 5/5 layers pass
# observed: <what>
```

## Environment

- Package + version (e.g. `@synthesis/cli` from main HEAD `<sha>`):
- Node version:
- pnpm version:
- OS:
- Network (mainnet / sepolia):

## Conformance suite output

<!-- If applicable, run the conformance suite and paste the Merkle root + per-case status: -->

```
pnpm --filter @synthesis/conformance exec conformance run <ens-name> --format json
```

## Anything else

<!-- Logs, related issues, hypotheses about the cause. -->
