import type {
  DomainHealth,
  DomainHealthStore,
  DomainRotationConfig,
  EmailEventBus,
} from "./types.js";

// ─────────────────────────────────────────────────────────────
// Default Configuration
// ─────────────────────────────────────────────────────────────

export const DEFAULT_ROTATION_CONFIG: DomainRotationConfig = {
  strategy: "round-robin",
  maxDailyPerDomain: 200,
  cooldownAfterBounce: 3_600, // 1 hour
  cooldownAfterComplaint: 86_400, // 24 hours
  bounceThreshold: 0.05, // 5%
  complaintThreshold: 0.001, // 0.1%
};

// ─────────────────────────────────────────────────────────────
// Warmup Schedule
// ─────────────────────────────────────────────────────────────

/**
 * Standard domain warmup schedule.
 * Day → daily sending limit. After day 30, full capacity.
 */
export const WARMUP_SCHEDULE: Record<number, number> = {
  1: 5,
  2: 10,
  3: 15,
  4: 20,
  5: 25,
  6: 30,
  7: 35,
  8: 40,
  9: 45,
  10: 50,
  11: 60,
  12: 70,
  13: 80,
  14: 90,
  15: 100,
  16: 110,
  17: 120,
  18: 130,
  19: 140,
  20: 150,
  21: 160,
  22: 170,
  23: 180,
  24: 190,
  25: 200,
  26: 210,
  27: 220,
  28: 230,
  29: 240,
  30: 250,
};

/**
 * Maximum daily limit for a fully warmed domain.
 */
export const MAX_WARMED_LIMIT = 250;

// ─────────────────────────────────────────────────────────────
// Domain Manager
// ─────────────────────────────────────────────────────────────

export interface DomainManagerConfig {
  store: DomainHealthStore;
  eventBus: EmailEventBus;
  rotationConfig?: Partial<DomainRotationConfig>;
  /** Minimum reputation score required for a domain to send. */
  minReputation?: number;
}

/**
 * Domain manager handles:
 * - Domain rotation across sending domains
 * - Daily sending limits enforcement
 * - Domain warmup scheduling
 * - Reputation tracking and blocking
 * - Cooldown after bounces/complaints
 */
export class DomainManager {
  private config: DomainManagerConfig;
  private rotationConfig: DomainRotationConfig;
  private rotationIndex = 0;
  private domainCache: Map<string, DomainHealth> = new Map();
  private cacheUpdatedAt = 0;
  private readonly cacheTtlMs = 60_000; // 1 minute cache

  constructor(config: DomainManagerConfig) {
    this.config = config;
    this.rotationConfig = {
      ...DEFAULT_ROTATION_CONFIG,
      ...config.rotationConfig,
    };
  }

  /**
   * Select the best sending domain based on the rotation strategy.
   * Returns null if no domain is available to send.
   */
  async selectDomain(excludeDomains: string[] = []): Promise<string | null> {
    const domains = await this.getAvailableDomains(excludeDomains);

    if (domains.length === 0) {
      await this.config.eventBus.emit("domain:limit_reached", {
        reason: "no_available_domains",
        excludeDomains,
      });
      return null;
    }

    switch (this.rotationConfig.strategy) {
      case "round-robin":
        return this.selectRoundRobin(domains);
      case "weighted":
        return this.selectWeighted(domains);
      case "least-used":
        return this.selectLeastUsed(domains);
      default:
        return this.selectRoundRobin(domains);
    }
  }

  /**
   * Check if a domain can send another email right now.
   */
  async canSend(domain: string): Promise<boolean> {
    const health = await this.getDomainHealthCached(domain);
    if (!health) return false;

    // Status checks
    if (health.status === "disabled" || health.status === "blocked") {
      return false;
    }

    // Daily limit check
    if (health.sentToday >= this.getEffectiveDailyLimit(health)) {
      return false;
    }

    // Bounce rate check
    if (health.bounceRate > this.rotationConfig.bounceThreshold) {
      return false;
    }

    // Complaint rate check
    if (health.complaintRate > this.rotationConfig.complaintThreshold) {
      return false;
    }

    // Reputation check
    const minRep = this.config.minReputation ?? 50;
    if (health.reputation < minRep) {
      return false;
    }

    return true;
  }

  /**
   * Record a successful send for a domain.
   */
  async recordSend(domain: string): Promise<void> {
    await this.config.store.recordSend(domain);
    this.invalidateCache();
  }

  /**
   * Record a bounce. May trigger domain cooldown if threshold exceeded.
   */
  async recordBounce(domain: string): Promise<void> {
    await this.config.store.recordBounce(domain);
    const health = await this.getDomainHealthCached(domain);

    if (health && health.bounceRate > this.rotationConfig.bounceThreshold) {
      await this.config.store.updateDomainHealth(domain, {
        status: "cooling",
      });

      await this.config.eventBus.emit("domain:blocked", {
        domain,
        reason: "bounce_threshold_exceeded",
        bounceRate: health.bounceRate,
        threshold: this.rotationConfig.bounceThreshold,
      });

      // Auto-recover after cooldown
      setTimeout(async () => {
        await this.config.store.updateDomainHealth(domain, {
          status: "active",
        });
      }, this.rotationConfig.cooldownAfterBounce * 1000);
    }

    this.invalidateCache();
  }

