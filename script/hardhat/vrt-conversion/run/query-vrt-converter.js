const main = require('../query-vrt-converter')

main().then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
