const main = require('../deploy-xvs-vault');

main().then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