  /**
   * Record a spam complaint. May trigger domain cooldown.
   */
  async recordComplaint(domain: string): Promise<void> {
    await this.config.store.recordComplaint(domain);
    const health = await this.getDomainHealthCached(domain);

    if (
      health &&
      health.complaintRate > this.rotationConfig.complaintThreshold
    ) {
      await this.config.store.updateDomainHealth(domain, {
        status: "blocked",
      });

      await this.config.eventBus.emit("domain:blocked", {
        domain,
        reason: "complaint_threshold_exceeded",
        complaintRate: health.complaintRate,
        threshold: this.rotationConfig.complaintThreshold,
      });
    }

    this.invalidateCache();
  }

  /**
   * Record an open event (improves reputation).
   */
  async recordOpen(domain: string): Promise<void> {
    await this.config.store.recordOpen(domain);
    this.invalidateCache();
  }

  /**
   * Record a click event (improves reputation).
   */
  async recordClick(domain: string): Promise<void> {
    await this.config.store.recordClick(domain);
    this.invalidateCache();
  }

  /**
   * Start warmup for a new domain.
   */
  async startWarmup(domain: string): Promise<DomainHealth> {
    const now = new Date().toISOString();
    return this.config.store.updateDomainHealth(domain, {
      status: "warming",
      warmupStartedAt: now,
      warmupStage: 1,
      dailyLimit: WARMUP_SCHEDULE[1] ?? 5,
    });
  }

  /**
   * Advance warmup stage (call daily via a scheduler).
   */
  async advanceWarmup(domain: string): Promise<DomainHealth> {
    const health = await this.config.store.getDomainHealth(domain);
    if (!health || health.status !== "warming") {
      throw new Error(
        `Domain ${domain} is not in warmup (status: ${health?.status ?? "unknown"})`
      );
    }

    const nextStage = (health.warmupStage ?? 1) + 1;
    const dailyLimit = WARMUP_SCHEDULE[nextStage];

    if (!dailyLimit) {
      // Warmup complete
      return this.config.store.updateDomainHealth(domain, {
        status: "active",
        warmupStage: null,
        dailyLimit: MAX_WARMED_LIMIT,
      });
    }

    return this.config.store.updateDomainHealth(domain, {
      warmupStage: nextStage,
      dailyLimit,
    });
  }

  /**
   * Get all domains with their current health.
   */
  async getAllDomains(): Promise<DomainHealth[]> {
    return this.config.store.getAllDomains();
  }

  /**
   * Get health for a specific domain.
   */
  async getDomainHealth(domain: string): Promise<DomainHealth | null> {
    return this.getDomainHealthCached(domain);
  }

  /**
   * Get the effective daily limit for a domain (respects warmup).
   */
  getEffectiveDailyLimit(health: DomainHealth): number {
    if (health.status === "warming" && health.warmupStage) {
      return WARMUP_SCHEDULE[health.warmupStage] ?? health.dailyLimit;
    }
    return health.dailyLimit;
  }

  /**
   * Get all domains that are available to send from.
   */
  private async getAvailableDomains(
    excludeDomains: string[]
  ): Promise<DomainHealth[]> {
    const allDomains = await this.config.store.getAllDomains();
    const excludeSet = new Set(excludeDomains);

    const available: DomainHealth[] = [];

    for (const domain of allDomains) {
      if (excludeSet.has(domain.domain)) continue;
      if (domain.status === "disabled" || domain.status === "blocked")
        continue;
      if (domain.sentToday >= this.getEffectiveDailyLimit(domain)) continue;
      if (domain.bounceRate > this.rotationConfig.bounceThreshold) continue;
      if (domain.complaintRate > this.rotationConfig.complaintThreshold)
        continue;
      const minRep = this.config.minReputation ?? 50;
      if (domain.reputation < minRep) continue;

      available.push(domain);
    }

    return available;
  }

  private async selectRoundRobin(
    domains: DomainHealth[]
  ): Promise<string | null> {
    if (domains.length === 0) return null;
    const index = this.rotationIndex % domains.length;
    this.rotationIndex++;
    return domains[index]?.domain ?? null;
  }

  private async selectWeighted(
    domains: DomainHealth[]
  ): Promise<string | null> {
    if (domains.length === 0) return null;

    // Weight by reputation: higher rep = more sends
    const totalWeight = domains.reduce(
      (sum, d) => sum + d.reputation,
      0
    );
    if (totalWeight === 0) return domains[0]?.domain ?? null;

    let random = Math.random() * totalWeight;
    for (const domain of domains) {
      random -= domain.reputation;
      if (random <= 0) return domain.domain;
    }

    return domains[domains.length - 1]?.domain ?? null;
  }

  private async selectLeastUsed(
    domains: DomainHealth[]
  ): Promise<string | null> {
    if (domains.length === 0) return null;

    // Sort by sentToday ascending, then by reputation descending
    const sorted = [...domains].sort((a, b) => {
      const usageDiff =
        a.sentToday / this.getEffectiveDailyLimit(a) -
        b.sentToday / this.getEffectiveDailyLimit(b);
      if (usageDiff !== 0) return usageDiff;
      return b.reputation - a.reputation;
    });

    return sorted[0]?.domain ?? null;
  }

