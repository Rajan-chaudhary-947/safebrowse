import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { AppState } from '../common/types';
import '../styles.css';
import srLogo from "../assets/sr-logo.svg";

function Popup() {
  const [state, setState] = useState<AppState | null>(null);
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');

  useEffect(() => { chrome.runtime.sendMessage({ type: 'GET_STATE' }).then(setState).catch(() => setError('Could not load SafeBrowse.')); }, []);
  if (!state) return <div className="popup loading">Loading SafeBrowse…</div>;

  async function unlock() {
    setError('');
    try {
      const result = await chrome.runtime.sendMessage({ type: 'VERIFY_PIN', pin }) as { ok: boolean; error?: string };
      if (result.error || !result.ok) throw new Error(result.error || 'Incorrect PIN.');
      setPin('');
      setState(await chrome.runtime.sendMessage({ type: 'GET_STATE' }));
    } catch (err) { setError(err instanceof Error ? err.message : 'Incorrect PIN.'); }
  }

  return <main className="popup"><div className="brand-row"><img src={srLogo} alt="SafeBrowse" className="brand-logo"/><div><div className="brand-name">SafeBrowse</div><div className="brand-sub">Web policy & analytics</div></div><span className={`status-dot ${state.settings.protectionEnabled ? 'on' : 'off'}`} /></div><div className="popup-status"><strong>{state.settings.protectionEnabled ? 'Protection enabled' : 'Protection paused'}</strong><span>{state.profiles.find((p) => p.id === state.activeProfileId)?.name} · {state.policies.filter((p) => p.enabled).length} active policies</span></div>{state.settings.pinConfigured && !state.auth.unlocked && <div className="popup-lock"><input inputMode="numeric" type="password" maxLength={8} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} onKeyDown={(e) => { if (e.key === 'Enter') void unlock(); }} placeholder="Parent PIN" /><button className="primary-btn" onClick={() => void unlock()} disabled={pin.length < 4}>Unlock</button></div>}{error && <div className="form-error">{error}</div>}<button className="primary-btn" onClick={() => window.open(chrome.runtime.getURL('dashboard.html'), '_blank', 'noopener,noreferrer')}>Open Parent Console</button><div className="popup-foot">Policies and activity are stored locally by default.</div></main>;
}

createRoot(document.getElementById('root')!).render(<Popup />);
