import { Event } from "./Event";

// Effectively the opposite of parse
export function formatEvent(event: Event, outter = true): string {
  if (Array.isArray(event)) {
    if (event.length === 2 && typeof event[0] === "string" && (<string>event[0]).toLowerCase() === "exactly") {
      return event[1].toString();
    }

    const mapped = event.map(e => formatEvent(<Event>e, false));
    const joined = mapped.join(" ");

    if (outter) {
      return joined;
    } else {
      return `(${joined})`;
    }
  } else {
    return event;
  }
}

export function formatError(err: any) {
  return JSON.stringify(err); // yeah... for now
}
