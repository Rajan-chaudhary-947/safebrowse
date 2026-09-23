import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { ActivityEvent, AppState, Policy, Profile } from '../common/types';
import type { BackupBundle } from '../common/storage';
import { CATEGORY_CATALOG, CATEGORY_NAMES, WEEK_DAYS } from '../common/catalog';
import { aggregateAnalytics } from '../common/analytics';
import { domainMatches, formatDateTime, formatRelativeTime, normalizeDomain, normalizeUrlPattern, policySpecificity, uid } from '../common/utils';
import '../styles.css';
import srLogo from "../assets/sr-logo.svg";


type Tab = 'overview' | 'policies' | 'activity' | 'simulator' | 'profiles' | 'settings';
type Theme = "light" | "dark";

const emptyPolicy = (): Policy => ({
  id: uid('policy'),
  name: 'New Policy',
  type: 'DOMAIN',
  targets: [''],
  action: 'BLOCK',
  priority: 100,
  enabled: true,
  schedule: { enabled: false, days: [1, 2, 3, 4, 5], start: '08:00', end: '18:00' },
  createdAt: Date.now(),
  updatedAt: Date.now()
});

const profileColors = ['#2d64b6', '#6b4bd7', '#0f8a78', '#b26a21', '#ad4d62'];

async function send<T = unknown>(message: unknown): Promise<T> {
  const result = await chrome.runtime.sendMessage(message) as T | { error: string };
  if (result && typeof result === 'object' && 'error' in result && typeof result.error === 'string') throw new Error(result.error);
  return result as T;
}

