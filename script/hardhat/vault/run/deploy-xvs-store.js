const main = require('../deploy-xvs-store');

main().then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
