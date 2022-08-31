const main = require('../verify-xvs-vesting-proxy');

main().then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
