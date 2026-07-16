/**
 * Peg Stability Module client for the VAI hop-2 leg (USDT -> VAI).
 *
 * A VAI debt is inherently two-hop (RFQ sources quote bStock->USDT only) and its hop 2 is the PSM,
 * not an AMM: `swapStableForVAI` mints VAI against USDT at the oracle rate (min($1, price) on the
 * way in, minus feeIn), so there is no pool depth to eat or sandwich. Unlike lib/amm.ts there is no
 * quote API either — the calldata is a fixed function encoded locally, and the "quote" is the PSM's
 * own `previewSwapStableForVAI` view. The PSM must be allowlisted on the liquidator (`setRouter`)
 * like any hop-2 router.
 *
 * Returns the same `{ router, calldata, expectedOut }` shape as lib/amm.ts, sized off the hop-1
 * FLOOR (see atomic-liquidate.ts): the PSM pulls exactly `amountIn` via `safeTransferFrom`, which
 * always fits inside the contract's `midDelta` approval because `floor <= midDelta`.
 */
import { BigNumber, Contract, providers, utils } from "ethers";

import { AmmSwap } from "./amm";

// Venus PegStability_USDT proxy on BSC mainnet.
export const BSC_PSM_USDT = "0xC138aa4E424D1A8539e8F38Af5a754a2B7c3Cc36";

const PSM_ABI = [
  "function swapStableForVAI(address receiver, uint256 stableTknAmount) returns (uint256)",
  "function previewSwapStableForVAI(uint256 stableTknAmount) view returns (uint256)",
  "function isPaused() view returns (bool)",
  "function vaiMintCap() view returns (uint256)",
  "function vaiMinted() view returns (uint256)",
];

export interface PsmSwapParams {
  amountIn: BigNumber; // wei of USDT to sell — the hop-1 floor
  recipient: string; // where the VAI must land (the liquidator contract, where minOut reads it)
}

/** Build the PSM hop-2 swap: pre-flight the pause/mint-cap state, then encode `swapStableForVAI`. */
export async function getPsmSwap(p: PsmSwapParams, provider: providers.Provider): Promise<AmmSwap> {
  const psmAddr = utils.getAddress(process.env.PSM_ADDR || BSC_PSM_USDT);
  const psm = new Contract(psmAddr, PSM_ABI, provider);

  // Fail legibly off-chain instead of a bare on-chain revert. safe-fallback.ts is the documented
  // manual path when the PSM leg is unavailable.
  if (await psm.isPaused()) {
    throw new Error(`PSM ${psmAddr} is paused — VAI hop 2 unavailable (use safe-fallback)`);
  }

  // The PSM's cap check charges the USD value of the pull (`vaiMinted + amountUSD > vaiMintCap`)
  // and its IN-direction price is min($1, oracle), so `amountIn` (USDT is 18 decimals on BSC)
  // bounds that USD value from above: headroom >= amountIn can never trip VAIMintCapReached.
  const [cap, minted] = await Promise.all([psm.vaiMintCap(), psm.vaiMinted()]);
  const headroom: BigNumber = cap.sub(minted);
  if (headroom.lt(p.amountIn)) {
    throw new Error(
      `PSM mint-cap headroom ${utils.formatEther(headroom)} VAI < hop-1 floor ` +
        `${utils.formatEther(p.amountIn)} USDT — reduce REPAY_AMOUNT or use safe-fallback`,
    );
  }

  // expectedOut is the PSM's own preview (oracle rate minus feeIn), NOT 1:1: USDT usually prices a
  // hair under $1, and a 1:1 assumption would put the derived minOut above what the PSM can deliver.
  const expectedOut: BigNumber = await psm.previewSwapStableForVAI(p.amountIn);
  return {
    router: psmAddr,
    calldata: psm.interface.encodeFunctionData("swapStableForVAI", [p.recipient, p.amountIn]),
    expectedOut: expectedOut.toString(),
  };
}
