# Create a slim folder with the minium content we want, and remove unneeded files
mkdir slim && cp -r artifacts* package.json README.md deployments slim && cd slim
find deployments -mindepth 1 -depth -not -name "*_addresses.json*" -exec rm -r "{}" +
find artifacts -mindepth 1 -depth -not -regex "artifacts/contracts.*" -exec rm -r "{}" +
find artifacts-zk -mindepth 1 -depth -not -regex "artifacts-zk/contracts.*" -exec rm -r "{}" +
find artifacts -mindepth 1 -depth -regex "artifacts/.*dbg\.json" -exec rm -r "{}" +

# Add "-slim" to the version in the npm package, keeping the tag "-dev" if it exists
jq '.version |= sub("^(?<core>[0-9]+\\.[0-9]+\\.[0-9]+)"; "\(.core)-slim")' package.json > package.tmp.json && mv package.tmp.json package.json 

# Remove the "prepare" and "postinstall" scripts, they won't work for this slim version
jq 'del(.scripts.prepare)' package.json > package.tmp.json && mv package.tmp.json package.json
jq 'del(.scripts.postinstall)' package.json > package.tmp.json && mv package.tmp.json package.json

# Empty devDependencies and dependencies
jq '.dependencies = {}' package.json > package.tmp.json && mv package.tmp.json package.json
jq '.devDependencies = {}' package.json > package.tmp.json && mv package.tmp.json package.json
