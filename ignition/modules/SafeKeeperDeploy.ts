import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

const SafeKeeperModule = buildModule("SafeKeeperModule", (m) => {
  const safeKeeper = m.contract("SafeKeeper");

  return { safeKeeper };
});

export default SafeKeeperModule;
