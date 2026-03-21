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
export { personhoodCheck, personhoodRegister } from "./personhood";
export { trust } from "./trust";
export { manifestCreate, manifestPin, manifestVerify } from "./manifest";
export { contextGet, contextSet } from "./context";
