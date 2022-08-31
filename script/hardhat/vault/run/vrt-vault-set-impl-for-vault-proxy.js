const main = require('../vrt-vault-set-impl-for-vault-proxy');

main().then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
