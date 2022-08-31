const main = require('../set-xvs-vesting')

main().then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
