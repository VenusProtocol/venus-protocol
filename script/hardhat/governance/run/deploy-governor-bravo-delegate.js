const main = require('../deploy-governor-bravo-delegate')

main().then(() => process.exit(0))
.catch((error) => {
  console.error(error);
  process.exit(1);
});
