import { indexBySymbol } from "./common/indexBySymbol";
import { TokenConfig } from "./types";

const tokens = [
  {
    isMock: true,
    name: "First Digital USD",
    symbol: "FDUSD",
    decimals: 18,
  },
  {
    isMock: true,
    name: "Wrapped BNB",
    symbol: "WBNB",
    decimals: 18,
  },
  {
    isMock: true,
    name: "DOGE",
    symbol: "DOGE",
    decimals: 18,
  },
  {
    isMock: true,
    name: "USDT",
    symbol: "USDT",
    decimals: 18,
  },
] as const satisfies readonly TokenConfig[];

export default indexBySymbol(tokens);
