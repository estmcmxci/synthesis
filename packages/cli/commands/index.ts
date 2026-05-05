// Re-export all commands
export { resolve } from "./resolve";
export { profile } from "./profile";
export { available } from "./available";
export { list } from "./list";
export { register } from "./register";
export { setTxt, setAddress, setPrimary } from "./edit";
export {
	getNamehash,
	getLabelHash,
	getResolverAddress,
	getDeployments,
} from "./utils";
export { verify } from "./verify";
export { nameContract } from "./name";
export { renew } from "./renew";
export { transfer } from "./transfer";
export { registerAgent, linkAgent, agentInfo } from "./agent";
export { agentVerify } from "./agent-verify";
export { agentPin } from "./agent-pin";
export { agentPublish } from "./agent-publish";
export { agentIssue } from "./agent-issue";
export { agentRotate } from "./agent-rotate";
export { personhoodCheck, personhoodRegister } from "./personhood";
export { trust } from "./trust";
export { gate } from "./gate";
export { manifestCreate, manifestPin, manifestVerify } from "./manifest";
export { contextGet, contextSet } from "./context";
export { skillFetch } from "./skill";
export { deploy } from "./deploy";