function Dashboard() {
  const [state, setState] = useState<AppState | null>(null);
  const [tab, setTab] = useState<Tab>('overview');
  const [editing, setEditing] = useState<Policy | null>(null);
  const [simUrl, setSimUrl] = useState('https://youtube.com/');
  const [simResult, setSimResult] = useState<{ winner: Policy | null; matches: Policy[] } | null>(null);
  const [toast, setToast] = useState('');
  const importInput = useRef<HTMLInputElement>(null);
  const [theme, setTheme] = useState<Theme>(() => {
    return (
      (localStorage.getItem("safebrowse-theme") as Theme) ||
      "light"
    );
  });
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("safebrowse-theme", theme);
  }, [theme]);

  useEffect(() => { void refresh(); }, []);
  useEffect(() => {
    const onStorageChanged = (
      changes: {
        [key: string]: chrome.storage.StorageChange;
      },
      areaName: string
    ) => {
      if (
        areaName === 'local' &&
        changes.profileData
      ) {
        void refresh();
      }
    };

    chrome.storage.onChanged.addListener(
      onStorageChanged
    );

    return () => {
      chrome.storage.onChanged.removeListener(
        onStorageChanged
      );
    };
  }, []);
  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(''), 3000);
    return () => clearTimeout(id);
  }, [toast]);

  async function refresh() {
    try {
      setState(await send<AppState>({ type: 'GET_STATE' }));
    } catch (error) {
      setToast(
        error instanceof Error
          ? error.message
          : 'Could not load SafeBrowse.'
      );
    }
  }

  // Hooks must always run in the same order on every render.
  // state is null during the initial render, so use safe empty values here.
  const analytics = useMemo(
    () => aggregateAnalytics(state?.events ?? [], state?.policies ?? []),
    [state?.events, state?.policies]
  );

  if (!state) {
    return <div className="page loading">Loading SafeBrowse…</div>;
  }

  const currentState = state;
  const canManage = !state.settings.pinConfigured || state.auth.unlocked;
  const activePolicies = state.policies.filter(
    (policy) => policy.enabled
  ).length;

  async function run(action: () => Promise<void>) {
    try { await action(); }
    catch (error) { setToast(error instanceof Error ? error.message : 'Action failed.'); }
  }

  async function savePolicy(policy: Policy) {
    if (!policy.name.trim()) throw new Error('Policy name is required.');
    if (policy.schedule.enabled && policy.schedule.days.length === 0) throw new Error('Select at least one schedule day.');
    if (!Number.isInteger(policy.priority) || policy.priority < 1 || policy.priority > 1000) throw new Error('Priority must be an integer from 1 to 1000.');
    const targets = policy.targets.map((target) => target.trim()).filter(Boolean);
    if (!targets.length) throw new Error('Add at least one target.');
    const clean: Policy = { ...policy, name: policy.name.trim().slice(0, 80), updatedAt: Date.now(), targets };
    if (clean.type === 'DOMAIN') clean.targets = targets.map(normalizeDomain);
    if (clean.type === 'URL_PATTERN') clean.targets = targets.map(normalizeUrlPattern);
    await send({ type: 'UPSERT_POLICY', policy: clean });
    await refresh();
    setEditing(null);
    setToast('Policy saved. Browser rules rebuilt.');
  }

  async function deletePolicy(id: string) {
    await send({ type: 'DELETE_POLICY', policyId: id });
    await refresh();
    setToast('Policy deleted.');
  }

  async function toggleProtection() {
    const next = !currentState.settings.protectionEnabled;
    await send({ type: 'TOGGLE_PROTECTION', enabled: next });
    await refresh();
    setToast(next ? 'Protection enabled.' : 'Protection paused.');
  }

  async function switchProfile(profileId: string) {
    await send({ type: 'SWITCH_PROFILE', profileId });
    setSimResult(null);
    await refresh();
    setToast(`Switched to ${currentState.profiles.find((profile) => profile.id === profileId)?.name ?? 'profile'}.`);
  }

  async function exportBackup() {
    const bundle = await send<BackupBundle>({ type: 'EXPORT_BACKUP' });
    const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `safebrowse-backup-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    await send({ type: 'LOG_EVENT', event: { id: crypto.randomUUID(), kind: 'EXPORT', timestamp: Date.now(), profileId: currentState.activeProfileId } });
    setToast('Backup exported. PIN hashes are never included.');
  }

  async function importBackup(file: File) {
    const text = await file.text();
    let parsed: unknown;
    try { parsed = JSON.parse(text); } catch { throw new Error('The selected file is not valid JSON.'); }
    await send({ type: 'IMPORT_BACKUP', bundle: parsed });
    await refresh();
    setToast('Backup restored. Current parent PIN was preserved.');
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-row sidebar-brand">
          <img
            src={srLogo}
            alt="SafeBrowse"
            className="brand-logo"
          />
          <div><div className="brand-name">SafeBrowse</div><div className="brand-sub">Policy & analytics</div></div>
        </div>
        <nav>
          {([
            ['overview', 'Overview'], ['policies', 'Policies'], ['activity', 'Activity'], ['simulator', 'Simulator'], ['profiles', 'Profiles'], ['settings', 'Settings']
          ] as [Tab, string][]).map(([item, label]) => (
            <button key={item} className={`nav-btn ${tab === item ? 'active' : ''}`} onClick={() => setTab(item)}>{label}</button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="tiny-label">CURRENT PROFILE</div>
          <div className="profile-chip"><span className="profile-dot" style={{ background: state.profiles.find((p) => p.id === state.activeProfileId)?.color }} />{state.profiles.find((p) => p.id === state.activeProfileId)?.name}</div>
          <div className="tiny-label protection-label">PROTECTION</div>
          <button className={`protection-chip ${state.settings.protectionEnabled ? 'enabled' : 'paused'}`} onClick={() => void run(toggleProtection)} disabled={!canManage}><span className="status-dot" />{state.settings.protectionEnabled ? 'Enabled' : 'Paused'}</button>
        </div>
      </aside>

      <main className="content">
        <header className="topbar">
          <div>
            <div className="eyebrow">WEB POLICY CONSOLE</div>
            <h1>{tab[0].toUpperCase() + tab.slice(1)}</h1>
          </div>

          <div className="topbar-actions">
            <label className="profile-select-label">
              <span className="tiny-label">PROFILE</span>
              <select
                value={state.activeProfileId}
                onChange={(e) =>
                  void run(() => switchProfile(e.target.value))
                }
                disabled={!canManage}
              >
                {state.profiles.map((profile) => (
                  <option value={profile.id} key={profile.id}>
                    {profile.name}
                  </option>
                ))}
              </select>
            </label>

            {state.settings.pinConfigured && (
              <button
                className="secondary-btn compact"
                onClick={() =>
                  void run(async () => {
                    await send({ type: "LOCK_ADMIN" });
                    await refresh();
                    setToast("Parent console locked.");
                  })
                }
              >
                {state.auth.unlocked ? "Lock console" : "Locked"}
              </button>
            )}

            {canManage && (
              <button
                className="primary-btn compact"
                onClick={() => setEditing(emptyPolicy())}
              >
                + New policy
              </button>
            )}

            {/* Theme toggle */}
            <button
              type="button"
              className="icon-btn"
              title={`Switch to ${theme === "dark" ? "light" : "dark"
                } mode`}
              aria-label={`Switch to ${theme === "dark" ? "light" : "dark"
                } mode`}
              onClick={() => {
                setTheme((current) =>
                  current === "dark" ? "light" : "dark"
                );
              }}
            >
              {theme === "dark" ? "☀" : "☾"}
            </button>
          </div>
        </header>

        {!canManage ? (
          <LockScreen onUnlock={async () => { await refresh(); }} />
        ) : (
          <>
            {tab === 'overview' && <Overview state={state} analytics={analytics} activePolicies={activePolicies} onTab={setTab} />}
            {tab === 'policies' && <Policies state={state} onEdit={setEditing} onDelete={(id) => void run(() => deletePolicy(id))} />}
            {tab === 'activity' && <Activity events={state.events} onClear={() => void run(async () => { await send({ type: 'CLEAR_ACTIVITY' }); await refresh(); setToast('Activity history cleared.'); })} />}
            {tab === 'simulator' && <Simulator url={simUrl} setUrl={setSimUrl} result={simResult} onRun={() => void run(async () => setSimResult(await send<{ winner: Policy | null; matches: Policy[] }>({ type: 'SIMULATE', url: simUrl })))} />}
            {tab === 'profiles' && <Profiles state={state} onRefresh={refresh} onToast={setToast} />}
            {tab === 'settings' && <Settings state={state} onRefresh={refresh} onExport={() => void run(exportBackup)} onImport={() => importInput.current?.click()} onToast={setToast} />}
          </>
        )}

        <input ref={importInput} type="file" accept="application/json,.json" hidden onChange={(e) => { const file = e.target.files?.[0]; if (file) void run(() => importBackup(file)); e.target.value = ''; }} />
        <footer className="dashboard-footer">
          <div className="dashboard-footer-brand">
            <span className="footer-signature">Rajan Chaudhary</span>
            <span className="footer-role">Full-Stack Developer</span>
          </div>

          <a
            href="https://rajanchaudhary947.vercel.app"
            target="_blank"
            rel="noopener noreferrer"
            className="footer-link"
          >
            Portfolio ↗
          </a>
        </footer>
      </main>

      {editing && canManage && <PolicyModal policy={editing} onClose={() => setEditing(null)} onSave={(policy) => void run(() => savePolicy(policy))} />}
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

function LockScreen({ onUnlock }: { onUnlock: () => Promise<void> }) {
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function unlock() {
    setBusy(true); setError('');
    try {
      const result = await send<{ ok: boolean }>({ type: 'VERIFY_PIN', pin });
      if (!result.ok) throw new Error('Incorrect PIN.');
      await onUnlock();
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not unlock.'); }
    finally { setBusy(false); }
  }
  return <div className="lock-screen"><div className="lock-card"><div className="brand-mark large">S</div><div className="eyebrow">PARENT CONSOLE</div><h2>SafeBrowse is locked</h2><p>Enter the parent PIN to view policies, activity and analytics.</p><input autoFocus inputMode="numeric" type="password" maxLength={8} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} onKeyDown={(e) => { if (e.key === 'Enter') void unlock(); }} placeholder="4–8 digit PIN" /><button className="primary-btn" onClick={() => void unlock()} disabled={busy || pin.length < 4}>{busy ? 'Checking…' : 'Unlock console'}</button>{error && <div className="form-error">{error}</div>}</div></div>;
}

function Overview({ state, analytics, activePolicies, onTab }: { state: AppState; analytics: ReturnType<typeof aggregateAnalytics>; activePolicies: number; onTab: (tab: Tab) => void }) {
  return <section className="section-stack">
    <div className="hero-grid">
      <div className="hero-panel">
        <div className="hero-kicker">LOCAL-FIRST CONTROL</div>
        <h2>Define what the browser can access — then see what the rules actually did.</h2>
        <p>Policies, schedules, enforcement and analytics stay on this browser. Sync is optional and only synchronizes policy configuration, not activity history.</p>
        <button className="secondary-btn" onClick={() => onTab('policies')}>Manage policies →</button>
      </div>
      <div className="metric-grid">
        <Metric label="Active policies" value={activePolicies} note={`${state.policies.length} total`} />
        <Metric label="Blocked today" value={analytics.blockedToday} note={`${analytics.blocked7Days} in 7 days`} />
        <Metric label="Unique domains" value={analytics.uniqueDomains} note="blocked destinations" />
        <Metric label="Active categories" value={new Set(state.policies.filter((p) => p.type === 'CATEGORY').flatMap((p) => p.targets)).size} note="configured" />
      </div>
    </div>

    <div className="chart-grid">
      <ChartPanel title="7-day blocked activity" eyebrow="TREND"><div className="daily-chart">{analytics.daily.map((point) => <div className="daily-column" key={point.timestamp} title={`${point.label}: ${point.count} blocked`}><div className="daily-bar" style={{ height: `${Math.max(6, analytics.daily.every((x) => x.count === 0) ? 6 : point.count / Math.max(...analytics.daily.map((x) => x.count), 1) * 100)}%` }} /><span>{point.label}</span><b>{point.count}</b></div>)}</div></ChartPanel>
      <ChartPanel title="Blocked by hour" eyebrow="PATTERN"><div className="hour-chart">{analytics.hourly.map((point) => <div className="hour-column" key={point.hour} title={`${String(point.hour).padStart(2, '0')}:00 — ${point.count} blocked`}><div className="hour-bar" style={{ height: `${Math.max(5, point.count / Math.max(...analytics.hourly.map((x) => x.count), 1) * 100)}%` }} /></div>)}</div><div className="hour-labels"><span>12 AM</span><span>6 AM</span><span>12 PM</span><span>6 PM</span><span>11 PM</span></div></ChartPanel>
    </div>

    <div className="two-col">
      <RankedList title="Top blocked destinations" items={analytics.byDomain} empty="No blocked destinations yet." />
      <RankedList title="Policy impact" items={analytics.byPolicy} empty="No policy matches yet." />
    </div>

    <div className="panel"><div className="panel-header"><div><div className="eyebrow">RECENT ACTIVITY</div><h3>Latest events</h3></div><button className="text-btn" onClick={() => onTab('activity')}>View all</button></div><ActivityTable events={state.events.slice(0, 6)} /></div>
  </section>;
}

function Metric({ label, value, note }: { label: string; value: number | string; note: string }) { return <div className="metric"><span>{label}</span><strong>{value}</strong><small>{note}</small></div>; }
function ChartPanel({ title, eyebrow, children }: { title: string; eyebrow: string; children: React.ReactNode }) { return <div className="panel chart-panel"><div className="panel-header"><div><div className="eyebrow">{eyebrow}</div><h3>{title}</h3></div></div>{children}</div>; }
function RankedList({ title, items, empty }: { title: string; items: [string, number][]; empty: string }) { const max = items[0]?.[1] ?? 1; return <div className="panel"><div className="panel-header"><div><div className="eyebrow">ANALYTICS</div><h3>{title}</h3></div></div>{items.length ? <div className="bars">{items.slice(0, 6).map(([name, count]) => <div className="bar-row" key={name}><div className="bar-label"><span>{name}</span><b>{count}</b></div><div className="bar-track"><div className="bar-fill" style={{ width: `${Math.max(5, count / max * 100)}%` }} /></div></div>)}</div> : <Empty text={empty} />}</div>; }

function Policies({ state, onEdit, onDelete }: { state: AppState; onEdit: (policy: Policy) => void; onDelete: (id: string) => void }) {
  return <section className="section-stack"><div className="policy-summary"><div><strong>{state.policies.length} policies</strong><span className="muted"> Higher priority wins; at equal priority, more specific targets win, then ALLOW wins ties.</span></div></div><div className="policy-grid">{state.policies.map((policy) => <PolicyCard key={policy.id} policy={policy} all={state.policies} onEdit={onEdit} onDelete={onDelete} />)}{state.policies.length === 0 && <Empty text="No policies yet. Create your first rule." />}</div></section>;
}

function PolicyCard({ policy, all, onEdit, onDelete }: { policy: Policy; all: Policy[]; onEdit: (p: Policy) => void; onDelete: (id: string) => void }) {
  const conflicts = all.filter((other) => other.id !== policy.id && policiesPotentiallyOverlap(policy, other)).length;
  const specificity = policy.targets.reduce((max, target) => Math.max(max, policySpecificity(policy, target)), 0);
  return <div className="policy-card"><div className="policy-card-head"><div><span className={`pill ${policy.action.toLowerCase()}`}>{policy.action}</span><span className="type-pill">{policy.type.replace('_', ' ')}</span></div><span className={`mini-status ${policy.enabled ? 'enabled' : 'disabled'}`}>{policy.enabled ? 'Active' : 'Off'}</span></div><h3>{policy.name}</h3><div className="target-list">{policy.targets.slice(0, 5).map((target) => <span key={target}>{target}</span>)}{policy.targets.length > 5 && <span>+{policy.targets.length - 5} more</span>}</div><div className="policy-meta"><span>Priority {policy.priority}</span><span>{policy.schedule.enabled ? `${policy.schedule.start}–${policy.schedule.end}` : 'Always'}</span></div><div className="policy-insights"><span>Specificity {specificity}</span>{conflicts > 0 && <span className="conflict-badge">{conflicts} overlap{conflicts === 1 ? '' : 's'}</span>}</div><div className="card-actions"><button className="text-btn" onClick={() => onEdit(policy)}>Edit</button><button className="danger-btn" onClick={() => { if (window.confirm(`Delete policy “${policy.name}”?`)) onDelete(policy.id); }}>Delete</button></div></div>;
}

function policiesPotentiallyOverlap(a: Policy, b: Policy): boolean {
  if (a.type === 'CATEGORY' && b.type === 'CATEGORY') return a.targets.some((target) => b.targets.includes(target));
  if (a.type === 'URL_PATTERN' && b.type === 'URL_PATTERN') return a.targets.some((x) => b.targets.some((y) => x.startsWith(y) || y.startsWith(x)));
  const aDomains = a.type === 'DOMAIN' || a.type === 'CATEGORY' ? safeExpand(a) : [];
  const bDomains = b.type === 'DOMAIN' || b.type === 'CATEGORY' ? safeExpand(b) : [];
  if (a.type === 'URL_PATTERN') return bDomains.some((domain) => a.targets.some((url) => { try { return domainMatches(new URL(url).hostname, domain); } catch { return false; } }));
  if (b.type === 'URL_PATTERN') return aDomains.some((domain) => b.targets.some((url) => { try { return domainMatches(new URL(url).hostname, domain); } catch { return false; } }));
  return aDomains.some((x) => bDomains.some((y) => domainMatches(x, y) || domainMatches(y, x)));
}
function safeExpand(policy: Policy): string[] { try { return policy.type === 'CATEGORY' ? policy.targets.flatMap((category) => CATEGORY_CATALOG[category] ?? []).map(normalizeDomain) : policy.targets.map(normalizeDomain); } catch { return []; } }

function Activity({ events, onClear }: { events: ActivityEvent[]; onClear: () => void }) {
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState('ALL');
  const filtered = events.filter((event) => (kind === 'ALL' || event.kind === kind) && (`${event.domain ?? ''} ${event.policyName ?? ''} ${event.detail ?? ''}`).toLowerCase().includes(query.toLowerCase()));
  return <section className="section-stack"><div className="panel"><div className="panel-header"><div><div className="eyebrow">LOCAL ACTIVITY</div><h3>{events.length} retained events</h3></div><button className="danger-btn" onClick={() => { if (window.confirm('Clear all activity for this profile?')) onClear(); }}>Clear activity</button></div><div className="activity-filters"><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search domain, policy or event…" /><select value={kind} onChange={(e) => setKind(e.target.value)}><option value="ALL">All events</option><option value="BLOCKED_REQUEST">Blocked requests</option><option value="POLICY_CREATED">Policy created</option><option value="POLICY_UPDATED">Policy updated</option><option value="POLICY_DELETED">Policy deleted</option><option value="PROFILE_SWITCHED">Profile switched</option><option value="IMPORT">Imports</option><option value="EXPORT">Exports</option></select></div><ActivityTable events={filtered} /></div></section>;
}

function ActivityTable({ events }: { events: ActivityEvent[] }) { return events.length ? <div className="activity-list">{events.map((event) => <div className="activity-row" key={event.id}><div className={`activity-icon ${event.kind === 'BLOCKED_REQUEST' ? 'blocked-icon' : ''}`}>{event.kind === 'BLOCKED_REQUEST' ? '×' : '•'}</div><div className="activity-main"><strong>{event.kind.replaceAll('_', ' ')}</strong><span>{event.domain ?? event.policyName ?? event.detail ?? 'SafeBrowse'}</span>{event.category && <small>{event.category}</small>}</div><div className="activity-time" title={formatDateTime(event.timestamp)}>{formatRelativeTime(event.timestamp)}</div></div>)}</div> : <Empty text="No matching activity." />; }

function Simulator({ url, setUrl, result, onRun }: { url: string; setUrl: (v: string) => void; result: { winner: Policy | null; matches: Policy[] } | null; onRun: () => void }) {
  return <section className="section-stack"><div className="panel simulator"><div className="eyebrow">POLICY SIMULATOR</div><h2>Test a URL against the active policy set.</h2><p>The simulator runs the same policy precedence model used to construct the browser rules.</p><div className="sim-row"><input value={url} onChange={(e) => setUrl(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') onRun(); }} placeholder="https://example.com/" /><button className="primary-btn" onClick={onRun}>Evaluate</button></div>{result && <><div className={`sim-result ${result.winner?.action.toLowerCase() ?? 'allow'}`}><div><span className="eyebrow">DECISION</span><h3>{result.winner?.action ?? 'ALLOW'}</h3></div>{result.winner && <div className="sim-details"><span>{result.winner.name}</span><span>Priority {result.winner.priority}</span><span>{result.winner.type.replace('_', ' ')}</span></div>}</div><div className="match-table"><div className="eyebrow">MATCHED POLICIES</div>{result.matches.length ? result.matches.map((policy, index) => <div className="match-row" key={policy.id}><span>#{index + 1}</span><strong>{policy.name}</strong><span>{policy.action}</span><span>Priority {policy.priority}</span></div>) : <Empty text="No active policy matches this URL." />}</div></>}</div></section>;
}

function Profiles({ state, onRefresh, onToast }: { state: AppState; onRefresh: () => Promise<void>; onToast: (message: string) => void }) {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  async function add() {
    if (!name.trim()) { onToast('Profile name is required.'); return; }
    setBusy(true);
    try {
      const profile: Profile = { id: uid('profile'), name: name.trim().slice(0, 40), color: profileColors[state.profiles.length % profileColors.length], createdAt: Date.now(), updatedAt: Date.now() };
      await send({ type: 'CREATE_PROFILE', profile });
      setName(''); await onRefresh(); onToast(`Profile “${profile.name}” created.`);
    } catch (error) { onToast(error instanceof Error ? error.message : 'Could not create profile.'); }
    finally { setBusy(false); }
  }
  async function remove(profile: Profile) {
    if (state.profiles.length <= 1) { onToast('At least one profile must remain.'); return; }
    if (!window.confirm(`Delete profile “${profile.name}” and its policies/activity?`)) return;
    try { await send({ type: 'DELETE_PROFILE', profileId: profile.id }); await onRefresh(); onToast('Profile deleted.'); }
    catch (error) { onToast(error instanceof Error ? error.message : 'Could not delete profile.'); }
  }
  return <section className="section-stack"><div className="panel"><div className="eyebrow">PROFILES</div><h2>Separate policies by person or use case.</h2><p>Each profile has its own policy set and local activity log. Only the active profile is enforced.</p><div className="profile-create"><input value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void add(); }} placeholder="e.g. Study Mode, Child 1" /><button className="primary-btn" onClick={() => void add()} disabled={busy}>{busy ? 'Creating…' : 'Create profile'}</button></div></div><div className="profile-list">{state.profiles.map((profile) => <div className={`profile-row ${profile.id === state.activeProfileId ? 'current' : ''}`} key={profile.id}><div className="profile-main"><span className="profile-avatar" style={{ background: profile.color }}>{profile.name.slice(0, 1).toUpperCase()}</span><div><strong>{profile.name}</strong><span>{profile.id === state.activeProfileId ? 'Currently enforced' : 'Inactive profile'}</span></div></div><div><span className="profile-id">{profile.id}</span>{state.profiles.length > 1 && <button className="danger-btn" onClick={() => void remove(profile)}>Delete</button>}</div></div>)}</div></section>;
}

function Settings({ state, onRefresh, onExport, onImport, onToast }: { state: AppState; onRefresh: () => Promise<void>; onExport: () => void; onImport: () => void; onToast: (message: string) => void }) {
  const [retention, setRetention] = useState(state.settings.retentionDays);
  const [maxEntries, setMaxEntries] = useState(state.settings.maxLogEntries);
  const [currentPin, setCurrentPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const isChanging = state.settings.pinConfigured;

  async function savePin() {
    try {
      if (newPin !== confirmPin) throw new Error('New PIN and confirmation do not match.');
      await send({ type: 'SET_PIN', pin: newPin, currentPin: isChanging ? currentPin : undefined });
      setCurrentPin(''); setNewPin(''); setConfirmPin(''); await onRefresh(); onToast(isChanging ? 'Parent PIN changed.' : 'Parent PIN enabled.');
    } catch (error) { onToast(error instanceof Error ? error.message : 'Could not save PIN.'); }
  }

  return <section className="section-stack">
    <div className="panel"><div className="eyebrow">SECURITY</div><h2>{isChanging ? 'Parent console protection' : 'Protect policy changes with a PIN'}</h2><p>The PIN is stored as a salted PBKDF2 hash. It is not included in backups or Chrome Sync.</p>{isChanging && <label className="settings-input">Current PIN<input inputMode="numeric" type="password" maxLength={8} value={currentPin} onChange={(e) => setCurrentPin(e.target.value.replace(/\D/g, ''))} /></label>}<div className="pin-grid"><label>New PIN<input inputMode="numeric" type="password" maxLength={8} value={newPin} onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ''))} placeholder="4–8 digits" /></label><label>Confirm PIN<input inputMode="numeric" type="password" maxLength={8} value={confirmPin} onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, ''))} placeholder="Repeat PIN" /></label></div><button className="primary-btn" onClick={() => void savePin()} disabled={newPin.length < 4 || confirmPin.length < 4}>{isChanging ? 'Change PIN' : 'Enable parent PIN'}</button>{isChanging && <button className="secondary-btn" onClick={async () => { await send({ type: 'LOCK_ADMIN' }); await onRefresh(); onToast('Parent console locked.'); }}>Lock now</button>}</div>

    <div className="panel"><div className="eyebrow">ACTIVITY RETENTION</div><h2>Keep analytics useful without keeping everything forever.</h2><div className="setting-row"><div><strong>Retention period</strong><span className="muted">Older events are removed automatically.</span></div><select value={retention} onChange={(e) => setRetention(Number(e.target.value))}><option value={7}>7 days</option><option value={14}>14 days</option><option value={30}>30 days</option><option value={90}>90 days</option></select></div><div className="setting-row"><div><strong>Maximum event entries</strong><span className="muted">A safety cap for local storage.</span></div><select value={maxEntries} onChange={(e) => setMaxEntries(Number(e.target.value))}><option value={500}>500</option><option value={1000}>1,000</option><option value={2500}>2,500</option><option value={5000}>5,000</option></select></div><button className="secondary-btn" onClick={async () => { try { await send({ type: 'SET_RETENTION', retentionDays: retention, maxLogEntries: maxEntries }); await onRefresh(); onToast('Retention settings saved.'); } catch (error) { onToast(error instanceof Error ? error.message : 'Could not save retention.'); } }}>Save retention</button></div>

    <div className="panel"><div className="eyebrow">BACKUP & RESTORE</div><h2>Move a SafeBrowse configuration safely.</h2><p>Backups include profiles, policies and local activity. The parent PIN hash is intentionally excluded; the current PIN is preserved during restore.</p><div className="tool-grid"><button className="secondary-btn" onClick={onExport}>Export JSON backup</button><button className="secondary-btn" onClick={onImport}>Restore JSON backup</button></div></div>

    <div className="panel"><div className="eyebrow">CHROME SYNC</div><h2>Optional policy synchronization</h2><p>Chrome Sync can synchronize profiles and policy configuration across signed-in Chrome browsers. SafeBrowse does not put activity history or the parent PIN into Sync. Chrome Sync has a roughly 100 KB total quota for sync data, so this feature is intended for configuration, not logs.</p><div className="sync-row"><label className="switch-line"><input type="checkbox" checked={state.settings.syncEnabled} onChange={async (e) => { try { await send({ type: 'SET_SYNC_ENABLED', enabled: e.target.checked }); await onRefresh(); onToast(e.target.checked ? 'Sync enabled and current policies pushed.' : 'Sync disabled.'); } catch (error) { onToast(error instanceof Error ? error.message : 'Could not update Sync.'); } }} /><span>Enable policy sync</span></label><div className="tool-grid"><button className="secondary-btn" onClick={async () => { try { await send({ type: 'SYNC_PUSH' }); onToast('Policies pushed to Chrome Sync.'); } catch (error) { onToast(error instanceof Error ? error.message : 'Sync push failed.'); } }} disabled={!state.settings.syncEnabled}>Push now</button><button className="secondary-btn" onClick={async () => { try { await send({ type: 'SYNC_PULL' }); await onRefresh(); onToast('Newer synchronized policy configuration applied.'); } catch (error) { onToast(error instanceof Error ? error.message : 'No newer synchronized configuration found.'); } }} disabled={!state.settings.syncEnabled}>Pull newer</button></div></div></div>

    <div className="panel"><div className="eyebrow">ENFORCEMENT SCOPE</div><h2>Browser-level protection</h2><p>SafeBrowse applies rules to browser requests handled by the extension. It is not a system-wide firewall, router filter, DNS service or protection for other applications.</p></div>
  </section>;
}

function PolicyModal({ policy, onClose, onSave }: { policy: Policy; onClose: () => void; onSave: (policy: Policy) => void }) {
  const [draft, setDraft] = useState(policy);
  const isNew = policy.name === 'New Policy' && policy.targets.length === 1 && policy.targets[0] === '';
  const patch = (value: Partial<Policy>) => setDraft((prev) => ({ ...prev, ...value }));
  const toggleDay = (day: number) => setDraft((prev) => ({ ...prev, schedule: { ...prev.schedule, days: prev.schedule.days.includes(day) ? prev.schedule.days.filter((item) => item !== day) : [...prev.schedule.days, day] } }));
  const changeType = (type: Policy['type']) => setDraft((prev) => ({ ...prev, type, targets: type === 'CATEGORY' ? [] : [''] }));
  return <div className="modal-backdrop"><div className="modal"><div className="modal-head"><div><div className="eyebrow">POLICY BUILDER</div><h2>{isNew ? 'Create policy' : 'Edit policy'}</h2></div><button className="icon-btn" onClick={onClose}>×</button></div><div className="form-grid"><label>Name<input value={draft.name} onChange={(e) => patch({ name: e.target.value })} /></label><label>Type<select value={draft.type} onChange={(e) => changeType(e.target.value as Policy['type'])}><option value="DOMAIN">Domain</option><option value="CATEGORY">Category</option><option value="URL_PATTERN">URL prefix</option></select></label><label>Action<select value={draft.action} onChange={(e) => patch({ action: e.target.value as Policy['action'] })}><option value="BLOCK">Block</option><option value="ALLOW">Allow</option></select></label><label>Priority<input type="number" min={1} max={1000} value={draft.priority} onChange={(e) => patch({ priority: Number(e.target.value) })} /></label></div><label className="full-label">Targets <span className="muted">{draft.type === 'CATEGORY' ? 'Choose one or more categories' : 'One target per line'}</span>{draft.type === 'CATEGORY' ? <div className="check-grid">{CATEGORY_NAMES.map((category) => <label key={category} className="check-item"><input type="checkbox" checked={draft.targets.includes(category)} onChange={() => setDraft((prev) => ({ ...prev, targets: prev.targets.includes(category) ? prev.targets.filter((item) => item !== category) : [...prev.targets, category] }))} />{category}</label>)}</div> : <textarea rows={5} value={draft.targets.join('\n')} onChange={(e) => patch({ targets: e.target.value.split('\n') })} placeholder={draft.type === 'DOMAIN' ? 'youtube.com\ninstagram.com' : 'https://example.com/education'} />}</label><div className="schedule-box"><label className="switch-line"><input type="checkbox" checked={draft.schedule.enabled} onChange={(e) => setDraft((prev) => ({ ...prev, schedule: { ...prev.schedule, enabled: e.target.checked } }))} /><span>Enable schedule</span></label><div className="days">{WEEK_DAYS.map((day) => <button key={day.value} type="button" className={draft.schedule.days.includes(day.value) ? 'day active' : 'day'} onClick={() => toggleDay(day.value)}>{day.label}</button>)}</div><div className="time-row"><label>Start<input type="time" value={draft.schedule.start} onChange={(e) => setDraft((prev) => ({ ...prev, schedule: { ...prev.schedule, start: e.target.value } }))} /></label><label>End<input type="time" value={draft.schedule.end} onChange={(e) => setDraft((prev) => ({ ...prev, schedule: { ...prev.schedule, end: e.target.value } }))} /></label></div></div><label className="switch-line"><input type="checkbox" checked={draft.enabled} onChange={(e) => patch({ enabled: e.target.checked })} /><span>Policy active</span></label><div className="modal-actions"><button className="secondary-btn" onClick={onClose}>Cancel</button><button className="primary-btn" onClick={() => onSave(draft)}>Save policy</button></div></div></div>;
}

function Empty({ text }: { text: string }) { return <div className="empty">{text}</div>; }

createRoot(document.getElementById('root')!).render(<Dashboard />);
