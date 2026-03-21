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
  IdentityResultSchema,
  type TrustProfile,
  type PersonhoodResult,
  type IdentityResult,
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
  chainIdToUleb128,
  uleb128ToChainId,
  KNOWN_REGISTRIES,
} from "./utils/erc7930.js";
