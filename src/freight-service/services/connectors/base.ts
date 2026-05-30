export interface NormalizedMessageHeader {
  id: string;
  threadId?: string;
}

export interface NormalizedMessage {
  id: string;
  threadId?: string;
  sender: string;
  subject: string;
  body: string;
  receivedAt: string; // ISO String
}

export interface MailConnector {
  listMessages(mailboxConfig: string, token: string, lastCheckedAt?: string): Promise<NormalizedMessageHeader[]>;
  fetchMessage(mailboxConfig: string, token: string, messageId: string): Promise<NormalizedMessage>;
}
