
(async () => {
  let deployedVenusLens = await saddle.deploy('VenusLens');
  console.log(`Deployed Venuslens to ${deployedVenusLens._address}`);
})();
