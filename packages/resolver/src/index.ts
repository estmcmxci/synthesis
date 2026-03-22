/**
 * @synthesis/resolver — Trust Resolution Layer
 *
 * ENS identity resolution, trust scoring, and verification.
 */

export { resolve, type ResolveOptions } from "./resolve.js";

export {
  TrustTier,
  TrustProfileSchema,
  AgentBookNetwork,
  PersonhoodResultSchema,
  IdentityResultSchema,
  ContextResultSchema,
  AgentManifestSchema,
  AgentManifestSignatureSchema,
  ManifestResultSchema,
  SkillResultSchema,
  type TrustProfile,
  type PersonhoodResult,
  type IdentityResult,
  type ContextResult,
  type AgentManifest,
  type ManifestResult,
  type SkillResult,
} from "./schema.js";

export {
  resolvePersonhood,
  type ResolvePersonhoodOptions,
} from "./layers/personhood.js";

export {
  resolveIdentity,
  type ResolveIdentityOptions,
} from "./layers/identity.js";

export {
  resolveContext,
  type ResolveContextOptions,
} from "./layers/context.js";

export {
  resolveManifest,
  type ResolveManifestOptions,
} from "./layers/manifest.js";

export {
  resolveSkill,
  type ResolveSkillOptions,
} from "./layers/skill.js";

export {
  createEnsClient,
  normalizeName,
  getTextRecord,
  getTextRecords,
  resolveAddress,
  getOwner,
} from "./utils/ens.js";

export {
  extractCid,
  fetchFromIpfs,
  fetchJsonFromIpfs,
  cidToUri,
  cidToGatewayUrl,
} from "./utils/ipfs.js";

export {
  encodeErc7930Address,
  decodeErc7930Address,
  buildEnsip25Key,
  parseEnsip25Key,
  KNOWN_REGISTRIES,
} from "./utils/erc7930.js";
