/**
 * RFC 8785 JSON Canonicalization Scheme (JCS) — minimal implementation.
 *
 * Two callers in the policy-verification path depend on byte-exact output:
 *   keccak256(canonicalizeBytes(policyDoc)) === policy-hash on ENS
 *
 * This implementation handles the JSON subset our policy + schema docs use:
 *   strings, numbers (integers + finite floats), booleans, null, arrays, objects.
 *
 * Behavior:
 *   - Object keys sorted by UTF-16 code-unit order (the JS default for
 *     `Array.prototype.sort` over strings) — matches RFC 8785 §3.2.3.
 *   - No whitespace; identical to `JSON.stringify(value)` over a key-sorted tree.
 *   - Throws on NaN, Infinity, -0 (the spec rejects them; our docs never
 *     contain them, so this is defensive).
 *
 * NOT handled: bigint, custom toJSON, Date objects, undefined values
 *   (callers should JSON.parse from text first; round-trip strips these).
 */

type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

function sortedClone(value: JsonValue): JsonValue {
  if (value === null) return null;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new Error(`JCS: non-finite number not representable: ${value}`);
    }
    if (Object.is(value, -0)) {
      throw new Error("JCS: -0 not representable");
    }
    return value;
  }
  if (typeof value === "string" || typeof value === "boolean") return value;
  if (Array.isArray(value)) return value.map(sortedClone);
  if (typeof value === "object") {
    const out: { [key: string]: JsonValue } = {};
    const keys = Object.keys(value).sort();
    for (const k of keys) out[k] = sortedClone(value[k]);
    return out;
  }
  throw new Error(`JCS: unsupported value type: ${typeof value}`);
}

/**
 * Canonicalize a JSON-compatible value to its RFC 8785 string form.
 */
export function canonicalize(value: JsonValue): string {
  return JSON.stringify(sortedClone(value));
}

/**
 * Canonicalize a JSON-compatible value to its RFC 8785 UTF-8 bytes.
 * This is the input to `keccak256` for `policy-hash` verification.
 */
export function canonicalizeBytes(value: JsonValue): Uint8Array {
  return new TextEncoder().encode(canonicalize(value));
}
