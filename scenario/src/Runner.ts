import { processEvents } from "./CoreEvent";
import { Macros, expandEvent } from "./Macro";
import { parse } from "./Parser";
import { World } from "./World";

export async function runCommand(world: World, command: string, macros: Macros): Promise<World> {
  const trimmedCommand = command.trim();

  const event = parse(trimmedCommand, { startRule: "step" });

  if (event === null) {
    return world;
  } else {
    world.printer.printLine(`Command: ${trimmedCommand}`);

    const expanded = expandEvent(macros, event);

    return processEvents(world, expanded);
  }
}
