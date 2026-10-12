import type {
  PostalSendRequest,
  PostalSendResponse,
  PostalDeliveryStatus,
  DomainHealth,
  DomainRotationConfig,
  SmtpClientConfig,
} from "./types.js";

/**
 * Default configuration. Override in constructor.
 */
export const DEFAULT_SMTP_CONFIG: SmtpClientConfig = {
  postalApiUrl: "https://postal.example.com/api/v1",
  postalApiKey: "",
  defaultDomain: "mail.example.com",
  defaultFromName: "Sales Team",
};

/**
 * Postal SMTP API client.
 *
 * Communicates with Postal's HTTP API for sending email, checking delivery
 * status, and managing sending domains. All configuration is injected so the
 * client can be tested without a live Postal instance.
 */
export class PostalSmtpClient {
  private config: SmtpClientConfig;

  constructor(config: Partial<SmtpClientConfig> = {}) {
    this.config = { ...DEFAULT_SMTP_CONFIG, ...config };
  }

  /**
   * Send a multipart (HTML + text) email through Postal.
   */
  async send(request: PostalSendRequest): Promise<PostalSendResponse> {
    const url = `${this.config.postalApiUrl}/send/message`;

    // Ensure from address includes the default domain if only a name was provided.
    const from = {
      ...request.from,
      email: request.from.email.includes("@")
        ? request.from.email
        : `${request.from.email}@${this.config.defaultDomain}`,
    };

    const body = {
      from: `${from.name ?? this.config.defaultFromName} <${from.email}>`,
      to: request.to.map(
        (t) => `${t.name ? `${t.name} <${t.email}>` : t.email}`
      ),
      cc: request.cc?.map((c) =>
        c.name ? `${c.name} <${c.email}>` : c.email
      ),
      bcc: request.bcc?.map((b) =>
        b.name ? `${b.name} <${b.email}>` : b.email
      ),
      subject: request.subject,
      html_body: request.htmlBody,
      plain_body: request.textBody,
      reply_to: request.replyTo,
      message_id: request.messageId,
      tags: request.tags,
      headers: request.headers ? JSON.stringify(request.headers) : undefined,
      attachments: request.attachments?.map((a) => ({
        name: a.name,
        data: a.content,
        content_type: a.contentType,
      })),
    };

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "X-Server-API-Key": this.config.postalApiKey,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(
          `Postal API error (${response.status}): ${errorBody}`
        );
      }

      const data = (await response.json()) as {
        status: string;
        data?: {
          message_id: string;
          token: string;
          messages: Record<
            string,
            { id: number; token: string; status: string }
          >;
        };
        time: number;
        flags: Record<string, unknown>;
      };

      // Postal returns per-recipient message objects.
      const firstRecipient = Object.values(data.data?.messages ?? {})[0];

