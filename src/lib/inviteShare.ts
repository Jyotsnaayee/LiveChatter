export interface InviteShareLinks {
  inviteUrl: string;
  subject: string;
  message: string;
  whatsappUrl: string;
  gmailUrl: string;
  mailtoUrl: string;
  smsUrl: string;
}

export function buildInviteUrl(code: string): string {
  const origin =
    typeof window !== 'undefined' && window.location?.origin
      ? window.location.origin
      : 'https://livechatter.app';
  return `${origin}/?invite=${encodeURIComponent(code)}`;
}

export function buildDefaultInviteMessage(params: {
  senderName: string;
  senderUsername: string;
  code: string;
  serverName?: string;
  customNote?: string;
}): string {
  const inviteUrl = buildInviteUrl(params.code);
  const intro = params.serverName
    ? `Hey! ${params.senderName} (@${params.senderUsername}) invited you to connect and join "${params.serverName}" on LiveChatter.`
    : `Hey! ${params.senderName} (@${params.senderUsername}) invited you to connect on LiveChatter.`;
  const noteLine = params.customNote?.trim() ? `\n\n"${params.customNote.trim()}"` : '';
  return `${intro}${noteLine}\n\nInvite Code: ${params.code}\nOpen in LiveChatter: ${inviteUrl}`;
}

export function buildInviteShareLinks(params: {
  code: string;
  senderName: string;
  serverName?: string;
  message: string;
  recipientPhone?: string;
  recipientEmail?: string;
}): InviteShareLinks {
  const inviteUrl = buildInviteUrl(params.code);
  const subject = params.serverName
    ? `${params.senderName} invited you to ${params.serverName} on LiveChatter`
    : `${params.senderName} invited you to connect on LiveChatter (Code: ${params.code})`;

  const encodedMessage = encodeURIComponent(params.message);
  const encodedSubject = encodeURIComponent(subject);

  // WhatsApp expects digits only without + or spaces when a phone number is provided
  const waDigits = (params.recipientPhone || '').replace(/\D/g, '');
  const whatsappUrl = waDigits
    ? `https://wa.me/${waDigits}?text=${encodedMessage}`
    : `https://wa.me/?text=${encodedMessage}`;

  // Gmail web compose (opens Gmail app on mobile / Gmail compose on desktop)
  const cleanEmail = (params.recipientEmail || '').trim();
  const gmailParams = new URLSearchParams({
    view: 'cm',
    fs: '1',
    su: subject,
    body: params.message,
  });
  if (cleanEmail) {
    gmailParams.set('to', cleanEmail);
  }
  const gmailUrl = `https://mail.google.com/mail/?${gmailParams.toString()}`;

  // Standard mailto fallback for Apple Mail / Outlook
  const mailtoUrl = `mailto:${encodeURIComponent(cleanEmail)}?subject=${encodedSubject}&body=${encodedMessage}`;

  // Cross-platform SMS URI (?&body= works on both iOS Messages and Android Messages)
  const smsPhone = (params.recipientPhone || '').replace(/[^+\d]/g, '');
  const smsUrl = `sms:${smsPhone}?&body=${encodedMessage}`;

  return {
    inviteUrl,
    subject,
    message: params.message,
    whatsappUrl,
    gmailUrl,
    mailtoUrl,
    smsUrl,
  };
}
