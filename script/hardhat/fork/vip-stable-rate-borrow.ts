import { tokens } from "../utils/vip-stable-rate-address.json";
import { forking, testVip } from "./vip-framework";
import { ProposalType } from "./vip-framework/types";
import { makeProposal } from "./vip-framework/utils";

const vipStableRateBorrow: any = async () => {
  const meta = {
    version: "v1",
    title: "VIP-105 Comptroller Diamond proxy",
    description: ``,
    forDescription:
      "I agree that Venus Protocol should proceed with the upgrading the Comptroller contract with diamond proxy",
    againstDescription: "I do not think that Venus Protocol should proceed with the Comptroller contract upgradation",
    abstainDescription: "I am indifferent to whether Venus Protocol proceeds with the Comptroller upgradation or not",
  };

  const vtokenUpgradeTransactions = token => {
    return [
      {
        target: token.vToken,
        signature: "_setImplementation(address,bool,bytes)",
        params: [token.vTokenImplementation],
      },
      {
        target: token.vToken,
        signature: "_setInterestRateModel(address)",
        params: [token.interestRateModel],
      },
      {
        target: token.interestRateModel,
        signature: "updateJumpRateModel(uint256,uint256,uint256,uint256)",
        params: [
          token.interestRateModelParameters.baseRatePerYear,
          token.interestRateModelParameters.multiplierPerYear,
          token.interestRateModelParameters.jumpMultiplierPerYear,
          token.interestRateModelParameters.kink_,
        ],
      },
      {
        target: token.stableRateModel,
        signature: "updateStableRateModel(uint256,uint256,uint256)",
        params: [
          token.stableRateModelParameters.baseRatePerYear_,
          token.stableRateModelParameters.stableRatePremium_,
          token.stableRateModelParameters.optimalStableLoanRatio_,
        ],
      },
    ];
  };

  const makeProposalFunction = () => {
    let proposal: any = [];
    tokens.map(token => {
      const tokenTransactions = vtokenUpgradeTransactions(token);
      proposal = [...proposal, ...tokenTransactions];
    });

    return proposal;
  };

  return makeProposal(makeProposalFunction(), meta, ProposalType.REGULAR);
};

forking(26544741, () => {
  testVip("VIP-103 Gauntlet Rrecommendations", vipStableRateBorrow());
});
