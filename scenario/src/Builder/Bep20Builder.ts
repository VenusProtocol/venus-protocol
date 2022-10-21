import { Arg, Fetcher, getFetcherValue } from "../Command";
import { getContract } from "../Contract";
import { Bep20 } from "../Contract/Bep20";
import { getAddressV, getNumberV, getStringV } from "../CoreValue";
import { Event } from "../Event";
import { Invokation } from "../Invokation";
import { storeAndSaveContract } from "../Networks";
import { encodeABI } from "../Utils";
import { AddressV, NumberV, StringV } from "../Value";
import { World } from "../World";

const ExistingToken = getContract("EIP20Interface");
const TetherInterface = getContract("TetherInterface");

const FaucetTokenHarness = getContract("FaucetToken");
const FaucetTokenNonStandardHarness = getContract("FaucetNonStandardToken");
const FaucetTokenReEntrantHarness = getContract("FaucetTokenReEntrantHarness");
const EvilTokenHarness = getContract("EvilToken");
const WBTVTokenHarness = getContract("WBTVToken");
const FeeTokenHarness = getContract("FeeToken");

export interface TokenData {
  invokation: Invokation<Bep20>;
  description: string;
  name: string;
  symbol: string;
  decimals?: number;
  address?: string;
  contract: string;
}

