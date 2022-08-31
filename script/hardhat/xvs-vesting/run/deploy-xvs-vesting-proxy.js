const main = require('../deploy-xvs-vesting-proxy')

main().then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
