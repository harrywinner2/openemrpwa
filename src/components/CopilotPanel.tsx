/**
 * Clinical Co-Pilot chat panel for the patient-portal SPA.
 *
 * Conditionally rendered from PatientDashboardPage based on the
 * /capabilities.php probe — only appears when the OpenEMR backend
 * has Co-Pilot configured. Single-patient mode: the OAuth bearer is
 * pre-scoped to one patient by the auth server, so this panel always
 * answers about that patient with no patient-picker affordance.
 *
 * Plain React + fetch — no router state, no global store. Each turn
 * is a self-contained fetch to chat_oauth.php; the conversation_id is
 * server-issued on the first turn and threaded through subsequent
 * turns to maintain history.
 */

import { useEffect, useRef, useState } from 'react';

import {
  probeCopilotCapabilities,
  sendChatTurn,
  type ChatTurnResponse,
  type CopilotCapabilities,
} from '../api/copilot';

type Turn = {
  role: 'user' | 'assistant' | 'error';
  text: string;
  servedBy?: string;
  podId?: string | null;
  degraded?: boolean;
  retrievalDegraded?: boolean;
};

export function CopilotPanel(): JSX.Element | null {
  const [caps, setCaps] = useState<CopilotCapabilities | null>(null);
  const [open, setOpen] = useState(false);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState('');
  const [pending, setPending] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const threadRef = useRef<HTMLDivElement | null>(null);

  // First-paint capability probe. If chat isn't configured, render nothing.
  useEffect(() => {
    let cancelled = false;
    void probeCopilotCapabilities().then((c) => {
      if (!cancelled) setCaps(c);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Auto-scroll on new turns.
  useEffect(() => {
    if (threadRef.current) {
      threadRef.current.scrollTop = threadRef.current.scrollHeight;
    }
  }, [turns, pending]);

  if (!caps || !caps.chat_enabled) return null;

  function statusPill(): { label: string; className: string; tooltip: string } {
    if (!turns.length) {
      return {
        label: caps?.pod_path_configured ? 'Pods + RAG' : 'PHP only',
        className: caps?.pod_path_configured ? 'pod-rag' : 'php',
        tooltip: 'Healthy. No turns yet this session.',
      };
    }
    const last = turns[turns.length - 1];
    if (last.role === 'error') return { label: 'Error', className: 'php', tooltip: last.text };
    if (last.degraded) return { label: 'PHP fallback', className: 'php', tooltip: 'Pods unreachable; running on PHP path.' };
    if (last.retrievalDegraded) return { label: 'No RAG', className: 'pod-norag', tooltip: 'pgvector offline; chart-only grounding.' };
    if (last.servedBy === 'pod') {
      return {
        label: 'Pods + RAG',
        className: 'pod-rag',
        tooltip: 'Healthy: reasoning pods + guideline corpus' + (last.podId ? ` (pod=${last.podId})` : ''),
      };
    }
    return { label: 'PHP only', className: 'php', tooltip: 'Sidecar pods not configured.' };
  }

  async function onSend() {
    const text = input.trim();
    if (!text || pending) return;
    setInput('');
    setTurns((prev) => [...prev, { role: 'user', text }]);
    setPending(true);
    try {
      const resp: ChatTurnResponse = await sendChatTurn(text, conversationId);
      setConversationId(resp.conversation_id || conversationId);
      setTurns((prev) => [
        ...prev,
        {
          role: 'assistant',
          text: resp.text || '(no response)',
          servedBy: resp.served_by,
          podId: resp.pod_id ?? null,
          degraded: !!resp.degraded,
          retrievalDegraded: !!resp.retrieval_degraded,
        },
      ]);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Network error';
      setTurns((prev) => [...prev, { role: 'error', text: 'Error: ' + msg }]);
    } finally {
      setPending(false);
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void onSend();
    }
  }

  const pill = statusPill();

  return (
    <div className="fixed bottom-0 right-0 z-50 m-4 w-96 max-w-[calc(100vw-2rem)] rounded-lg border border-slate-300 bg-white shadow-xl">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between rounded-t-lg bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
      >
        <span className="flex items-center gap-2">
          <span aria-hidden="true">💬</span>
          <span>Clinical Co-Pilot</span>
        </span>
        <span
          className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
            pill.className === 'pod-rag'
              ? 'bg-emerald-200 text-emerald-900'
              : pill.className === 'pod-norag'
                ? 'bg-amber-200 text-amber-900'
                : 'bg-slate-300 text-slate-800'
          }`}
          title={pill.tooltip}
        >
          {pill.label}
        </span>
      </button>

      {open && (
        <div className="flex h-96 flex-col">
          <div ref={threadRef} className="flex-1 overflow-y-auto px-3 py-2 text-sm">
            {turns.length === 0 ? (
              <p className="my-12 text-center text-slate-500">
                Ask about your chart. Every clinical claim is grounded in your record or a published guideline.
              </p>
            ) : (
              turns.map((t, i) => (
                <div
                  key={i}
                  className={`my-1.5 rounded px-3 py-2 ${
                    t.role === 'user'
                      ? 'ml-8 bg-blue-50 text-slate-800'
                      : t.role === 'assistant'
                        ? 'mr-8 bg-slate-50 text-slate-900'
                        : 'mr-8 bg-rose-50 text-rose-800'
                  }`}
                >
                  {t.text}
                </div>
              ))
            )}
            {pending && (
              <div className="mr-8 my-1.5 rounded bg-slate-50 px-3 py-2 text-slate-500 italic">
                thinking…
              </div>
            )}
          </div>

          <div className="border-t border-slate-200 p-2">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Ask anything about your chart…"
              rows={2}
              disabled={pending}
              className="w-full resize-none rounded border border-slate-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <div className="mt-1 flex items-center justify-between text-[11px] text-slate-500">
              <span>Enter to send · Shift+Enter for newline</span>
              <button
                type="button"
                onClick={() => void onSend()}
                disabled={pending || !input.trim()}
                className="rounded bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                Send
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
