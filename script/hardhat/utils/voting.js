const { web3 } = require("hardhat");
const { advanceBlock, advanceTime } = require("./timeTravel");

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

function getCalldatas({ signatures, params }) {
  return params.map((args, i) => {
    const types = getArgs(signatures[i]);
    return web3.eth.abi.encodeParameters(types, args);
  });
}

async function proposeAndVote({ gov, proposal, proposer, supporter }) {
  const { targets, signatures, values, description } = proposal;

  console.log("Proposing...");
  await gov.methods.propose(targets, values, signatures, getCalldatas(proposal), description).send({ from: proposer });
  const proposalId = await gov.methods.proposalCount().call();
  console.log(`VIP-${proposalId} submitted`);

  await advanceBlock();
  await gov.methods.castVote(proposalId, true).send({ from: proposer });
  await gov.methods.castVote(proposalId, true).send({ from: supporter });
  console.log("Votes submitted");

  const blocksToWait = 86400;
  for (let i = 0; i < blocksToWait; ++i) {
    await advanceBlock();
    if (i % 1000 == 0) {
      console.log(`Waiting for the voting period to pass, ${((i / blocksToWait) * 100).toFixed(2)}% completed`);
    }
  }
  console.log("Queuing...");
  await gov.methods.queue(proposalId).send({ from: proposer });

  console.log("Executing...");
  await advanceTime(172801);
  const tx = await gov.methods.execute(proposalId).send({ from: proposer });

  console.log("Exeution logs:", tx.events);
}

module.exports = {
  proposeAndVote,
};
