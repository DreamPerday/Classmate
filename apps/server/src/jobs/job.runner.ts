import { eventBus } from "../shared/event-bus.js";
import { JobRepository, type Job } from "./job.repository.js";

type Handler = (payload: Record<string, unknown>) => Promise<void>;
export class JobRunner {
  private timer?: NodeJS.Timeout; private running = 0; private readonly handlers = new Map<string, Handler>();
  constructor(private readonly repository: JobRepository,private readonly maxConcurrency=3) {}
  register(type: string, handler: Handler): void { this.handlers.set(type, handler); }
  start(): void { this.repository.recoverInterrupted();this.timer = setInterval(() => void this.tick(), 500); this.timer.unref(); }
  stop(): void { if (this.timer) clearInterval(this.timer); }
  async drain(): Promise<void> { for (let i = 0; i < 100; i++) { const worked = await this.tick(); if (!worked) return; } }
  private async tick(): Promise<boolean> {
    if (this.running>=this.maxConcurrency) return false; const job = this.repository.claim(); if (!job) return false;
    this.running++;
    try { await this.run(job); this.repository.complete(job.id); eventBus.publish({ type: "job", payload: { id: job.id, status: "completed" } }); }
    catch (error) { this.repository.fail(job, error); eventBus.publish({ type: "job", payload: { id: job.id, status: "failed", error: error instanceof Error ? error.message : String(error) } }); }
    finally { this.running--; }
    return true;
  }
  private async run(job: Job): Promise<void> { const handler = this.handlers.get(job.type); if (!handler) throw new Error(`No handler for ${job.type}`); await handler(job.payload); }
}
