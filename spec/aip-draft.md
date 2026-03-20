## **Abstract**

This ENSIP standardizes a minimal, verifiable **agent identity \+ version lineage** for ENS names using **exactly three records** and a **signed, content-addressed manifest**. The goal is interoperability and safety with the fewest rules possible: clients can deterministically discover the latest version, fetch the canonical descriptor for that version, and reconstruct lineage via a `prev` pointer. 

## **Motivation**

Agents change over time. Without a deterministic, verifiable mechanism for **what version you’re interacting with**, consumers can be silently upgraded to different behavior while still trusting the same identity. A minimal ENS-anchored profile with explicit latest pointer \+ immutable manifests gives clients: (1) stable identity, (2) explicit upgrade visibility, and (3) pinning/lineage for safety—without prescribing runtimes or marketplaces.

## **Specification**

The key words “MUST”, “SHOULD”, etc. follow RFC 2119\. Record keys MUST follow ENSIP-5 style (lowercase, numbers, hyphen).

### **1\) Normative Global Records (Minimal Set: exactly 3\)**

| Key | Type | Req | Example | Semantics |
| ----- | ----- | ----- | ----- | ----- |
| `agent-manifest` | CID/URL | ✔ | `ipfs://bafy...` | **On a version node:** pointer to the immutable, signed manifest bytes for that version. MUST be content-addressed or otherwise immutable. |
| `agent-latest` | string | ✔ | `v2` | **On the root name:** declares the current latest version identifier. |
| `agent-version-lineage` | enum or list | ✔ | `subname` or `list:\n...` | **On the root name:** defines how to map version identifiers → manifests (subname-per-version is RECOMMENDED). |

#### **1.1 Storage conventions (normative semantics; flexible storage)**

* These keys SHOULD be implemented as **ENS Text Records** for simplicity.  
* Implementations MAY store them in another ENS-supported record type, but **semantics MUST match** this ENSIP.

#### **1.2 Lineage modes**

**Mode A — Subname-per-version (RECOMMENDED)**

* `agent-version-lineage = subname`  
* A version identifier `vN` maps to the ENS name `vN.<root>`.  
* Each version subname MUST publish `agent-manifest`.

**Mode B — Append-only list (ALLOWED)**

* `agent-version-lineage` value begins with `list:` followed by newline-separated entries.  
* Entry format (minimal):  
  * `<version> <manifestRef> <issuedAt> <prevRef-or-dash>`  
* Requirements:  
  * The list MUST be append-only (clients MAY require prior state to enforce strict append-only).  
  * `manifestRef` MUST be immutable (content-addressed recommended).

### **2\) Signed Agent Manifest**

The manifest is the immutable document pointed to by `agent-manifest`. It MUST be signed by the **controller key** for the root ENS name.

#### **2.1 Required fields (minimum)**

* `schema` (string) — e.g. `"ens.agent/1"`  
* `ensName` (string) — the root ENS name  
* `version` (string) — MUST equal the resolved version identifier (e.g., `v2`)  
* `prev` (string|null) — pointer/digest of previous manifest; `null` for genesis  
* `payload` (object) — free-form; MAY include endpoints/capabilities/policy  
* `signature` (object) — signature over canonical manifest bytes  
  * `scheme` (string)  
  * `value` (string)

#### **2.2 Canonical bytes \+ digest**

* **ASSUMPTION:** canonicalization is JSON canonical bytes (UTF-8, sorted keys, no insignificant whitespace).  
  * How to verify: publish test vectors; require at least 2 independent implementations to match digests.  
* Manifests SHOULD include `manifestHash` (digest of canonical bytes) to aid integrity checks.

#### **2.3 Signature verification**

* **ASSUMPTION (controller identity):** the signer MUST be the current ENS **owner** of `ensName` at verification time.  
  * How to verify: decide whether delegation is needed; if yes, revise in v2.

* Clients MUST:  
  * verify `ensName` matches the root name being resolved  
  * verify `version` matches the version identifier being used  
  * verify signature is valid under the controller identity assumption

* Default-deny:  
  * If unreachable, unsigned, or unverifiable, clients MUST treat as **UNVERIFIED** and MUST NOT present as authenticated.

### **3\) Client Behavior (Deterministic)**

Given root ENS name `A`:

1. Read `agent-latest` and `agent-version-lineage` from `A`.  
2. Let `V = agent-latest`.  
3. Resolve `manifestRef`:  
   * If lineage \= `subname`: read `agent-manifest` from `V.A` (e.g., `v2.alpha.eth`).  
   * If lineage \= `list:`: parse the list and find entry for `V`; take its `manifestRef`.

4. Fetch manifest bytes from `manifestRef`.  
5. Verify manifest:  
   * `ensName == A`  
   * `version == V`  
   * signature valid under controller assumption  
6. Pinning:  
   * Clients SHOULD allow pinning by `version` or `manifestRef`.  
   * Clients MUST NOT auto-upgrade pinned consumers when `agent-latest` changes.  
7. Optional lineage audit:  
   * Clients MAY traverse `prev` pointers to reconstruct history.  
   * If traversal breaks, clients MUST label lineage as incomplete (do not silently fabricate continuity).

## **Rationale**

* **Smallest viable surface:** three keys cover latest selection \+ manifest retrieval \+ lineage mapping with no additional governance machinery.  
* **Verifiable upgrades:** immutable manifests \+ `prev` create auditability and consumer pinning.  
* **Format neutrality:** `payload` can evolve without breaking core verification rules.  
* **Defer complexity:** revocation, delegated keys, and enforcement economics are intentionally postponed.

## **Example blob**

`{`  
  `"schema": "ens.agent/1",`  
  `"ensName": "alpha.eth",`  
  `"version": "v2",`  
  `"prev": "ipfs://bafy...CID_V1",`  
  `"payload": {`  
    `"endpoints": ["https://api.alpha.xyz"],`  
    `"capabilities": ["crosschain-resolution", "paid-resolution"],`  
    `"policy": { "chains": ["eip155:1", "eip155:8453"], "maxPerTxUSD": 500 }`  
  `},`  
  `"manifestHash": "sha256:...",`  
  `"signature": {`  
    `"scheme": "evm-owner-signature",`  
    `"value": "0x..."`  
  `}`  
`}`  
