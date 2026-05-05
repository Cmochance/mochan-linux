import { apiJSON } from './api';

export type MailSecurity = 'tls' | 'starttls' | 'plain';

export interface ImapAccount {
  host: string;
  port: number;
  security: MailSecurity;
  username: string;
  password: string;
}

export interface SmtpAccount {
  host: string;
  port: number;
  security: MailSecurity;
  username: string;
  password: string;
  from: string;
}

export interface MailFolder {
  name: string;
  delimiter?: string;
}

export interface MailMessageSummary {
  uid: string;
  folder: string;
  from: string;
  to?: string;
  subject: string;
  date?: string;
  size?: number;
  seen: boolean;
}

export interface MailAttachment {
  filename: string;
  content_type: string;
  size: number;
}

export interface MailMessageDetail extends MailMessageSummary {
  body_text: string;
  body_html?: string;
  attachments?: MailAttachment[];
}

export interface OutgoingMail {
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  body: string;
  attachments?: Array<{ path: string }>;
}

export const mailClient = {
  connect: (imap: ImapAccount, smtp?: SmtpAccount) =>
    apiJSON<{ imap?: { ok: boolean; folders: MailFolder[] }; smtp?: { ok: boolean } }>('/api/mail/connect', {
      method: 'POST',
      body: JSON.stringify({ imap, smtp }),
    }),

  folders: (account: ImapAccount) =>
    apiJSON<{ folders: MailFolder[] }>('/api/mail/folders', {
      method: 'POST',
      body: JSON.stringify({ account }),
    }),

  messages: (account: ImapAccount, folder: string, limit = 25) =>
    apiJSON<{ messages: MailMessageSummary[] }>('/api/mail/messages', {
      method: 'POST',
      body: JSON.stringify({ account, folder, limit }),
    }),

  message: (account: ImapAccount, folder: string, uid: string) =>
    apiJSON<MailMessageDetail>('/api/mail/message', {
      method: 'POST',
      body: JSON.stringify({ account, folder, uid }),
    }),

  send: (account: SmtpAccount, message: OutgoingMail) =>
    apiJSON<{ ok: boolean }>('/api/mail/send', {
      method: 'POST',
      body: JSON.stringify({ account, message }),
    }),
};