export async function buildBep20(
  world: World,
  from: string,
  event: Event,
): Promise<{ world: World; bep20: Bep20; tokenData: TokenData }> {
  const fetchers = [
    new Fetcher<{ symbol: StringV; address: AddressV; name: StringV }, TokenData>(
      `
        #### Existing

        * "Existing symbol:<String> address:<Address> name:<String>" - Wrap an existing Bep20 token
          * E.g. "Bep20 Deploy Existing DAI 0x123...
      `,
      "Existing",
      [
        new Arg("symbol", getStringV),
        new Arg("address", getAddressV),
        new Arg("name", getStringV, { default: undefined }),
      ],
      async (world, { symbol, name, address }) => {
        const existingToken = await ExistingToken.at<Bep20>(world, address.val);
        const tokenName = name.val === undefined ? symbol.val : name.val;
        const decimals = await existingToken.methods.decimals().call();

        return {
          invokation: new Invokation<Bep20>(existingToken, null, null, null),
          description: "Existing",
          decimals: Number(decimals),
          name: tokenName,
          symbol: symbol.val,
          contract: "ExistingToken",
        };
      },
    ),

    new Fetcher<{ symbol: StringV; address: AddressV }, TokenData>(
      `
        #### ExistingTether

        * "Existing symbol:<String> address:<Address>" - Wrap an existing Bep20 token
          * E.g. "Bep20 Deploy ExistingTether USDT 0x123...
      `,
      "ExistingTether",
      [new Arg("symbol", getStringV), new Arg("address", getAddressV)],
      async (world, { symbol, address }) => {
        return {
          invokation: new Invokation<Bep20>(await TetherInterface.at<Bep20>(world, address.val), null, null, null),
          description: "ExistingTether",
          name: symbol.val,
          symbol: symbol.val,
          contract: "TetherInterface",
        };
      },
    ),

    new Fetcher<{ symbol: StringV; name: StringV; decimals: NumberV }, TokenData>(
      `
        #### NonStandard

        * "NonStandard symbol:<String> name:<String> decimals:<Number=18>" - A non-standard token, like BAT
          * E.g. "Bep20 Deploy NonStandard BAT \"Basic Attention Token\" 18"
      `,
      "NonStandard",
      [
        new Arg("symbol", getStringV),
        new Arg("name", getStringV),
        new Arg("decimals", getNumberV, { default: new NumberV(18) }),
      ],
      async (world, { symbol, name, decimals }) => {
        return {
          invokation: await FaucetTokenNonStandardHarness.deploy<Bep20>(world, from, [
            0,
            name.val,
            decimals.val,
            symbol.val,
          ]),
          description: "NonStandard",
          name: name.val,
          symbol: symbol.val,
          decimals: decimals.toNumber(),
          contract: "FaucetNonStandardToken",
        };
      },
    ),

    new Fetcher<
      { symbol: StringV; name: StringV; fun: StringV; reEntryFunSig: StringV; reEntryFunArgs: StringV[] },
      TokenData
    >(
      `
        #### ReEntrant

        * "ReEntrant symbol:<String> name:string fun:<String> funSig:<String> ...funArgs:<Value>" - A token that loves to call back to spook its caller
          * E.g. "Bep20 Deploy ReEntrant PHREAK PHREAK "transfer" "mint(uint256)" 0 - A token that will call back to a VToken's mint function

        Note: valid functions: totalSupply, balanceOf, transfer, transferFrom, approve, allowance
      `,
      "ReEntrant",
      [
        new Arg("symbol", getStringV),
        new Arg("name", getStringV),
        new Arg("fun", getStringV),
        new Arg("reEntryFunSig", getStringV),
        new Arg("reEntryFunArgs", getStringV, { variadic: true, mapped: true }),
      ],
      async (world, { symbol, name, fun, reEntryFunSig, reEntryFunArgs }) => {
        const fnData = encodeABI(
          world,
          reEntryFunSig.val,
          reEntryFunArgs.map(a => a.val),
        );

        return {
          invokation: await FaucetTokenReEntrantHarness.deploy<Bep20>(world, from, [
            0,
            name.val,
            18,
            symbol.val,
            fnData,
            fun.val,
          ]),
          description: "ReEntrant",
          name: name.val,
          symbol: symbol.val,
          decimals: 18,
          contract: "FaucetTokenReEntrantHarness",
        };
      },
    ),

    new Fetcher<{ symbol: StringV; name: StringV; decimals: NumberV }, TokenData>(
      `
        #### Evil

        * "Evil symbol:<String> name:<String> decimals:<Number>" - A less vanilla BEP-20 contract that fails transfers
          * E.g. "Bep20 Deploy Evil BAT \"Basic Attention Token\" 18"
      `,
      "Evil",
      [
        new Arg("symbol", getStringV),
        new Arg("name", getStringV),
        new Arg("decimals", getNumberV, { default: new NumberV(18) }),
      ],
      async (world, { symbol, name, decimals }) => {
        return {
          invokation: await EvilTokenHarness.deploy<Bep20>(world, from, [0, name.val, decimals.val, symbol.val]),
          description: "Evil",
          name: name.val,
          symbol: symbol.val,
          decimals: decimals.toNumber(),
          contract: "EvilToken",
        };
      },
    ),

    new Fetcher<{ symbol: StringV; name: StringV; decimals: NumberV }, TokenData>(
      `
        #### Standard

        * "Standard symbol:<String> name:<String> decimals:<Number>" - A vanilla BEP-20 contract
          * E.g. "Bep20 Deploy Standard BAT \"Basic Attention Token\" 18"
      `,
      "Standard",
      [
        new Arg("symbol", getStringV),
        new Arg("name", getStringV),
        new Arg("decimals", getNumberV, { default: new NumberV(18) }),
      ],
      async (world, { symbol, name, decimals }) => {
        return {
          invokation: await FaucetTokenHarness.deploy<Bep20>(world, from, [0, name.val, decimals.val, symbol.val]),
          description: "Standard",
          name: name.val,
          symbol: symbol.val,
          decimals: decimals.toNumber(),
          contract: "FaucetToken",
        };
      },
    ),

    new Fetcher<{ symbol: StringV; name: StringV }, TokenData>(
      `
        #### WBTC

        * "WBTC symbol:<String> name:<String>" - The WBTC contract
          * E.g. "Bep20 Deploy WBTC WBTC \"Wrapped Bitcoin\""
      `,
      "WBTC",
      [
        new Arg("symbol", getStringV, { default: new StringV("WBTC") }),
        new Arg("name", getStringV, { default: new StringV("Wrapped Bitcoin") }),
      ],
      async (world, { symbol, name }) => {
        const decimals = 8;

        return {
          invokation: await WBTVTokenHarness.deploy<Bep20>(world, from, []),
          description: "WBTC",
          name: name.val,
          symbol: symbol.val,
          decimals: decimals,
          contract: "WBTVToken",
        };
      },
    ),

    new Fetcher<
      { symbol: StringV; name: StringV; decimals: NumberV; basisPointFee: NumberV; owner: AddressV },
      TokenData
    >(
      `
        #### Fee

        * "Fee symbol:<String> name:<String> decimals:<Number> basisPointFee:<Number> owner:<Address>" - An BEP20 whose owner takes a fee on transfers. Used for mocking USDT.
          * E.g. "Bep20 Deploy Fee USDT USDT 100 Root"
      `,
      "Fee",
      [
        new Arg("symbol", getStringV),
        new Arg("name", getStringV),
        new Arg("decimals", getNumberV),
        new Arg("basisPointFee", getNumberV),
        new Arg("owner", getAddressV),
      ],
      async (world, { symbol, name, decimals, basisPointFee, owner }) => {
        return {
          invokation: await FeeTokenHarness.deploy<Bep20>(world, from, [
            0,
            name.val,
            decimals.val,
            symbol.val,
            basisPointFee.val,
            owner.val,
          ]),
          description: "Fee",
          name: name.val,
          symbol: symbol.val,
          decimals: decimals.toNumber(),
          owner: owner.val,
          contract: "FeeToken",
        };
      },
    ),
  ];

  const tokenData = await getFetcherValue<any, TokenData>("DeployBep20", fetchers, world, event);
  const invokation = tokenData.invokation;
  delete tokenData.invokation;

  if (invokation.error) {
    throw invokation.error;
  }
  const bep20 = invokation.value!;
  tokenData.address = bep20._address;

  world = await storeAndSaveContract(world, bep20, tokenData.symbol, invokation, [
    { index: ["Tokens", tokenData.symbol], data: tokenData },
  ]);

  return { world, bep20, tokenData };
}
