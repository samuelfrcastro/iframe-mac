/**
 * Widget universal — o MESMO IframeMacChat/Launcher para qualquer site, com ou sem React.
 * Build IIFE auto-contido (React + supabase-js incluídos): dist/widget.global.js.
 *
 * Uso (uma linha em qualquer HTML):
 *   <script src="/iframe-mac-widget.js" data-channel="bridge-osite" data-gate="claude"></script>
 *
 * data-channel  canal Realtime do site (obrigatório na prática)
 * data-title    título do popup (default "Consola dev")
 * data-brand    cor do botão flutuante (default #2563eb)
 * data-gate     "claude" (default) = só com ?claude=1 · "always" = sempre visível
 */
import { createRoot } from 'react-dom/client';
import { IframeMacLauncher, type IframeMacLauncherProps } from './Launcher';

const script = (typeof document !== 'undefined' ? document.currentScript : null) as HTMLScriptElement | null;
const CFG: IframeMacLauncherProps = {
  channel: script?.dataset.channel || (globalThis as any).IFRAME_MAC_CHANNEL || 'iframe-mac',
  title: script?.dataset.title || 'Consola dev',
  brand: script?.dataset.brand || '#2563eb',
  gate: (script?.dataset.gate as IframeMacLauncherProps['gate']) || 'claude',
};

function mount() {
  const host = document.createElement('div');
  host.id = 'iframe-mac-widget';
  document.body.appendChild(host);
  createRoot(host).render(<IframeMacLauncher {...CFG} />);
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
else mount();
