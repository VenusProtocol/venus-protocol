import { mkdirSync, writeFileSync } from "fs";

const GENERATED_CONTRACTS_PATH = `${__dirname}/../contracts/generated`;

export const writeGeneratedContract = (fileName: string, content: string) => {
  mkdirSync(GENERATED_CONTRACTS_PATH, { recursive: true });
  writeFileSync(`${GENERATED_CONTRACTS_PATH}/${fileName}`, content, "utf-8");
};
