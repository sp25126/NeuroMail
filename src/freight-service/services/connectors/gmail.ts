import { google } from "googleapis";
import { MailConnector, NormalizedMessage, NormalizedMessageHeader } from "./base";

export class GmailConnector implements MailConnector {
  private getGmailClient(token: string) {
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET
    );
    oauth2Client.setCredentials({
      access_token: token
    });
    return google.gmail({ version: "v1", auth: oauth2Client });
  }

  async listMessages(mailboxConfig: string, token: string, lastCheckedAt?: string): Promise<NormalizedMessageHeader[]> {
    const gmail = this.getGmailClient(token);
    
    let query = "";
    if (lastCheckedAt) {
      const epochSeconds = Math.floor(new Date(lastCheckedAt).getTime() / 1000);
      query = `after:${epochSeconds}`;
    }

    const response = await gmail.users.messages.list({
      userId: "me",
      q: query || undefined,
      maxResults: 50
    });

    if (!response.data.messages) {
      return [];
    }

    return response.data.messages.map(msg => ({
      id: msg.id || "",
      threadId: msg.threadId || undefined
    }));
  }

  async fetchMessage(mailboxConfig: string, token: string, messageId: string): Promise<NormalizedMessage> {
    const gmail = this.getGmailClient(token);
    const response = await gmail.users.messages.get({
      userId: "me",
      id: messageId,
      format: "full"
    });

    const payload = response.data.payload;
    const headers = payload?.headers || [];
    
    const subject = headers.find(h => h.name?.toLowerCase() === "subject")?.value || "";
    const sender = headers.find(h => h.name?.toLowerCase() === "from")?.value || "";
    const dateStr = headers.find(h => h.name?.toLowerCase() === "date")?.value || "";
    
    // Parse received date or fallback to internalDate
    let receivedAt = new Date().toISOString();
    if (dateStr) {
      try {
        receivedAt = new Date(dateStr).toISOString();
      } catch {
        if (response.data.internalDate) {
          receivedAt = new Date(parseInt(response.data.internalDate, 10)).toISOString();
        }
      }
    }

    // Extract Body
    let body = "";
    if (payload?.body?.data) {
      body = Buffer.from(payload.body.data, "base64").toString("utf-8");
    } else if (payload?.parts) {
      // Helper to recursively find plain/html parts
      const findBody = (parts: any[]): string => {
        const textPart = parts.find(p => p.mimeType === "text/plain");
        if (textPart?.body?.data) {
          return Buffer.from(textPart.body.data, "base64").toString("utf-8");
        }
        const htmlPart = parts.find(p => p.mimeType === "text/html");
        if (htmlPart?.body?.data) {
          return Buffer.from(htmlPart.body.data, "base64").toString("utf-8");
        }
        // Nesting check
        for (const part of parts) {
          if (part.parts) {
            const nested = findBody(part.parts);
            if (nested) return nested;
          }
        }
        return "";
      };
      body = findBody(payload.parts);
    }

    if (!body && response.data.snippet) {
      body = response.data.snippet;
    }

    return {
      id: messageId,
      threadId: response.data.threadId || undefined,
      sender,
      subject,
      body,
      receivedAt
    };
  }
}
