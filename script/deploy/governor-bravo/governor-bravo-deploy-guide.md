# Deployment Guide for GovernorBravo

## Contracts for Deployment

| Contract               | Description                              | Constructor Arguments                                                                                                                        |
| ---------------------- | ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| GovernorBravoDelegate  | Implementation of GovernorBravo contract | -                                                                                                                                            |
| GovernorBravoDelegator | Proxy/Delegator for GovernorBravo        | timelockAddress, xvsVaultAddress, admin, governorBravoDelegateAddress, votingPeriod, votingDelay, proposalThreshold, guardian, proposalCount |

---

## Deployment Steps

1. Deploy GovernorBravoDelegate

```sh
npx saddle script script/deploy/governor-bravo/01-deploy-governor-bravo-delegate.js -n testnet
```

- File location: [01-deploy-governor-bravo-delegate](./01-deploy-governor-bravo-delegate.js)

2. copy contract address of `GovernorBravoDelegate` to property in JSON [Contracts/GovernorBravoDelegate](../../../networks/testnet.json#L25)

3. Deploy GovernorBravoDelegator

```sh
npx saddle script script/deploy/governor-bravo/02-deploy-governor-bravo-delegator.js -n testnet
```

- File location: [02-deploy-governor-bravo-delegator](./02-deploy-governor-bravo-delegator.js)

4. copy contract address of `GovernorBravoDelegator` to property in JSON - [Contracts/GovernorBravoDelegator](../../../networks/testnet.json#L26)

---

## post Deployment Steps

1. set `proposalCount` to `GovernorBravoDelegate` via `init` function call

```sh
npx saddle script script/deploy/governor-bravo/03-set-proposal-count-to-governor-bravo-delegate.js -n testnet
```

1. Queue `GovernorBravoDelegator` as Admin in `Timelock`

```sh
npx saddle script script/deploy/governor-alpha-2/queue-governor-bravo-as-timelock-admin.js -n testnet
```

- File location: [queue-governor-bravo-as-timelock-admin](../governor-alpha-2/queue-governor-bravo-as-timelock-admin.js)

2. Execute `GovernorBravoDelegator` as Admin in `Timelock`

```sh
npx saddle script script/deploy/governor-alpha-2/execute-governor-bravo-as-timelock-admin.js -n testnet
```

- File location: [execute-governor-bravo-as-timelock-admin](../governor-alpha-2/execute-governor-bravo-as-timelock-admin.js)

---
