const { defaultAbiCoder } = require("@ethersproject/abi");
const { network } = require("hardhat");

export async function setForkBlock(blockNumber) {
  await network.provider.request({
    method: "hardhat_reset",
    params: [
      {
        forking: {
          jsonRpcUrl: process.env.BSC_ARCHIVE_NODE,
          blockNumber: blockNumber,
        },
      },
    ],
  });
}

export function getCalldatas({ signatures, params }) {
  return params.map((args, i) => {
    const types = getArgs(signatures[i]);
    return defaultAbiCoder.encode(types, args);
  });
}

const getArgs = func => {
  if (func === "") return [];
  // First match everything inside the function argument parens.
  const args = func.toString().match(/.*?\(([^)]*)\)/) ? func.toString().match(/.*?\(([^)]*)\)/)[1] : "";
  // Split the arguments string into an array comma delimited.
  return args
    .split(",")
    .map(arg => {
      // Ensure no inline comments are parsed and trim the whitespace.
      return arg.replace(/\/\*.*\*\//, "").trim();
    })
    .filter(arg => {
      // Ensure no undefined values are added.
      return arg;
    });
};
