import { MailConnector, NormalizedMessage, NormalizedMessageHeader } from "./base";

export class OutlookConnector implements MailConnector {
  private async makeRequest(token: string, url: string) {
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json"
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Graph API error: ${response.status} - ${errorText}`);
    }

    return response.json();
  }

  async listMessages(mailboxConfig: string, token: string, lastCheckedAt?: string): Promise<NormalizedMessageHeader[]> {
    let url = "https://graph.microsoft.com/v1.0/me/messages?$select=id,conversationId";
    
    if (lastCheckedAt) {
      const isoString = new Date(lastCheckedAt).toISOString();
      url += `&$filter=receivedDateTime ge ${isoString}`;
    }

    const data = await this.makeRequest(token, url);
    const messages = data.value || [];

    return messages.map((msg: any) => ({
      id: msg.id || "",
      threadId: msg.conversationId || undefined
    }));
  }

  async fetchMessage(mailboxConfig: string, token: string, messageId: string): Promise<NormalizedMessage> {
    const url = `https://graph.microsoft.com/v1.0/me/messages/${messageId}`;
    const msg = await this.makeRequest(token, url);

    return {
      id: msg.id || "",
      threadId: msg.conversationId || undefined,
      sender: msg.from?.emailAddress?.address || "",
      subject: msg.subject || "",
      body: msg.body?.content || msg.uniqueBody?.content || "",
      receivedAt: msg.receivedDateTime || new Date().toISOString()
    };
  }
}
