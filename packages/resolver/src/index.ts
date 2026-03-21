/**
 * @synthesis/resolver — Trust Resolution Layer
 *
 * ENS identity resolution, trust scoring, and verification.
 */

export {
  TrustTier,
  TrustProfileSchema,
  AgentBookNetwork,
  PersonhoodResultSchema,
  type TrustProfile,
  type PersonhoodResult,
} from "./schema.js";

export {
  resolvePersonhood,
  type ResolvePersonhoodOptions,
} from "./layers/personhood.js";
