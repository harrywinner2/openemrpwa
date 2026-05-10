/**
 * Co-Pilot chat client for the patient-portal SPA.
 *
 * Talks to OpenEMR's chat_oauth.php endpoint with the SPA's stored
 * OAuth bearer. Single-patient mode by construction — the auth server
 * already bound the token to one patient at consent time, so the
 * `current_patient_id` parameter is server-derived from the JWT and we
 * just ship the user message.
 */

import { loadServerConfig } from '../config/serverConfig';
import { getToken } from '../auth/tokenStore';

export type CopilotCapabilities = {
  chat_enabled: boolean;
  pod_path_configured: boolean;
  version: string;
};

export type ChatTurnResponse = {
  text: string;
  passed: boolean;
  cited_sources: Array<{ category: string; recordId: string; date?: string; path?: string }>;
  findings: Array<{ issue: string; severity: string; message: string; context?: unknown }>;
  tools_called: string[];
  trace_id: string;
  conversation_id: string;
  total_tokens: number;
  served_by: string;
  pod_id?: string | null;
  degraded: boolean;
  degraded_reason?: string | null;
  retrieval_degraded?: boolean;
  degraded_components?: string[];
  error?: string | null;
};

class CopilotError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
  }
}

function copilotBase(): string {
  const cfg = loadServerConfig();
  if (!cfg) throw new CopilotError(0, 'No OpenEMR server configured');
  // The capabilities + chat endpoints sit under the OpenEMR root
  // (sibling to /apis/default/fhir, not under it).
  return cfg.fhirBaseUrl.replace(/\/apis\/default\/fhir$/, '');
}

export async function probeCopilotCapabilities(): Promise<CopilotCapabilities | null> {
  let url: string;
  try {
    url = copilotBase() + '/interface/ai_assistant/capabilities.php';
  } catch {
    return null;
  }
  try {
    const res = await fetch(url, { method: 'GET' });
    if (!res.ok) return null;
    return (await res.json()) as CopilotCapabilities;
  } catch {
    return null;
  }
}

export async function sendChatTurn(message: string, conversationId: string | null): Promise<ChatTurnResponse> {
  const token = getToken();
  if (!token) throw new CopilotError(401, 'Not authenticated');
  const url = copilotBase() + '/interface/ai_assistant/chat_oauth.php';
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'Authorization': `Bearer ${token.access_token}`,
    },
    body: JSON.stringify({
      user_message: message,
      conversation_id: conversationId,
    }),
  });
  const raw = await res.text();
  let body: ChatTurnResponse | { error?: string; text?: string };
  try {
    body = raw === '' ? ({ error: 'empty_response' } as const) : (JSON.parse(raw) as ChatTurnResponse);
  } catch {
    body = { error: 'invalid_response', text: raw.slice(0, 200) };
  }
  if (!res.ok) {
    const errorBody = body as { error?: string; text?: string };
    throw new CopilotError(res.status, errorBody.text ?? errorBody.error ?? `HTTP ${res.status}`);
  }
  return body as ChatTurnResponse;
}

export { CopilotError };
