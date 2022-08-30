const main = require('../verify-governor-bravo-delegate');

main().then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
