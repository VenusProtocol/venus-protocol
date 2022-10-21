import { Invariant } from "../Invariant";
import { World, fail } from "../World";

export class SuccessInvariant implements Invariant {
  held = false;

  async checker(world: World): Promise<void> {
    if (world.lastInvokation && !world.lastInvokation.success()) {
      fail(
        world,
        `Success invariant broken! Expected successful execution, but had error ${world.lastInvokation.toString()}`,
      );
    }
  }

  toString() {
    return `SuccessInvariant`;
  }
}
