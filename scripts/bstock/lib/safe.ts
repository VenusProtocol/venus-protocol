/**
 * Minimal Safe{Wallet} Transaction Builder JSON helper.
 *
 * Produces the exact JSON shape the Safe UI "Transaction Builder" app imports
 * (Settings → Apps → Transaction Builder → "Load" a batch). Each entry is a raw
 * call (`to` + hex `data`); we encode calldata ourselves with ethers so the
 * batch needs no ABI upload in the UI.
 *
 * Schema ref: https://github.com/safe-global/safe-react-apps (tx-builder batch).
 */
import { BigNumber, BigNumberish, utils } from "ethers";

export interface SafeTx {
  to: string;
  value: string; // wei, decimal string
  data: string; // 0x-prefixed calldata
  contractMethod: null;
  contractInputsValues: null;
}

export interface SafeBatch {
  version: "1.0";
  chainId: string;
  createdAt: number; // unix ms
  meta: {
    name: string;
    description: string;
    txBuilderVersion: "1.16.5";
    createdFromSafeAddress: string;
  };
  transactions: SafeTx[];
}

/** Encode a single call: `tx(to, encode(signature, args))`, optionally carrying native `value` (wei). */
export function call(to: string, signature: string, args: unknown[], value: BigNumberish = 0): SafeTx {
  const iface = new utils.Interface([`function ${signature}`]);
  const fn = signature.slice(0, signature.indexOf("("));
  return {
    to: utils.getAddress(to),
    value: BigNumber.from(value).toString(),
    data: iface.encodeFunctionData(fn, args),
    contractMethod: null,
    contractInputsValues: null,
  };
}

export function buildBatch(p: {
  chainId: number;
  safe: string;
  name: string;
  description: string;
  createdAt: number; // pass Date.now() from caller
  transactions: SafeTx[];
}): SafeBatch {
  return {
    version: "1.0",
    chainId: String(p.chainId),
    createdAt: p.createdAt,
    meta: {
      name: p.name,
      description: p.description,
      txBuilderVersion: "1.16.5",
      createdFromSafeAddress: utils.getAddress(p.safe),
    },
    transactions: p.transactions,
  };
}
