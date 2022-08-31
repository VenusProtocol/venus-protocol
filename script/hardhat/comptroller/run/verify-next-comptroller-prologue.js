const main = require('../verify-next-comptroller-prologue')

main().then(() => process.exit(0))
.catch((error) => {
  console.error(error);
  process.exit(1);
});