      return {
        messageId: data.data?.message_id ?? "",
        token: firstRecipient?.token ?? "",
        status: (firstRecipient?.status as PostalSendResponse["status"]) ?? "queued",
        details: undefined,
        timestamp: new Date(data.time * 1000).toISOString(),
      };
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("Postal API error")) {
        throw error;
      }
      throw new Error(
        `Failed to send email: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Check delivery status for a message via Postal's message endpoint.
   */
  async getDeliveryStatus(
    messageId: string
  ): Promise<PostalDeliveryStatus> {
    const url = `${this.config.postalApiUrl}/messages/${encodeURIComponent(messageId)}`;

    try {
      const response = await fetch(url, {
        method: "GET",
        headers: {
          "X-Server-API-Key": this.config.postalApiKey,
          Accept: "application/json",
        },
      });

      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(
          `Postal API error (${response.status}): ${errorBody}`
        );
      }

      const data = (await response.json()) as {
        status: string;
        data?: {
          id: number;
          token: string;
          status: string;
          details: string;
          time: number;
          loaded: number;
          clicked: number;
          inspected: boolean;
        };
      };

      const msg = data.data;
      if (!msg) {
        throw new Error(`Message ${messageId} not found in Postal`);
      }

      let status: PostalDeliveryStatus["status"] = "sent";
      if (msg.status === "Held" || msg.status === "Pending") status = "queued";
      else if (msg.status === "Sent") status = "sent";
      else if (msg.status === "Delivered") status = "delivered";
      else if (msg.loaded > 0) status = "opened";
      else if (msg.clicked > 0) status = "clicked";
      else if (msg.status === "Bounced") status = "bounced";
      else if (msg.status === "HardFail") status = "hard_bounce";
      else if (msg.status === "SoftFail") status = "soft_bounce";
      else if (msg.status === "Complaint") status = "complained";

      return {
        messageId,
        status,
        details: msg.details ? String(msg.details) : undefined,
        timestamp: new Date(msg.time * 1000).toISOString(),
        attempts: undefined,
      };
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("Postal API error")) {
        throw error;
      }
      throw new Error(
        `Failed to check delivery status: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Retrieve all verified sending domains from Postal.
   */
  async getDomains(): Promise<string[]> {
    const url = `${this.config.postalApiUrl}/domains`;

    try {
      const response = await fetch(url, {
        method: "GET",
        headers: {
          "X-Server-API-Key": this.config.postalApiKey,
          Accept: "application/json",
        },
      });

      if (!response.ok) {
        throw new Error(
          `Postal API error (${response.status}): ${await response.text()}`
        );
      }

      const data = (await response.json()) as {
        status: string;
        data?: Array<{ name: string; verification_status: string }>;
      };

      return (
        data.data
          ?.filter((d) => d.verification_status === "verified")
          .map((d) => d.name) ?? []
      );
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("Postal API error")) {
        throw error;
      }
      throw new Error(
        `Failed to fetch domains: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Check domain health/verification status from Postal.
   */
  async checkDomainHealth(domain: string): Promise<DomainHealth> {
    const url = `${this.config.postalApiUrl}/domains/${encodeURIComponent(domain)}`;

    try {
      const response = await fetch(url, {
        method: "GET",
        headers: {
          "X-Server-API-Key": this.config.postalApiKey,
          Accept: "application/json",
        },
      });

      if (!response.ok) {
        throw new Error(
          `Postal API error (${response.status}): ${await response.text()}`
        );
      }

      const data = (await response.json()) as {
        status: string;
        data?: {
          name: string;
          verification_status: string;
          dkim_status: string;
          spf_status: string;
          dmarc_status: string;
          return_path_status: string;
          created_at: string;
        };
      };

      const d = data.data;
      if (!d) {
        throw new Error(`Domain ${domain} not found in Postal`);
      }

      const verified = d.verification_status === "verified";

      return {
        domain: d.name,
        status: verified ? "active" : "disabled",
        dailyLimit: 200,
        sentToday: 0,
        bounceRate: 0,
        complaintRate: 0,
        openRate: 0,
        clickRate: 0,
        reputation: verified ? 100 : 0,
        lastUsedAt: null,
        createdAt: d.created_at,
        warmupStartedAt: null,
        warmupStage: null,
        dkimVerified: d.dkim_status === "ok",
        spfVerified: d.spf_status === "ok",
        dmarcVerified: d.dmarc_status === "ok",
        returnPath:
          d.return_path_status === "ok" ? domain : undefined,
      };
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("Postal API error")) {
        throw error;
      }
      throw new Error(
        `Failed to check domain health: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
}

/**
 * Simple in-memory SMTP client for testing/dev.
 * Does not actually send email; records sent messages for assertions.
 */
export class InMemorySmtpClient implements PostalSmtpClient {
  public sentMessages: PostalSendRequest[] = [];
  public deliveryStatuses: Map<string, PostalDeliveryStatus> = new Map();
  public domains: string[] = ["test.example.com"];
  private config: SmtpClientConfig;

  constructor(config: Partial<SmtpClientConfig> = {}) {
    this.config = { ...DEFAULT_SMTP_CONFIG, ...config };
  }

  async send(request: PostalSendRequest): Promise<PostalSendResponse> {
    this.sentMessages.push(request);
    const messageId = `msg_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const token = `tkn_${Math.random().toString(36).slice(2, 17)}`;

    this.deliveryStatuses.set(messageId, {
      messageId,
      status: "sent",
      timestamp: new Date().toISOString(),
    });

    return {
      messageId,
      token,
      status: "queued",
      timestamp: new Date().toISOString(),
    };
  }

  async getDeliveryStatus(
    messageId: string
  ): Promise<PostalDeliveryStatus> {
    const status = this.deliveryStatuses.get(messageId);
    if (!status) {
      throw new Error(`Message ${messageId} not found`);
    }
    return status;
  }

  async getDomains(): Promise<string[]> {
    return this.domains;
  }

  async checkDomainHealth(domain: string): Promise<DomainHealth> {
    return {
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
      createdAt: new Date().toISOString(),
      warmupStartedAt: null,
      warmupStage: null,
      dkimVerified: true,
      spfVerified: true,
      dmarcVerified: true,
    };
  }

  /** Set the domains the mock will report. */
  setDomains(domains: string[]): void {
    this.domains = domains;
  }

  /** Inject a delivery status for testing. */
  setDeliveryStatus(messageId: string, status: PostalDeliveryStatus): void {
    this.deliveryStatuses.set(messageId, status);
  }

  /** Clear all recorded state. */
  reset(): void {
    this.sentMessages = [];
    this.deliveryStatuses.clear();
  }
}