export type TokenConfig =
  | {
      isMock: true;
      name: string;
      symbol: string;
      decimals: number;
    }
  | {
      isMock: false;
      name?: string;
      symbol: string;
      decimals: number;
      tokenAddress: string;
    };
