const fs = require("fs");
require("colors");

fs.readFile(".build/contracts.json", (err, data) => {
  if (err) throw err;
  let contracts = JSON.parse(data);
  contracts = contracts["contracts"];
  console.log(`contract count: ${Object.keys(contracts).length}`);

  const limit = 24576;

  Object.keys(contracts).forEach(contractName => {
    const contract = contracts[contractName];
    const bin = contract["bin"];
    const digits = bin.length;
    const bytes = digits / 2;
    if (bytes <= limit) {
      console.log(`[${contractName}]:fine by ${limit - bytes} B`.green);
    } else {
      console.log(`[${contractName}]:exceed by ${bytes - limit} B`.red);
    }
  });
});
