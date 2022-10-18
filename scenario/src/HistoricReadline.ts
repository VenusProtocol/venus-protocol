import * as fs from "fs";
import * as readline from "readline";

import { readFile } from "./File";

const readlineAny = <any>readline;

export async function createInterface(options): Promise<readline.ReadLine> {
  const history: string[] = await readFile(null, options["path"], [], x => x.split("\n"));
  const cleanHistory = history.filter(x => !!x).reverse();

  readlineAny.kHistorySize = Math.max(readlineAny.kHistorySize, options["maxLength"]);

  const rl = readline.createInterface(options);
  const rlAny = <any>rl;

  const oldAddHistory = rlAny._addHistory;

  rlAny._addHistory = function () {
    const last = rlAny.history[0];
    const line = oldAddHistory.call(rl);

    // TODO: Should this be sync?
    if (line.length > 0 && line != last) {
      fs.appendFileSync(options["path"], `${line}\n`);
    }

    // TODO: Truncate file?

    return line;
  };

  rlAny.history.push(cleanHistory);

  return rl;
}
