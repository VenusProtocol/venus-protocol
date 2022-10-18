# Deployment Guide for XVSVault

## Contracts for Deployment

| Contract      | Description                                      | Constructor Arguments |
| ------------- | ------------------------------------------------ | --------------------- |
| XVSVault      | XVSVault is the VaultImplementation of XVS token | -                     |
| XVSVaultProxy | XVSVaultProxy is the Proxy for XVS-Vault         | -                     |

---

## Deployment Steps

1. Deploy XVSVault

```sh
npx saddle script script/deploy/xvs-vault/01-deploy-xvs-vault.js -n testnet
```

2. copy contract address of `XVSVault` to property in JSON [Contracts/XVSVault](../../../networks/testnet.json#L27)

3. Deploy XVSVaultProxy

```sh
npx saddle script script/deploy/xvs-vault/02-deploy-xvs-vault-proxy.js -n testnet
```

4. copy contract address of `XVSVaultProxy` to property in JSON - [Contracts/XVSVaultProxy](../../../networks/testnet.json#L28)

---

## post Deployment Steps

1. Set `XVSVault` as Pending-Implementation in `XVSVaultProxy`

```sh
npx saddle script script/deploy/xvs-vault/03-set-impl-for-xvs-vault-proxy.js -n testnet
```

2. `XVSVault` to accept as implementor (implementation) for `XVSVaultProxy`

```sh
npx saddle script script/deploy/xvs-vault/04-become-impl-for-xvs-vault-proxy.js -n testnet
```

3. Query Implementation of `XVSVaultProxy`

```sh
npx saddle script script/deploy/xvs-vault/05-query-impl-for-xvs-vault-proxy.js -n testnet
```

---
