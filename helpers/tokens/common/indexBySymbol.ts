import { TokenConfig } from "../types";

type FromTokenList<arr extends readonly TokenConfig[]> = {
  [k in keyof arr & `${number}` as arr[k]["symbol"]]: arr[k];
} & unknown;

export const indexBySymbol = <arr extends readonly TokenConfig[]>(tokenList: arr): FromTokenList<arr> => {
  const result = tokenList.reduce((acc, entry) => ({ [entry.symbol]: entry, ...acc }), {});
  return result as FromTokenList<arr>;
};
