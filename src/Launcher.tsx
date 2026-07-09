/**
 * IframeMacLauncher — botão flutuante 🤖 + popup com o IframeMacChat.
 * É O launcher canónico da frota: os sites React montam-no diretamente;
 * o widget.global.js (sites sem React) monta exatamente este componente.
 */
import { useEffect, useState, type CSSProperties } from 'react';
import { IframeMacChat } from './IframeMacChat';

export interface IframeMacLauncherProps {
  /** Canal Realtime do site (ex. 'bridge-picanholo'). */
  channel: string;
  /** Título do popup (default 'Consola dev'). */
  title?: string;
  /** Cor do botão flutuante (default azul #2563eb). */
  brand?: string;
  /**
   * 'claude' (default): só aparece com ?claude=1 na URL (persiste em localStorage
   * tb-enabled; ?claude=0 desliga) — para sites públicos. O acesso real é sempre
   * protegido pelo código HMAC; isto só esconde a UI.
   * 'always': aparece sempre — para ferramentas internas.
   */
  gate?: 'claude' | 'always';
}

export function IframeMacLauncher({
  channel,
  title = 'Consola dev',
  brand = '#2563eb',
  gate = 'claude',
}: IframeMacLauncherProps) {
  const [enabled, setEnabled] = useState(gate === 'always');
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (gate === 'always') return;
    const qs = new URLSearchParams(window.location.search);
    const param = qs.get('claude');
    if (param === '1') localStorage.setItem('tb-enabled', '1');
    if (param === '0') localStorage.removeItem('tb-enabled');
    setEnabled(localStorage.getItem('tb-enabled') === '1');
    const onOpen = () => {
      localStorage.setItem('tb-enabled', '1');
      setEnabled(true);
      setOpen(true);
    };
    window.addEventListener('tb-open', onOpen);
    return () => window.removeEventListener('tb-open', onOpen);
  }, [gate]);

  if (!enabled) return null;

  const popupStyle: CSSProperties = expanded
    ? {
        position: 'fixed', top: 12, left: 12, right: 12, bottom: 12, zIndex: 2147483645,
        borderRadius: 16, overflow: 'hidden', background: '#0f1117',
        boxShadow: '0 24px 80px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.1)',
        display: 'flex', flexDirection: 'column',
      }
    : {
        position: 'fixed', bottom: 84, right: 20, zIndex: 2147483645,
        width: 'min(420px, calc(100vw - 40px))', height: 'min(600px, calc(100vh - 120px))',
        borderRadius: 16, overflow: 'hidden', background: '#0f1117',
        boxShadow: '0 20px 60px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.08)',
        display: 'flex', flexDirection: 'column',
      };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        title={title}
        style={{
          position: 'fixed', bottom: 20, right: 20, zIndex: 2147483646,
          width: 52, height: 52, borderRadius: 9999, border: 'none', cursor: 'pointer',
          background: brand, color: '#fff', fontSize: 22,
          boxShadow: open ? '0 0 0 4px rgba(37,99,235,0.3), 0 8px 24px rgba(0,0,0,0.4)' : '0 4px 16px rgba(0,0,0,0.35)',
          transition: 'all 0.15s ease', display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
      >
        {open ? '✕' : '🤖'}
      </button>

      {open && (
        <div style={popupStyle} data-iframe-mac-ignore="true">
          <div
            style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', flexShrink: 0,
              borderBottom: '1px solid rgba(255,255,255,0.07)', background: 'rgba(255,255,255,0.03)',
            }}
          >
            <span style={{ fontSize: 15 }}>🤖</span>
            <div style={{ flex: 1, fontSize: 12, fontWeight: 600, color: '#e2e8f0' }}>{title}</div>
            <button
              onClick={() => setExpanded((e) => !e)}
              style={{ background: 'none', border: 'none', color: '#64748b', fontSize: 14, cursor: 'pointer', padding: '2px 5px' }}
              title={expanded ? 'Recolher' : 'Expandir'}
            >
              {expanded ? '⊡' : '⊞'}
            </button>
            <button
              onClick={() => setOpen(false)}
              style={{ background: 'none', border: 'none', color: '#64748b', fontSize: 16, cursor: 'pointer', padding: '2px 4px' }}
              title="Fechar"
            >
              ✕
            </button>
          </div>
          <div style={{ flex: 1, minHeight: 0 }}>
            <IframeMacChat channel={channel} />
          </div>
        </div>
      )}
    </>
  );
}
