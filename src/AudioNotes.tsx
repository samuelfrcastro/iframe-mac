/**
 * AudioNotes — zona "🎙️ Áudios" do widget flutuante 🤖.
 *
 * Mostra as voice notes RECEBIDAS no WhatsApp da frota já transcritas pelo whisper.
 * As transcrições são PRIVADAS: os gateways (whatsapp-gw :3020 e whatsapp-gw-2 :3025)
 * deixaram de as enviar de volta na conversa, guardam-nas só na mensagem recebida
 * (campos `transcript` + `is_voice`) e o dashboard expõe-nas em
 * GET /api/whatsapp/messages (merge dos dois gateways).
 */
import { useCallback, useEffect, useRef, useState } from 'react';

/** Base do dashboard quando o widget corre noutro site (mesma constante do embed.html). */
export const DASHBOARD_API = 'https://ioc-1.tail215de3.ts.net:4748';
/** localStorage: ts ISO da última vez que o Samuel abriu a zona 🎙️ Áudios. */
const READ_KEY = 'tb-audio-read';

export interface VoiceNote {
  id: string;
  ts: string;
  who: string;
  text: string;
}

interface WaMessage {
  ts?: string;
  dir?: string;
  from?: string;
  participant?: string | null;
  pushName?: string | null;
  id?: string;
  text?: string | null;
  transcript?: string | null;
  is_voice?: boolean;
  raw_type?: string | null;
}

/** JID → nome legível. Sem pushName cai para o número formatado (ou um id curto). */
function prettyFrom(m: WaMessage): string {
  if (m.pushName) return m.pushName;
  const jid = String(m.participant || m.from || '');
  const [user, server] = jid.split('@');
  if (!user) return 'Desconhecido';
  if (server === 'g.us') return 'Grupo';
  // @lid é um id opaco do WhatsApp (não é telefone) — não o mostramos como número.
  if (server === 'lid') return `Contacto ·${user.slice(-4)}`;
  const d = user.replace(/[^0-9]/g, '');
  if (d.length >= 11) return `+${d.slice(0, d.length - 9)} ${d.slice(-9, -6)} ${d.slice(-6, -3)} ${d.slice(-3)}`;
  return d ? `+${d}` : jid;
}

/** Hoje → "14:32"; outro dia → "21/07 14:32". */
function prettyTime(ts: string): string {
  const d = new Date(ts);
  if (isNaN(d.getTime())) return ts;
  const now = new Date();
  const hm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  if (d.toDateString() === now.toDateString()) return hm;
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')} ${hm}`;
}

/**
 * Vai buscar as voice notes transcritas. Tenta primeiro o próprio site (o dashboard
 * serve o widget e a API na mesma origem) e só depois o dashboard por Tailscale.
 * Guarda a base que funcionou para não repetir a tentativa falhada a cada poll.
 */
let resolvedBase: string | null = null;

async function fetchVoiceNotes(apiBase?: string, limit = 200): Promise<VoiceNote[]> {
  const bases = apiBase != null ? [apiBase] : resolvedBase != null ? [resolvedBase] : ['', DASHBOARD_API];
  let lastErr: unknown = null;
  for (const base of bases) {
    try {
      // gw=all → o dashboard junta os dois gateways (whatsapp-gw :3020 + -gw-2 :3025).
      const r = await fetch(`${base}/api/whatsapp/messages?gw=all&limit=${limit}`, { credentials: 'omit' });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const body = await r.json();
      const msgs: WaMessage[] = Array.isArray(body?.messages) ? body.messages : [];
      if (!Array.isArray(body?.messages)) throw new Error('resposta sem messages[]');
      resolvedBase = base;
      const seen = new Set<string>();
      const out: VoiceNote[] = [];
      for (const m of msgs) {
        // Só o que foi RECEBIDO e tem transcrição. is_voice é a marca nova do gateway;
        // aceitamos também raw_type audioMessage para o histórico anterior à mudança.
        const t = typeof m.transcript === 'string' ? m.transcript.trim() : '';
        if (m.dir !== 'in' || !t) continue;
        if (!m.is_voice && m.raw_type !== 'audioMessage') continue;
        const id = m.id || `${m.ts}-${m.from}`;
        if (seen.has(id)) continue; // os dois gateways podem repetir a mesma mensagem
        seen.add(id);
        out.push({ id, ts: m.ts || '', who: prettyFrom(m), text: t });
      }
      out.sort((a, b) => (a.ts < b.ts ? 1 : a.ts > b.ts ? -1 : 0)); // mais recentes primeiro
      return out;
    } catch (e) {
      lastErr = e;
    }
  }
  resolvedBase = null;
  throw lastErr instanceof Error ? lastErr : new Error('falhou');
}

