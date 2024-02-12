export enum SUPPORTED_NETWORKS {
  BSCTESTNET = "bsctestnet",
  BSCMAINNET = "bscmainnet",
  SEPOLIA = "sepolia",
  ETHERUEM = "ethereum",
  OPBNBTESTNET = "opbnbtestnet",
  OPBNBMAINNET = "opbnbmainnet",
  HARDHAT = "hardhat",
}

export const LZ_ENDPOINTS: Record<SUPPORTED_NETWORKS, string> = {
  ethereum: "0x66A71Dcef29A0fFBDBE3c6a460a3B5BC225Cd675",
  bscmainnet: "0x3c2269811836af69497E5F486A85D7316753cf62",
  opbnbmainnet: "0xb6319cC6c8c27A8F5dAF0dD3DF91EA35C4720dd7",
  sepolia: "0xae92d5aD7583AD66E49A0c67BAd18F6ba52dDDc1",
  bsctestnet: "0x6Fcb97553D41516Cb228ac03FdC8B9a0a9df04A1",
  opbnbtestnet: "0x83c73Da98cf733B03315aFa8758834b36a195b87",
  hardhat: "0x6Fcb97553D41516Cb228ac03FdC8B9a0a9df04A1",
};
