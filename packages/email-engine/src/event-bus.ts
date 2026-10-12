import type { EmailEventBus, EmailEventHandler, EmailEventType } from "./types.js";

/**
 * Simple in-process event bus for email engine events.
 * Useful for local dev and testing. In production, you'd replace
 * this with a distributed event bus (e.g., Redis pub/sub, Kafka).
 */
export class InMemoryEventBus implements EmailEventBus {
  private handlers = new Map<EmailEventType, Set<EmailEventHandler>>();

  on(type: EmailEventType, handler: EmailEventHandler): void {
    let set = this.handlers.get(type);
    if (!set) {
      set = new Set();
      this.handlers.set(type, set);
    }
    set.add(handler);
  }

  off(type: EmailEventType, handler: EmailEventHandler): void {
    const set = this.handlers.get(type);
    if (set) {
      set.delete(handler);
      if (set.size === 0) {
        this.handlers.delete(type);
      }
    }
  }

  async emit(
    type: EmailEventType,
    payload: Record<string, unknown>
  ): Promise<void> {
    const event = {
      type,
      payload,
      timestamp: new Date().toISOString(),
    };

    const handlers = this.handlers.get(type);
    if (!handlers) return;

    const promises: Promise<void>[] = [];
    for (const handler of handlers) {
      try {
        const result = handler(event);
        if (result instanceof Promise) {
          promises.push(result.catch((err) => {
            console.error(`Event handler error for ${type}:`, err);
          }));
        }
      } catch (err) {
        console.error(`Event handler error for ${type}:`, err);
      }
    }

    await Promise.all(promises);
  }

  /** Remove all handlers. */
  clear(): void {
    this.handlers.clear();
  }

  /** Get handler count for a type. */
  handlerCount(type: EmailEventType): number {
    return this.handlers.get(type)?.size ?? 0;
  }
}