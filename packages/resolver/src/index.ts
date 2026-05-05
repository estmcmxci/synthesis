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
  verifyAgentIdentity,
  AGENT_RECORD_KEYS,
  AgentVerifyErrorCode,
  type AgentVerifyOptions,
  type AgentVerifyResult,
  type IdentityCard,
  type LayerResultRecords,
  type LayerResultSchema,
  type LayerResultIntegrity,
  type LayerResultBinding,
  type LayerResultLiveness,
  type LayerResultSignature,
  type AgentRecordKey,
} from "./layers/agent-verify.js";

export { canonicalize, canonicalizeBytes } from "./utils/jcs.js";

export {
  pinDirectory,
  verifyPinResolves,
  type PinDirectoryFile,
  type PinDirectoryOptions,
  type PinDirectoryResult,
  type VerifyPinOptions,
} from "./utils/pinata.js";

export {
  publishAgentRecords,
  validateAgentRecords,
  buildRecordList,
  encodeSetTextCalls,
  encodeMulticall,
  diffAgainstChain,
  type AgentPublishRecords,
  type PublishOptions,
  type PublishPlan,
  type RecordDiff,
  type ValidationIssue,
} from "./utils/agent-publish.js";

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
  fetchIpfsRaw,
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

export {
  gate,
  TrustPolicySchema,
  GateDecisionSchema,
  type TrustPolicy,
  type GateDecision,
} from "./policy.js";

export {
  createLocalSigner,
  createNameraSigner,
  type Batch,
  type Signer,
  type CreateLocalSignerOptions,
  type CreateNameraSignerOptions,
} from "./wallets/index.js";

export {
  createKeystore,
  decryptKeystore,
  type KeystoreJson,
  type DecryptedKey,
} from "./wallets/keystore.js";

export {
  issueKeystore,
  issueSmartAccount,
  issueSessionKey,
  readSessionKeyForRuntime,
  type IssueKeystoreOptions,
  type IssueKeystoreResult,
  type IssueSmartAccountOptions,
  type IssueSmartAccountResult,
  type IssueSessionKeyOptions,
  type IssueSessionKeyResult,
  type SmartAccountFile,
  type SessionKeyFile,
} from "./wallets/namera-issue.js";
