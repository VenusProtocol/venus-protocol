import { DocItemContext } from "solidity-docgen/dist/site";

export const visible = ({
  item,
}: DocItemContext & { item: { visibility: "public" | "external" | "private" | "internal" } }): boolean => {
  return item.visibility === "public" || item.visibility === "external";
};
