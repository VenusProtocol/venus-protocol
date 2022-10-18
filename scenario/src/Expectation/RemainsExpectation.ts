import { getCoreValue } from "../CoreValue";
import { Event } from "../Event";
import { Expectation } from "../Expectation";
import { formatEvent } from "../Formatter";
import { Value } from "../Value";
import { World, fail } from "../World";

export class RemainsExpectation implements Expectation {
  condition: Event;
  value: Value;

  constructor(condition: Event, value: Value) {
    this.condition = condition;
    this.value = value;
  }

  async getCurrentValue(world: World): Promise<Value> {
    return await getCoreValue(world, this.condition);
  }

  async checker(world: World, initialCheck: boolean = false): Promise<void> {
    const currentValue = await this.getCurrentValue(world);

    if (!this.value.compareTo(world, currentValue)) {
      fail(
        world,
        `${this.toString()} failed as value ${initialCheck ? "started as" : "became"} \`${currentValue.toString()}\``,
      );
    }
  }

  toString() {
    return `RemainsExpectation: condition=${formatEvent(this.condition)}, value=${this.value.toString()}`;
  }
}
