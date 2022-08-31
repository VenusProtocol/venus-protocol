const main = require('../vrt-vault-accept-as-impl-for-proxy');

main().then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
