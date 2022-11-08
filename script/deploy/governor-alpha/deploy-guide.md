# GovernorAlpha Deployment Guide

1. GovernorAlpha2

- deploy GovernorAlpha2 Contract to bsc-testnet

```sh
npx saddle script script/deploy/governor-alpha/deploy-governor-alpha-2.js -n testnet
```

Copy GovernorAlpha2 address from command console to JSON object in testnet.json

2. set GovernorAlpha2 as admin to Timelock

```sh
npx saddle script script/deploy/governor-alpha/set-goveror-alpha-2-as-admin.js -n testnet
```
