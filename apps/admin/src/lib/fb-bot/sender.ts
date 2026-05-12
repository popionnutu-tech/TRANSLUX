const GRAPH_API_VERSION = 'v19.0';
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`;

export interface FbSendResult {
  ok: boolean;
  error?: string;
  expiredToken?: boolean;
}

interface FbApiError {
  error?: {
    message?: string;
    code?: number;
    error_subcode?: number;
  };
}

function isExpiredTokenError(data: FbApiError): boolean {
  const code = data?.error?.code;
  return code === 190 || code === 102 || code === 463;
}

export async function sendMessengerMessage(
  pageAccessToken: string,
  recipientPsid: string,
  text: string,
): Promise<FbSendResult> {
  try {
    const res = await fetch(`${GRAPH_BASE}/me/messages?access_token=${encodeURIComponent(pageAccessToken)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        recipient: { id: recipientPsid },
        messaging_type: 'RESPONSE',
        message: { text },
      }),
    });
    if (res.ok) return { ok: true };
    const data = (await res.json().catch(() => ({}))) as FbApiError;
    return {
      ok: false,
      error: data?.error?.message || `HTTP ${res.status}`,
      expiredToken: isExpiredTokenError(data),
    };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

export async function replyToComment(
  pageAccessToken: string,
  commentId: string,
  text: string,
): Promise<FbSendResult> {
  try {
    const res = await fetch(
      `${GRAPH_BASE}/${encodeURIComponent(commentId)}/comments?access_token=${encodeURIComponent(pageAccessToken)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text }),
      },
    );
    if (res.ok) return { ok: true };
    const data = (await res.json().catch(() => ({}))) as FbApiError;
    return {
      ok: false,
      error: data?.error?.message || `HTTP ${res.status}`,
      expiredToken: isExpiredTokenError(data),
    };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

export async function subscribePageWebhooks(
  pageId: string,
  pageAccessToken: string,
): Promise<FbSendResult> {
  try {
    const res = await fetch(
      `${GRAPH_BASE}/${encodeURIComponent(pageId)}/subscribed_apps?access_token=${encodeURIComponent(pageAccessToken)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subscribed_fields: ['messages', 'messaging_postbacks', 'feed'],
        }),
      },
    );
    if (res.ok) return { ok: true };
    const data = (await res.json().catch(() => ({}))) as FbApiError;
    return {
      ok: false,
      error: data?.error?.message || `HTTP ${res.status}`,
      expiredToken: isExpiredTokenError(data),
    };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}
