const provider = {
  send(method, params) {
    return new Promise((okay, fail) => web3.currentProvider.send({
      method,
      params,
    }, (err, res) => err ? fail(err) : okay(res.result)));
  }
};

function createFixtureLoader() {
  const snapshots = [];

  return async function load(fixture, params) {
    const snapshot = snapshots.find((snapshot) => snapshot.fixture === fixture);
    if (snapshot) {
      const revertResult = await snapshot.provider.send('evm_revert', [snapshot.id]);
      // console.log('=== snapshot.id', snapshot.id, ',process:', process.pid)
      snapshot.id = await snapshot.provider.send('evm_snapshot', []);
      return snapshot.data;
    } else {
      const data = await fixture(params);
      const id = await provider.send('evm_snapshot', []);
      snapshots.push({
        fixture,
        data,
        id,
        provider,
      });
      // console.log('=== snapshot pushed', id, ',process:', process.pid)
      return data;
    }
  };
}

function beforeEachFixture(fixture, params) {
  let fixtureLoader;
  beforeAll(async () => {
    fixtureLoader = createFixtureLoader();
  });
  beforeEach(async () => {
    await fixtureLoader(fixture, params);
  })
}

module.exports = {
  createFixtureLoader,
  beforeEachFixture,
};