export type Expect = (actual: any) => {
  toEqual: (expected: any) => any;
  fail: (message: string) => any;
};

export const throwExpect: Expect = x => {
  return {
    toEqual: y => {
      const xEnc = JSON.stringify(x);
      const yEnc = JSON.stringify(y);
      if (xEnc !== yEnc) {
        throw new Error(`expected ${x} to equal ${y}`);
      }
    },
    fail: reason => {
      throw new Error(reason);
    },
  };
};
