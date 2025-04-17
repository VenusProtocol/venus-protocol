# Venus Protocol

[![GitHub Actions](https://github.com/VenusProtocol/venus-protocol/actions/workflows/cd.yml/badge.svg)](https://github.com/VenusProtocol/venus-protocol/actions/workflows/cd.yml)
[![GitHub Actions](https://github.com/VenusProtocol/venus-protocol/actions/workflows/ci.yml/badge.svg)](https://github.com/VenusProtocol/venus-protocol/actions/workflows/ci.yml)

The Venus Protocol is a collection of smart contracts on BNB Chain for supplying or borrowing assets. Through VToken contracts, blockchain accounts can *supply* capital (BNB or BEP-20 tokens) to receive vTokens or *borrow* assets from the protocol using other assets as collateral. The protocol also enables the minting of VAI, the first synthetic stablecoin on Venus, which aims to maintain a 1 USD peg. VAI is minted using the same collateral supplied to the protocol. Venus vToken contracts track balances and algorithmically determine interest rates for borrowers and suppliers.

📖 Before using this repo, check out the [Venus Whitepaper](./docs/VenusWhitepaper.pdf)  
🤝 Want to contribute? See our [Contributing Guidelines](./docs/CONTRIBUTING.md)  
🔄 Core Pool code is in this repo; for [Isolated Pools](https://github.com/VenusProtocol/isolated-pools), see their separate repository.

---

## 📑 Table of Contents

- [Contracts](#contracts)
- [Documentation](#documentation)
- [Installation](#installation)
- [Testing](#testing)
- [Code Coverage](#code-coverage)
- [Deployment](#deployment)
- [Linting](#linting)
- [Hardhat Commands](#hardhat-commands)
- [Discussion](#discussion)

---

## 📦 Contracts

<dl>
  <dt><strong>VToken, VBep20, and VBNB</strong></dt>
  <dd>Self-contained lending and borrowing contracts. VToken has the core logic, while VBep20 and VBNB provide interfaces for BEP-20 tokens and BNB. VTokens allow mint, redeem, borrow, and repay functions and act as BEP-20 tokens representing market ownership.</dd>

  <dt><strong>Diamond Comptroller</strong></dt>
  <dd>Manages protocol risk and permissions via facets like MarketFacet, PolicyFacet, RewardFacet, and SetterFacet. Ensures collateral safety for users borrowing across vTokens.</dd>

  <dt><strong>XVS</strong></dt>
  <dd>The governance token for the Venus Protocol.</dd>

  <dt><strong>Governor Bravo</strong></dt>
  <dd>The administrator of the Venus Timelock contracts. Holders of XVS token who have locked their tokens in XVSVault may create and vote on proposals which will be queued into the Venus Timelock and then have effects on other Venus contracts.</dd>

  <dt><strong>InterestRateModel Variants</strong></dt>
  <dd>Contracts which define interest rate models. These models algorithmically determine interest rates based on the current utilization of a given market (that is, how much of the supplied assets are liquid versus borrowed).</dd>

  <dt><strong>CarefulMath, ErrorReporter, Exponential</strong></dt>
  <dd>Helper libraries for safe math, error tracking, and fixed-point arithmetic.</dd>
</dl>

---

## 📚 Documentation

- Public docs: [https://docs.venus.io](https://docs.venus.io)
- Generated via [solidity-docgen](https://github.com/OpenZeppelin/solidity-docgen)
- Generate locally:  
  ```bash
  yarn docgen
  ```

---

## ⚙️ Installation

Requires [Yarn](https://yarnpkg.com) or [npm](https://www.npmjs.com/):

```bash
git clone https://github.com/VenusProtocol/venus-protocol
cd venus-protocol
yarn install --lock-file  # or npm install
```

---

## 🧪 Testing

Run tests:

```bash
yarn test
```

To test with a forked network, set the `FORKED_NETWORK` and `ARCHIVE_NODE_<FORKED_NETWORK>` environment variables in your `.env` file.

---

## ✅ Code Coverage

```bash
npx hardhat coverage
```

---

## 🚀 Deployment

```bash
npx hardhat deploy
```

- Deploys all scripts from `./deploy`, skipping those with a `skip` condition.
- Default network is `hardhat`. For others:
  1. Configure in `hardhat.config.ts`
  2. Add `MNEMONIC` to `.env`
  3. Run:  
     ```bash
     npx hardhat deploy --network <network_name>
     ```

### ➕ Tags and Partial Deployments

To run only specific scripts with tags:

```ts
func.tags = ["MockTokens"];
```

Then:

```bash
npx hardhat deploy --tags "MockTokens"
```

### 🧪 Dry Run / Forked Deployment

Example:

```bash
HARDHAT_FORK_NETWORK=ethereum npx hardhat deploy
```

### 📍 Deployed Contracts

- Pre–Hardhat Deploy addresses: `networking/`
- Current deployments: `deployments/`
- Export all deployed contracts for a network:

```bash
yarn hardhat --network <network-name> --export ./deployments/<network-name>.json
```

### ✅ Source Code Verification

```bash
npx hardhat etherscan-verify --network <network_name>
```

Requires `ETHERSCAN_API_KEY` in `.env`.

---

## 🧹 Linting

```bash
yarn lint
yarn prettier
```

---

## 🛠 Hardhat Commands

```bash
npx hardhat accounts
npx hardhat compile
npx hardhat clean
npx hardhat test
npx hardhat node
npx hardhat help
REPORT_GAS=true npx hardhat test
TS_NODE_FILES=true npx ts-node scripts/deploy.ts
```

### ESLint & Prettier

```bash
npx eslint '**/*.{js,ts}'         # lint
npx eslint '**/*.{js,ts}' --fix   # auto-fix
npx prettier '**/*.{json,sol,md}' --check
npx prettier '**/*.{json,sol,md}' --write
```

### Solidity Linting

```bash
npx solhint 'contracts/**/*.sol'
npx solhint 'contracts/**/*.sol' --fix
```

### Example Deploy Script

```bash
MNEMONIC="<>" BSC_API_KEY="<>" npx hardhat run ./script/hardhat/deploy.ts --network testnet
```

---

## 💬 Discussion

- For help or feedback, open an issue or join us on [Telegram](https://t.me/venusprotocol).
- For security concerns, please message admins directly in our Telegram chat.

---

© 2023 Venus Protocol