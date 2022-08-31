const main = require('../verify-vrt-converter-proxy')

main().then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
