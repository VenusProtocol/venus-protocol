const main = require('../deploy-vrt-vault');

main().then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
