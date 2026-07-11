import { EventEmitter } from "node:events";

export type AppEvent = { type: "transcript" | "semantic" | "task" | "session" | "job" | "report"; payload: unknown };
class EventBus extends EventEmitter {
  publish(event: AppEvent): void { this.emit("event", event); }
  subscribe(listener: (event: AppEvent) => void): () => void {
    this.on("event", listener);
    return () => this.off("event", listener);
  }
}
export const eventBus = new EventBus();

