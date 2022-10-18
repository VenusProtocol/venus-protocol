import { Macros } from "./Macro";
import { World } from "./World";

// TODO: Get smarter about storing actions as data
const actions: string[] = [
  "Read",
  "Assert",
  "FastForward",
  "Inspect",
  "Debug",
  "From",
  "Invariant",
  "Comptroller",
  "vToken",
  "Bep20",
];

function caseInsensitiveSort(a: string, b: string): number {
  const A = a.toUpperCase();
  const B = b.toUpperCase();

  if (A < B) {
    return -1;
  } else if (A > B) {
    return 1;
  } else {
    return 0;
  }
}

export function complete(world: World, macros: Macros, line: string) {
  const allActions = actions.concat(Object.keys(macros)).sort(caseInsensitiveSort);
  const hits = allActions.filter(c => c.toLowerCase().startsWith(line.toLowerCase()));

  return [hits, line];
}