  /**
   * Cached domain health to avoid hitting the store on every check.
   */
  private async getDomainHealthCached(
    domain: string
  ): Promise<DomainHealth | null> {
    const now = Date.now();
    if (now - this.cacheUpdatedAt < this.cacheTtlMs) {
      const cached = this.domainCache.get(domain);
      if (cached) return cached;
    }

    const health = await this.config.store.getDomainHealth(domain);
    if (health) {
      this.domainCache.set(domain, health);
      this.cacheUpdatedAt = now;
    }
    return health;
  }

  private invalidateCache(): void {
    this.cacheUpdatedAt = 0;
  }
}

// ─────────────────────────────────────────────────────────────
// In-Memory Domain Health Store (for testing/dev)
// ─────────────────────────────────────────────────────────────

export class InMemoryDomainHealthStore implements DomainHealthStore {
  private domains = new Map<string, DomainHealth>();

  constructor(initialDomains?: string[]) {
    const now = new Date().toISOString();
    const domains = initialDomains ?? ["mail.example.com"];

    for (const domain of domains) {
      this.domains.set(domain, {
        domain,
        status: "active",
        dailyLimit: 200,
        sentToday: 0,
        bounceRate: 0,
        complaintRate: 0,
        openRate: 0,
        clickRate: 0,
        reputation: 100,
        lastUsedAt: null,
        createdAt: now,
        warmupStartedAt: null,
        warmupStage: null,
        dkimVerified: true,
        spfVerified: true,
        dmarcVerified: true,
      });
    }
  }

  async getDomainHealth(domain: string): Promise<DomainHealth | null> {
    return this.domains.get(domain) ?? null;
  }

  async getAllDomains(): Promise<DomainHealth[]> {
    return Array.from(this.domains.values());
  }

  async updateDomainHealth(
    domain: string,
    update: Partial<DomainHealth>
  ): Promise<DomainHealth> {
    const existing = this.domains.get(domain);
    if (!existing) {
      throw new Error(`Domain ${domain} not found`);
    }
    const updated = { ...existing, ...update };
    this.domains.set(domain, updated);
    return updated;
  }

  async recordSend(domain: string, count = 1): Promise<void> {
    const existing = this.domains.get(domain);
    if (!existing) return;
    this.domains.set(domain, {
      ...existing,
      sentToday: existing.sentToday + count,
      lastUsedAt: new Date().toISOString(),
    });
  }

  async recordBounce(domain: string): Promise<void> {
    const existing = this.domains.get(domain);
    if (!existing) return;
    const totalSends = Math.max(existing.sentToday, 1);
    this.domains.set(domain, {
      ...existing,
      bounceRate: (existing.bounceRate * (totalSends - 1) + 1) / totalSends,
      reputation: Math.max(0, existing.reputation - 5),
    });
  }

  async recordComplaint(domain: string): Promise<void> {
    const existing = this.domains.get(domain);
    if (!existing) return;
    const totalSends = Math.max(existing.sentToday, 1);
    this.domains.set(domain, {
      ...existing,
      complaintRate:
        (existing.complaintRate * (totalSends - 1) + 1) / totalSends,
      reputation: Math.max(0, existing.reputation - 15),
    });
  }

  async recordOpen(domain: string): Promise<void> {
    const existing = this.domains.get(domain);
    if (!existing) return;
    const totalSends = Math.max(existing.sentToday, 1);
    this.domains.set(domain, {
      ...existing,
      openRate: (existing.openRate * totalSends + 1) / totalSends,
      reputation: Math.min(100, existing.reputation + 0.5),
    });
  }

  async recordClick(domain: string): Promise<void> {
    const existing = this.domains.get(domain);
    if (!existing) return;
    const totalSends = Math.max(existing.sentToday, 1);
    this.domains.set(domain, {
      ...existing,
      clickRate: (existing.clickRate * totalSends + 1) / totalSends,
      reputation: Math.min(100, existing.reputation + 1),
    });
  }

  /** Add a domain to the store. */
  addDomain(
    domain: string,
    overrides?: Partial<DomainHealth>
  ): void {
    const now = new Date().toISOString();
    this.domains.set(domain, {
      domain,
      status: "active",
      dailyLimit: 200,
      sentToday: 0,
      bounceRate: 0,
      complaintRate: 0,
      openRate: 0,
      clickRate: 0,
      reputation: 100,
      lastUsedAt: null,
      createdAt: now,
      warmupStartedAt: null,
      warmupStage: null,
      dkimVerified: true,
      spfVerified: true,
      dmarcVerified: true,
      ...overrides,
    });
  }

  /** Reset daily counters (call at midnight via a scheduler). */
  resetDailyCounters(): void {
    for (const [key, value] of this.domains) {
      this.domains.set(key, { ...value, sentToday: 0 });
    }
  }

  /** Clear all domains. */
  clear(): void {
    this.domains.clear();
  }
}