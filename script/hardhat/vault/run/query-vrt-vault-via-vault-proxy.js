const main = require('../query-vrt-vault-via-vault-proxy');

main().then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
