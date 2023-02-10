import { BigNumberish } from "ethers";

export interface ProposalMeta {
  version: string;
  title: string;
  description: string;
  forDescription: string;
  againstDescription: string;
  abstainDescription: string;
}

export interface Proposal {
  targets: string[];
  values: BigNumberish[];
  signatures: string[];
  params: any[][];
  meta: ProposalMeta;
}
