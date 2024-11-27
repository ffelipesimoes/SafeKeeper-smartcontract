import { HardhatUserConfig } from "hardhat/types";
import "@nomiclabs/hardhat-ethers";
import "@nomicfoundation/hardhat-verify";
import "@nomicfoundation/hardhat-ignition";
import "solidity-coverage";
import "@nomicfoundation/hardhat-toolbox";
import("@nomicfoundation/hardhat-ledger");

import dotenv from "dotenv";

dotenv.config();

const PRIVATE_KEY: string = process.env.PRIVATE_KEY as string;

const config: HardhatUserConfig = {
  networks: {
    amoy: {
      url: "https://polygon-amoy.drpc.org",
      accounts: [PRIVATE_KEY],
    },
    holesky: {
      url: "https://ethereum-holesky-rpc.publicnode.com",
      accounts: [PRIVATE_KEY],
    },
    polygon: {
      url: "https://polygon.drpc.org",
      ledgerAccounts: ["hardwallet_address"],
    },
  },
  etherscan: {
    apiKey: {
      sepolia: process.env.ETHERSCAN_API!,
      holesky: process.env.ETHERSCAN_API!,
      polygonAmoy: process.env.POLYGONSCAN_API!,
      polygon: process.env.POLYGONSCAN_API!,
    },
    customChains: [
      {
        network: "holesky",
        chainId: 17000,
        urls: {
          apiURL: "https://api-holesky.etherscan.io/api",
          browserURL: "https://holesky.etherscan.io/",
        },
      },
    ],
  },
  solidity: {
    version: "0.8.20",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
};

export default config;