/**
 * Hook das voice notes: polling adaptativo (rápido com a zona aberta, lento e
 * discreto com o widget fechado) + contagem de não lidas desde a última leitura.
 */
export function useVoiceNotes(enabled: boolean, active: boolean, open: boolean, apiBase?: string) {
  const [notes, setNotes] = useState<VoiceNote[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastRead, setLastRead] = useState<string>(() => {
    try { return localStorage.getItem(READ_KEY) || ''; } catch { return ''; }
  });

  const load = useCallback(() => {
    fetchVoiceNotes(apiBase)
      .then((n) => { setNotes(n); setError(null); })
      .catch((e) => setError(e?.message || 'sem ligação ao dashboard'))
      .finally(() => setLoading(false));
  }, [apiBase]);

  const loadRef = useRef(load);
  loadRef.current = load;

  useEffect(() => {
    if (!enabled) return;
    // 25s com a zona 🎙️ aberta · 60s com o widget aberto noutro separador (mantém o
    // badge fresco) · 5 min com o widget fechado (nunca polling agressivo em fundo).
    const period = active ? 25_000 : open ? 60_000 : 300_000;
    loadRef.current();
    const t = setInterval(() => loadRef.current(), period);
    return () => clearInterval(t);
  }, [enabled, active, open]);

  // Abrir a zona marca tudo como lido (guarda o ts da mais recente, não o "agora",
  // para não esconder uma transcrição que chegue no mesmo instante).
  useEffect(() => {
    if (!active || !notes.length) return;
    const newest = notes[0].ts;
    if (newest && newest > lastRead) {
      try { localStorage.setItem(READ_KEY, newest); } catch { /* noop */ }
      setLastRead(newest);
    }
  }, [active, notes, lastRead]);

  const unread = lastRead ? notes.filter((n) => n.ts > lastRead).length : notes.length;
  return { notes, error, loading, unread, reload: load };
}

export function AudioNotesPanel({
  notes,
  error,
  loading,
  onReload,
}: {
  notes: VoiceNote[];
  error: string | null;
  loading: boolean;
  onReload: () => void;
}) {
  return (
    <div style={{ height: '100%', overflowY: 'auto', background: '#0f1117', padding: 10 }}>
      {loading && !notes.length && (
        <div style={{ color: '#64748b', fontSize: 12, padding: 16, textAlign: 'center' }}>a carregar…</div>
      )}

      {error && !notes.length && (
        <div style={{ color: '#f59e0b', fontSize: 12, padding: 16, textAlign: 'center', lineHeight: 1.6 }}>
          Não consegui ler as transcrições ({error}).
          <br />
          <button
            onClick={onReload}
            style={{ marginTop: 10, background: 'rgba(255,255,255,0.08)', border: 'none', color: '#e2e8f0', borderRadius: 6, padding: '5px 12px', fontSize: 12, cursor: 'pointer' }}
          >
            Tentar de novo
          </button>
        </div>
      )}

      {!loading && !error && !notes.length && (
        <div style={{ color: '#64748b', fontSize: 12, padding: 16, textAlign: 'center', lineHeight: 1.6 }}>
          Ainda não há voice notes transcritas.
          <br />
          <span style={{ fontSize: 11 }}>Envia um áudio para 912814143 ou 937857366.</span>
        </div>
      )}

      {notes.map((n) => (
        <div
          key={n.id}
          style={{
            background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)',
            borderRadius: 10, padding: '9px 11px', marginBottom: 8,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 5 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: '#93c5fd', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {n.who}
            </span>
            <span style={{ marginLeft: 'auto', fontSize: 10, color: '#64748b', flexShrink: 0 }}>{prettyTime(n.ts)}</span>
          </div>
          <div style={{ fontSize: 12.5, color: '#e2e8f0', lineHeight: 1.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
            {n.text}
          </div>
        </div>
      ))}
    </div>
  );
}
