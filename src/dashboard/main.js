import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { CATEGORY_CATALOG, CATEGORY_NAMES, WEEK_DAYS } from '../common/catalog';
import { aggregateAnalytics } from '../common/analytics';
import { domainMatches, formatDateTime, formatRelativeTime, normalizeDomain, normalizeUrlPattern, policySpecificity, uid } from '../common/utils';
import '../styles.css';
import srLogo from "../assets/sr-logo.svg";
const emptyPolicy = () => ({
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
async function send(message) {
    const result = await chrome.runtime.sendMessage(message);
    if (result && typeof result === 'object' && 'error' in result && typeof result.error === 'string')
        throw new Error(result.error);
    return result;
}
function Dashboard() {
    const [state, setState] = useState(null);
    const [tab, setTab] = useState('overview');
    const [editing, setEditing] = useState(null);
    const [simUrl, setSimUrl] = useState('https://youtube.com/');
    const [simResult, setSimResult] = useState(null);
    const [toast, setToast] = useState('');
    const importInput = useRef(null);
    const [theme, setTheme] = useState(() => {
        return (localStorage.getItem("safebrowse-theme") ||
            "light");
    });
    useEffect(() => {
        document.documentElement.dataset.theme = theme;
        localStorage.setItem("safebrowse-theme", theme);
    }, [theme]);
    useEffect(() => { void refresh(); }, []);
    useEffect(() => {
        const onStorageChanged = (changes, areaName) => {
            if (areaName === 'local' &&
                changes.profileData) {
                void refresh();
            }
        };
        chrome.storage.onChanged.addListener(onStorageChanged);
        return () => {
            chrome.storage.onChanged.removeListener(onStorageChanged);
        };
    }, []);
    useEffect(() => {
        if (!toast)
            return;
        const id = window.setTimeout(() => setToast(''), 3000);
        return () => clearTimeout(id);
    }, [toast]);
    async function refresh() {
        try {
            setState(await send({ type: 'GET_STATE' }));
        }
        catch (error) {
            setToast(error instanceof Error
                ? error.message
                : 'Could not load SafeBrowse.');
        }
    }
    // Hooks must always run in the same order on every render.
    // state is null during the initial render, so use safe empty values here.
    const analytics = useMemo(() => aggregateAnalytics(state?.events ?? [], state?.policies ?? []), [state?.events, state?.policies]);
    if (!state) {
        return _jsx("div", { className: "page loading", children: "Loading SafeBrowse\u2026" });
    }
    const currentState = state;
    const canManage = !state.settings.pinConfigured || state.auth.unlocked;
    const activePolicies = state.policies.filter((policy) => policy.enabled).length;
    async function run(action) {
        try {
            await action();
        }
        catch (error) {
            setToast(error instanceof Error ? error.message : 'Action failed.');
        }
    }
    async function savePolicy(policy) {
        if (!policy.name.trim())
            throw new Error('Policy name is required.');
        if (policy.schedule.enabled && policy.schedule.days.length === 0)
            throw new Error('Select at least one schedule day.');
        if (!Number.isInteger(policy.priority) || policy.priority < 1 || policy.priority > 1000)
            throw new Error('Priority must be an integer from 1 to 1000.');
        const targets = policy.targets.map((target) => target.trim()).filter(Boolean);
        if (!targets.length)
            throw new Error('Add at least one target.');
        const clean = { ...policy, name: policy.name.trim().slice(0, 80), updatedAt: Date.now(), targets };
        if (clean.type === 'DOMAIN')
            clean.targets = targets.map(normalizeDomain);
        if (clean.type === 'URL_PATTERN')
            clean.targets = targets.map(normalizeUrlPattern);
        await send({ type: 'UPSERT_POLICY', policy: clean });
        await refresh();
        setEditing(null);
        setToast('Policy saved. Browser rules rebuilt.');
    }
    async function deletePolicy(id) {
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
    async function switchProfile(profileId) {
        await send({ type: 'SWITCH_PROFILE', profileId });
        setSimResult(null);
        await refresh();
        setToast(`Switched to ${currentState.profiles.find((profile) => profile.id === profileId)?.name ?? 'profile'}.`);
    }
    async function exportBackup() {
        const bundle = await send({ type: 'EXPORT_BACKUP' });
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
    async function importBackup(file) {
        const text = await file.text();
        let parsed;
        try {
            parsed = JSON.parse(text);
        }
        catch {
            throw new Error('The selected file is not valid JSON.');
        }
        await send({ type: 'IMPORT_BACKUP', bundle: parsed });
        await refresh();
        setToast('Backup restored. Current parent PIN was preserved.');
    }
    return (_jsxs("div", { className: "app-shell", children: [_jsxs("aside", { className: "sidebar", children: [_jsxs("div", { className: "brand-row sidebar-brand", children: [_jsx("img", { src: srLogo, alt: "SafeBrowse", className: "brand-logo" }), _jsxs("div", { children: [_jsx("div", { className: "brand-name", children: "SafeBrowse" }), _jsx("div", { className: "brand-sub", children: "Policy & analytics" })] })] }), _jsx("nav", { children: [
                            ['overview', 'Overview'], ['policies', 'Policies'], ['activity', 'Activity'], ['simulator', 'Simulator'], ['profiles', 'Profiles'], ['settings', 'Settings']
                        ].map(([item, label]) => (_jsx("button", { className: `nav-btn ${tab === item ? 'active' : ''}`, onClick: () => setTab(item), children: label }, item))) }), _jsxs("div", { className: "sidebar-bottom", children: [_jsx("div", { className: "tiny-label", children: "CURRENT PROFILE" }), _jsxs("div", { className: "profile-chip", children: [_jsx("span", { className: "profile-dot", style: { background: state.profiles.find((p) => p.id === state.activeProfileId)?.color } }), state.profiles.find((p) => p.id === state.activeProfileId)?.name] }), _jsx("div", { className: "tiny-label protection-label", children: "PROTECTION" }), _jsxs("button", { className: `protection-chip ${state.settings.protectionEnabled ? 'enabled' : 'paused'}`, onClick: () => void run(toggleProtection), disabled: !canManage, children: [_jsx("span", { className: "status-dot" }), state.settings.protectionEnabled ? 'Enabled' : 'Paused'] })] })] }), _jsxs("main", { className: "content", children: [_jsxs("header", { className: "topbar", children: [_jsxs("div", { children: [_jsx("div", { className: "eyebrow", children: "WEB POLICY CONSOLE" }), _jsx("h1", { children: tab[0].toUpperCase() + tab.slice(1) })] }), _jsxs("div", { className: "topbar-actions", children: [_jsxs("label", { className: "profile-select-label", children: [_jsx("span", { className: "tiny-label", children: "PROFILE" }), _jsx("select", { value: state.activeProfileId, onChange: (e) => void run(() => switchProfile(e.target.value)), disabled: !canManage, children: state.profiles.map((profile) => (_jsx("option", { value: profile.id, children: profile.name }, profile.id))) })] }), state.settings.pinConfigured && (_jsx("button", { className: "secondary-btn compact", onClick: () => void run(async () => {
                                            await send({ type: "LOCK_ADMIN" });
                                            await refresh();
                                            setToast("Parent console locked.");
                                        }), children: state.auth.unlocked ? "Lock console" : "Locked" })), canManage && (_jsx("button", { className: "primary-btn compact", onClick: () => setEditing(emptyPolicy()), children: "+ New policy" })), _jsx("button", { type: "button", className: "icon-btn", title: `Switch to ${theme === "dark" ? "light" : "dark"} mode`, "aria-label": `Switch to ${theme === "dark" ? "light" : "dark"} mode`, onClick: () => {
                                            setTheme((current) => current === "dark" ? "light" : "dark");
                                        }, children: theme === "dark" ? "☀" : "☾" })] })] }), !canManage ? (_jsx(LockScreen, { onUnlock: async () => { await refresh(); } })) : (_jsxs(_Fragment, { children: [tab === 'overview' && _jsx(Overview, { state: state, analytics: analytics, activePolicies: activePolicies, onTab: setTab }), tab === 'policies' && _jsx(Policies, { state: state, onEdit: setEditing, onDelete: (id) => void run(() => deletePolicy(id)) }), tab === 'activity' && _jsx(Activity, { events: state.events, onClear: () => void run(async () => { await send({ type: 'CLEAR_ACTIVITY' }); await refresh(); setToast('Activity history cleared.'); }) }), tab === 'simulator' && _jsx(Simulator, { url: simUrl, setUrl: setSimUrl, result: simResult, onRun: () => void run(async () => setSimResult(await send({ type: 'SIMULATE', url: simUrl }))) }), tab === 'profiles' && _jsx(Profiles, { state: state, onRefresh: refresh, onToast: setToast }), tab === 'settings' && _jsx(Settings, { state: state, onRefresh: refresh, onExport: () => void run(exportBackup), onImport: () => importInput.current?.click(), onToast: setToast })] })), _jsx("input", { ref: importInput, type: "file", accept: "application/json,.json", hidden: true, onChange: (e) => { const file = e.target.files?.[0]; if (file)
                            void run(() => importBackup(file)); e.target.value = ''; } }), _jsxs("footer", { className: "dashboard-footer", children: [_jsxs("div", { className: "dashboard-footer-brand", children: [_jsx("span", { className: "footer-signature", children: "Rajan Chaudhary" }), _jsx("span", { className: "footer-role", children: "Full-Stack Developer" })] }), _jsx("a", { href: "https://rajanchaudhary947.vercel.app", target: "_blank", rel: "noopener noreferrer", className: "footer-link", children: "Portfolio \u2197" })] })] }), editing && canManage && _jsx(PolicyModal, { policy: editing, onClose: () => setEditing(null), onSave: (policy) => void run(() => savePolicy(policy)) }), toast && _jsx("div", { className: "toast", children: toast })] }));
}
function LockScreen({ onUnlock }) {
    const [pin, setPin] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    async function unlock() {
        setBusy(true);
        setError('');
        try {
            const result = await send({ type: 'VERIFY_PIN', pin });
            if (!result.ok)
                throw new Error('Incorrect PIN.');
            await onUnlock();
        }
        catch (err) {
            setError(err instanceof Error ? err.message : 'Could not unlock.');
        }
        finally {
            setBusy(false);
        }
    }
    return _jsx("div", { className: "lock-screen", children: _jsxs("div", { className: "lock-card", children: [_jsx("div", { className: "brand-mark large", children: "S" }), _jsx("div", { className: "eyebrow", children: "PARENT CONSOLE" }), _jsx("h2", { children: "SafeBrowse is locked" }), _jsx("p", { children: "Enter the parent PIN to view policies, activity and analytics." }), _jsx("input", { autoFocus: true, inputMode: "numeric", type: "password", maxLength: 8, value: pin, onChange: (e) => setPin(e.target.value.replace(/\D/g, '')), onKeyDown: (e) => { if (e.key === 'Enter')
                        void unlock(); }, placeholder: "4\u20138 digit PIN" }), _jsx("button", { className: "primary-btn", onClick: () => void unlock(), disabled: busy || pin.length < 4, children: busy ? 'Checking…' : 'Unlock console' }), error && _jsx("div", { className: "form-error", children: error })] }) });
}
function Overview({ state, analytics, activePolicies, onTab }) {
    return _jsxs("section", { className: "section-stack", children: [_jsxs("div", { className: "hero-grid", children: [_jsxs("div", { className: "hero-panel", children: [_jsx("div", { className: "hero-kicker", children: "LOCAL-FIRST CONTROL" }), _jsx("h2", { children: "Define what the browser can access \u2014 then see what the rules actually did." }), _jsx("p", { children: "Policies, schedules, enforcement and analytics stay on this browser. Sync is optional and only synchronizes policy configuration, not activity history." }), _jsx("button", { className: "secondary-btn", onClick: () => onTab('policies'), children: "Manage policies \u2192" })] }), _jsxs("div", { className: "metric-grid", children: [_jsx(Metric, { label: "Active policies", value: activePolicies, note: `${state.policies.length} total` }), _jsx(Metric, { label: "Blocked today", value: analytics.blockedToday, note: `${analytics.blocked7Days} in 7 days` }), _jsx(Metric, { label: "Unique domains", value: analytics.uniqueDomains, note: "blocked destinations" }), _jsx(Metric, { label: "Active categories", value: new Set(state.policies.filter((p) => p.type === 'CATEGORY').flatMap((p) => p.targets)).size, note: "configured" })] })] }), _jsxs("div", { className: "chart-grid", children: [_jsx(ChartPanel, { title: "7-day blocked activity", eyebrow: "TREND", children: _jsx("div", { className: "daily-chart", children: analytics.daily.map((point) => _jsxs("div", { className: "daily-column", title: `${point.label}: ${point.count} blocked`, children: [_jsx("div", { className: "daily-bar", style: { height: `${Math.max(6, analytics.daily.every((x) => x.count === 0) ? 6 : point.count / Math.max(...analytics.daily.map((x) => x.count), 1) * 100)}%` } }), _jsx("span", { children: point.label }), _jsx("b", { children: point.count })] }, point.timestamp)) }) }), _jsxs(ChartPanel, { title: "Blocked by hour", eyebrow: "PATTERN", children: [_jsx("div", { className: "hour-chart", children: analytics.hourly.map((point) => _jsx("div", { className: "hour-column", title: `${String(point.hour).padStart(2, '0')}:00 — ${point.count} blocked`, children: _jsx("div", { className: "hour-bar", style: { height: `${Math.max(5, point.count / Math.max(...analytics.hourly.map((x) => x.count), 1) * 100)}%` } }) }, point.hour)) }), _jsxs("div", { className: "hour-labels", children: [_jsx("span", { children: "12 AM" }), _jsx("span", { children: "6 AM" }), _jsx("span", { children: "12 PM" }), _jsx("span", { children: "6 PM" }), _jsx("span", { children: "11 PM" })] })] })] }), _jsxs("div", { className: "two-col", children: [_jsx(RankedList, { title: "Top blocked destinations", items: analytics.byDomain, empty: "No blocked destinations yet." }), _jsx(RankedList, { title: "Policy impact", items: analytics.byPolicy, empty: "No policy matches yet." })] }), _jsxs("div", { className: "panel", children: [_jsxs("div", { className: "panel-header", children: [_jsxs("div", { children: [_jsx("div", { className: "eyebrow", children: "RECENT ACTIVITY" }), _jsx("h3", { children: "Latest events" })] }), _jsx("button", { className: "text-btn", onClick: () => onTab('activity'), children: "View all" })] }), _jsx(ActivityTable, { events: state.events.slice(0, 6) })] })] });
}
function Metric({ label, value, note }) { return _jsxs("div", { className: "metric", children: [_jsx("span", { children: label }), _jsx("strong", { children: value }), _jsx("small", { children: note })] }); }
function ChartPanel({ title, eyebrow, children }) { return _jsxs("div", { className: "panel chart-panel", children: [_jsx("div", { className: "panel-header", children: _jsxs("div", { children: [_jsx("div", { className: "eyebrow", children: eyebrow }), _jsx("h3", { children: title })] }) }), children] }); }
function RankedList({ title, items, empty }) { const max = items[0]?.[1] ?? 1; return _jsxs("div", { className: "panel", children: [_jsx("div", { className: "panel-header", children: _jsxs("div", { children: [_jsx("div", { className: "eyebrow", children: "ANALYTICS" }), _jsx("h3", { children: title })] }) }), items.length ? _jsx("div", { className: "bars", children: items.slice(0, 6).map(([name, count]) => _jsxs("div", { className: "bar-row", children: [_jsxs("div", { className: "bar-label", children: [_jsx("span", { children: name }), _jsx("b", { children: count })] }), _jsx("div", { className: "bar-track", children: _jsx("div", { className: "bar-fill", style: { width: `${Math.max(5, count / max * 100)}%` } }) })] }, name)) }) : _jsx(Empty, { text: empty })] }); }
function Policies({ state, onEdit, onDelete }) {
    return _jsxs("section", { className: "section-stack", children: [_jsx("div", { className: "policy-summary", children: _jsxs("div", { children: [_jsxs("strong", { children: [state.policies.length, " policies"] }), _jsx("span", { className: "muted", children: " Higher priority wins; at equal priority, more specific targets win, then ALLOW wins ties." })] }) }), _jsxs("div", { className: "policy-grid", children: [state.policies.map((policy) => _jsx(PolicyCard, { policy: policy, all: state.policies, onEdit: onEdit, onDelete: onDelete }, policy.id)), state.policies.length === 0 && _jsx(Empty, { text: "No policies yet. Create your first rule." })] })] });
}
function PolicyCard({ policy, all, onEdit, onDelete }) {
    const conflicts = all.filter((other) => other.id !== policy.id && policiesPotentiallyOverlap(policy, other)).length;
    const specificity = policy.targets.reduce((max, target) => Math.max(max, policySpecificity(policy, target)), 0);
    return _jsxs("div", { className: "policy-card", children: [_jsxs("div", { className: "policy-card-head", children: [_jsxs("div", { children: [_jsx("span", { className: `pill ${policy.action.toLowerCase()}`, children: policy.action }), _jsx("span", { className: "type-pill", children: policy.type.replace('_', ' ') })] }), _jsx("span", { className: `mini-status ${policy.enabled ? 'enabled' : 'disabled'}`, children: policy.enabled ? 'Active' : 'Off' })] }), _jsx("h3", { children: policy.name }), _jsxs("div", { className: "target-list", children: [policy.targets.slice(0, 5).map((target) => _jsx("span", { children: target }, target)), policy.targets.length > 5 && _jsxs("span", { children: ["+", policy.targets.length - 5, " more"] })] }), _jsxs("div", { className: "policy-meta", children: [_jsxs("span", { children: ["Priority ", policy.priority] }), _jsx("span", { children: policy.schedule.enabled ? `${policy.schedule.start}–${policy.schedule.end}` : 'Always' })] }), _jsxs("div", { className: "policy-insights", children: [_jsxs("span", { children: ["Specificity ", specificity] }), conflicts > 0 && _jsxs("span", { className: "conflict-badge", children: [conflicts, " overlap", conflicts === 1 ? '' : 's'] })] }), _jsxs("div", { className: "card-actions", children: [_jsx("button", { className: "text-btn", onClick: () => onEdit(policy), children: "Edit" }), _jsx("button", { className: "danger-btn", onClick: () => { if (window.confirm(`Delete policy “${policy.name}”?`))
                            onDelete(policy.id); }, children: "Delete" })] })] });
}
function policiesPotentiallyOverlap(a, b) {
    if (a.type === 'CATEGORY' && b.type === 'CATEGORY')
        return a.targets.some((target) => b.targets.includes(target));
    if (a.type === 'URL_PATTERN' && b.type === 'URL_PATTERN')
        return a.targets.some((x) => b.targets.some((y) => x.startsWith(y) || y.startsWith(x)));
    const aDomains = a.type === 'DOMAIN' || a.type === 'CATEGORY' ? safeExpand(a) : [];
    const bDomains = b.type === 'DOMAIN' || b.type === 'CATEGORY' ? safeExpand(b) : [];
    if (a.type === 'URL_PATTERN')
        return bDomains.some((domain) => a.targets.some((url) => { try {
            return domainMatches(new URL(url).hostname, domain);
        }
        catch {
            return false;
        } }));
    if (b.type === 'URL_PATTERN')
        return aDomains.some((domain) => b.targets.some((url) => { try {
            return domainMatches(new URL(url).hostname, domain);
        }
        catch {
            return false;
        } }));
    return aDomains.some((x) => bDomains.some((y) => domainMatches(x, y) || domainMatches(y, x)));
}
function safeExpand(policy) { try {
    return policy.type === 'CATEGORY' ? policy.targets.flatMap((category) => CATEGORY_CATALOG[category] ?? []).map(normalizeDomain) : policy.targets.map(normalizeDomain);
}
catch {
    return [];
} }
function Activity({ events, onClear }) {
    const [query, setQuery] = useState('');
    const [kind, setKind] = useState('ALL');
    const filtered = events.filter((event) => (kind === 'ALL' || event.kind === kind) && (`${event.domain ?? ''} ${event.policyName ?? ''} ${event.detail ?? ''}`).toLowerCase().includes(query.toLowerCase()));
    return _jsx("section", { className: "section-stack", children: _jsxs("div", { className: "panel", children: [_jsxs("div", { className: "panel-header", children: [_jsxs("div", { children: [_jsx("div", { className: "eyebrow", children: "LOCAL ACTIVITY" }), _jsxs("h3", { children: [events.length, " retained events"] })] }), _jsx("button", { className: "danger-btn", onClick: () => { if (window.confirm('Clear all activity for this profile?'))
                                onClear(); }, children: "Clear activity" })] }), _jsxs("div", { className: "activity-filters", children: [_jsx("input", { value: query, onChange: (e) => setQuery(e.target.value), placeholder: "Search domain, policy or event\u2026" }), _jsxs("select", { value: kind, onChange: (e) => setKind(e.target.value), children: [_jsx("option", { value: "ALL", children: "All events" }), _jsx("option", { value: "BLOCKED_REQUEST", children: "Blocked requests" }), _jsx("option", { value: "POLICY_CREATED", children: "Policy created" }), _jsx("option", { value: "POLICY_UPDATED", children: "Policy updated" }), _jsx("option", { value: "POLICY_DELETED", children: "Policy deleted" }), _jsx("option", { value: "PROFILE_SWITCHED", children: "Profile switched" }), _jsx("option", { value: "IMPORT", children: "Imports" }), _jsx("option", { value: "EXPORT", children: "Exports" })] })] }), _jsx(ActivityTable, { events: filtered })] }) });
}
function ActivityTable({ events }) { return events.length ? _jsx("div", { className: "activity-list", children: events.map((event) => _jsxs("div", { className: "activity-row", children: [_jsx("div", { className: `activity-icon ${event.kind === 'BLOCKED_REQUEST' ? 'blocked-icon' : ''}`, children: event.kind === 'BLOCKED_REQUEST' ? '×' : '•' }), _jsxs("div", { className: "activity-main", children: [_jsx("strong", { children: event.kind.replaceAll('_', ' ') }), _jsx("span", { children: event.domain ?? event.policyName ?? event.detail ?? 'SafeBrowse' }), event.category && _jsx("small", { children: event.category })] }), _jsx("div", { className: "activity-time", title: formatDateTime(event.timestamp), children: formatRelativeTime(event.timestamp) })] }, event.id)) }) : _jsx(Empty, { text: "No matching activity." }); }
function Simulator({ url, setUrl, result, onRun }) {
    return _jsx("section", { className: "section-stack", children: _jsxs("div", { className: "panel simulator", children: [_jsx("div", { className: "eyebrow", children: "POLICY SIMULATOR" }), _jsx("h2", { children: "Test a URL against the active policy set." }), _jsx("p", { children: "The simulator runs the same policy precedence model used to construct the browser rules." }), _jsxs("div", { className: "sim-row", children: [_jsx("input", { value: url, onChange: (e) => setUrl(e.target.value), onKeyDown: (e) => { if (e.key === 'Enter')
                                onRun(); }, placeholder: "https://example.com/" }), _jsx("button", { className: "primary-btn", onClick: onRun, children: "Evaluate" })] }), result && _jsxs(_Fragment, { children: [_jsxs("div", { className: `sim-result ${result.winner?.action.toLowerCase() ?? 'allow'}`, children: [_jsxs("div", { children: [_jsx("span", { className: "eyebrow", children: "DECISION" }), _jsx("h3", { children: result.winner?.action ?? 'ALLOW' })] }), result.winner && _jsxs("div", { className: "sim-details", children: [_jsx("span", { children: result.winner.name }), _jsxs("span", { children: ["Priority ", result.winner.priority] }), _jsx("span", { children: result.winner.type.replace('_', ' ') })] })] }), _jsxs("div", { className: "match-table", children: [_jsx("div", { className: "eyebrow", children: "MATCHED POLICIES" }), result.matches.length ? result.matches.map((policy, index) => _jsxs("div", { className: "match-row", children: [_jsxs("span", { children: ["#", index + 1] }), _jsx("strong", { children: policy.name }), _jsx("span", { children: policy.action }), _jsxs("span", { children: ["Priority ", policy.priority] })] }, policy.id)) : _jsx(Empty, { text: "No active policy matches this URL." })] })] })] }) });
}
function Profiles({ state, onRefresh, onToast }) {
    const [name, setName] = useState('');
    const [busy, setBusy] = useState(false);
    async function add() {
        if (!name.trim()) {
            onToast('Profile name is required.');
            return;
        }
        setBusy(true);
        try {
            const profile = { id: uid('profile'), name: name.trim().slice(0, 40), color: profileColors[state.profiles.length % profileColors.length], createdAt: Date.now(), updatedAt: Date.now() };
            await send({ type: 'CREATE_PROFILE', profile });
            setName('');
            await onRefresh();
            onToast(`Profile “${profile.name}” created.`);
        }
        catch (error) {
            onToast(error instanceof Error ? error.message : 'Could not create profile.');
        }
        finally {
            setBusy(false);
        }
    }
    async function remove(profile) {
        if (state.profiles.length <= 1) {
            onToast('At least one profile must remain.');
            return;
        }
        if (!window.confirm(`Delete profile “${profile.name}” and its policies/activity?`))
            return;
        try {
            await send({ type: 'DELETE_PROFILE', profileId: profile.id });
            await onRefresh();
            onToast('Profile deleted.');
        }
        catch (error) {
            onToast(error instanceof Error ? error.message : 'Could not delete profile.');
        }
    }
    return _jsxs("section", { className: "section-stack", children: [_jsxs("div", { className: "panel", children: [_jsx("div", { className: "eyebrow", children: "PROFILES" }), _jsx("h2", { children: "Separate policies by person or use case." }), _jsx("p", { children: "Each profile has its own policy set and local activity log. Only the active profile is enforced." }), _jsxs("div", { className: "profile-create", children: [_jsx("input", { value: name, onChange: (e) => setName(e.target.value), onKeyDown: (e) => { if (e.key === 'Enter')
                                    void add(); }, placeholder: "e.g. Study Mode, Child 1" }), _jsx("button", { className: "primary-btn", onClick: () => void add(), disabled: busy, children: busy ? 'Creating…' : 'Create profile' })] })] }), _jsx("div", { className: "profile-list", children: state.profiles.map((profile) => _jsxs("div", { className: `profile-row ${profile.id === state.activeProfileId ? 'current' : ''}`, children: [_jsxs("div", { className: "profile-main", children: [_jsx("span", { className: "profile-avatar", style: { background: profile.color }, children: profile.name.slice(0, 1).toUpperCase() }), _jsxs("div", { children: [_jsx("strong", { children: profile.name }), _jsx("span", { children: profile.id === state.activeProfileId ? 'Currently enforced' : 'Inactive profile' })] })] }), _jsxs("div", { children: [_jsx("span", { className: "profile-id", children: profile.id }), state.profiles.length > 1 && _jsx("button", { className: "danger-btn", onClick: () => void remove(profile), children: "Delete" })] })] }, profile.id)) })] });
}
function Settings({ state, onRefresh, onExport, onImport, onToast }) {
    const [retention, setRetention] = useState(state.settings.retentionDays);
    const [maxEntries, setMaxEntries] = useState(state.settings.maxLogEntries);
    const [currentPin, setCurrentPin] = useState('');
    const [newPin, setNewPin] = useState('');
    const [confirmPin, setConfirmPin] = useState('');
    const isChanging = state.settings.pinConfigured;
    async function savePin() {
        try {
            if (newPin !== confirmPin)
                throw new Error('New PIN and confirmation do not match.');
            await send({ type: 'SET_PIN', pin: newPin, currentPin: isChanging ? currentPin : undefined });
            setCurrentPin('');
            setNewPin('');
            setConfirmPin('');
            await onRefresh();
            onToast(isChanging ? 'Parent PIN changed.' : 'Parent PIN enabled.');
        }
        catch (error) {
            onToast(error instanceof Error ? error.message : 'Could not save PIN.');
        }
    }
    return _jsxs("section", { className: "section-stack", children: [_jsxs("div", { className: "panel", children: [_jsx("div", { className: "eyebrow", children: "SECURITY" }), _jsx("h2", { children: isChanging ? 'Parent console protection' : 'Protect policy changes with a PIN' }), _jsx("p", { children: "The PIN is stored as a salted PBKDF2 hash. It is not included in backups or Chrome Sync." }), isChanging && _jsxs("label", { className: "settings-input", children: ["Current PIN", _jsx("input", { inputMode: "numeric", type: "password", maxLength: 8, value: currentPin, onChange: (e) => setCurrentPin(e.target.value.replace(/\D/g, '')) })] }), _jsxs("div", { className: "pin-grid", children: [_jsxs("label", { children: ["New PIN", _jsx("input", { inputMode: "numeric", type: "password", maxLength: 8, value: newPin, onChange: (e) => setNewPin(e.target.value.replace(/\D/g, '')), placeholder: "4\u20138 digits" })] }), _jsxs("label", { children: ["Confirm PIN", _jsx("input", { inputMode: "numeric", type: "password", maxLength: 8, value: confirmPin, onChange: (e) => setConfirmPin(e.target.value.replace(/\D/g, '')), placeholder: "Repeat PIN" })] })] }), _jsx("button", { className: "primary-btn", onClick: () => void savePin(), disabled: newPin.length < 4 || confirmPin.length < 4, children: isChanging ? 'Change PIN' : 'Enable parent PIN' }), isChanging && _jsx("button", { className: "secondary-btn", onClick: async () => { await send({ type: 'LOCK_ADMIN' }); await onRefresh(); onToast('Parent console locked.'); }, children: "Lock now" })] }), _jsxs("div", { className: "panel", children: [_jsx("div", { className: "eyebrow", children: "ACTIVITY RETENTION" }), _jsx("h2", { children: "Keep analytics useful without keeping everything forever." }), _jsxs("div", { className: "setting-row", children: [_jsxs("div", { children: [_jsx("strong", { children: "Retention period" }), _jsx("span", { className: "muted", children: "Older events are removed automatically." })] }), _jsxs("select", { value: retention, onChange: (e) => setRetention(Number(e.target.value)), children: [_jsx("option", { value: 7, children: "7 days" }), _jsx("option", { value: 14, children: "14 days" }), _jsx("option", { value: 30, children: "30 days" }), _jsx("option", { value: 90, children: "90 days" })] })] }), _jsxs("div", { className: "setting-row", children: [_jsxs("div", { children: [_jsx("strong", { children: "Maximum event entries" }), _jsx("span", { className: "muted", children: "A safety cap for local storage." })] }), _jsxs("select", { value: maxEntries, onChange: (e) => setMaxEntries(Number(e.target.value)), children: [_jsx("option", { value: 500, children: "500" }), _jsx("option", { value: 1000, children: "1,000" }), _jsx("option", { value: 2500, children: "2,500" }), _jsx("option", { value: 5000, children: "5,000" })] })] }), _jsx("button", { className: "secondary-btn", onClick: async () => { try {
                            await send({ type: 'SET_RETENTION', retentionDays: retention, maxLogEntries: maxEntries });
                            await onRefresh();
                            onToast('Retention settings saved.');
                        }
                        catch (error) {
                            onToast(error instanceof Error ? error.message : 'Could not save retention.');
                        } }, children: "Save retention" })] }), _jsxs("div", { className: "panel", children: [_jsx("div", { className: "eyebrow", children: "BACKUP & RESTORE" }), _jsx("h2", { children: "Move a SafeBrowse configuration safely." }), _jsx("p", { children: "Backups include profiles, policies and local activity. The parent PIN hash is intentionally excluded; the current PIN is preserved during restore." }), _jsxs("div", { className: "tool-grid", children: [_jsx("button", { className: "secondary-btn", onClick: onExport, children: "Export JSON backup" }), _jsx("button", { className: "secondary-btn", onClick: onImport, children: "Restore JSON backup" })] })] }), _jsxs("div", { className: "panel", children: [_jsx("div", { className: "eyebrow", children: "CHROME SYNC" }), _jsx("h2", { children: "Optional policy synchronization" }), _jsx("p", { children: "Chrome Sync can synchronize profiles and policy configuration across signed-in Chrome browsers. SafeBrowse does not put activity history or the parent PIN into Sync. Chrome Sync has a roughly 100 KB total quota for sync data, so this feature is intended for configuration, not logs." }), _jsxs("div", { className: "sync-row", children: [_jsxs("label", { className: "switch-line", children: [_jsx("input", { type: "checkbox", checked: state.settings.syncEnabled, onChange: async (e) => { try {
                                            await send({ type: 'SET_SYNC_ENABLED', enabled: e.target.checked });
                                            await onRefresh();
                                            onToast(e.target.checked ? 'Sync enabled and current policies pushed.' : 'Sync disabled.');
                                        }
                                        catch (error) {
                                            onToast(error instanceof Error ? error.message : 'Could not update Sync.');
                                        } } }), _jsx("span", { children: "Enable policy sync" })] }), _jsxs("div", { className: "tool-grid", children: [_jsx("button", { className: "secondary-btn", onClick: async () => { try {
                                            await send({ type: 'SYNC_PUSH' });
                                            onToast('Policies pushed to Chrome Sync.');
                                        }
                                        catch (error) {
                                            onToast(error instanceof Error ? error.message : 'Sync push failed.');
                                        } }, disabled: !state.settings.syncEnabled, children: "Push now" }), _jsx("button", { className: "secondary-btn", onClick: async () => { try {
                                            await send({ type: 'SYNC_PULL' });
                                            await onRefresh();
                                            onToast('Newer synchronized policy configuration applied.');
                                        }
                                        catch (error) {
                                            onToast(error instanceof Error ? error.message : 'No newer synchronized configuration found.');
                                        } }, disabled: !state.settings.syncEnabled, children: "Pull newer" })] })] })] }), _jsxs("div", { className: "panel", children: [_jsx("div", { className: "eyebrow", children: "ENFORCEMENT SCOPE" }), _jsx("h2", { children: "Browser-level protection" }), _jsx("p", { children: "SafeBrowse applies rules to browser requests handled by the extension. It is not a system-wide firewall, router filter, DNS service or protection for other applications." })] })] });
}
function PolicyModal({ policy, onClose, onSave }) {
    const [draft, setDraft] = useState(policy);
    const isNew = policy.name === 'New Policy' && policy.targets.length === 1 && policy.targets[0] === '';
    const patch = (value) => setDraft((prev) => ({ ...prev, ...value }));
    const toggleDay = (day) => setDraft((prev) => ({ ...prev, schedule: { ...prev.schedule, days: prev.schedule.days.includes(day) ? prev.schedule.days.filter((item) => item !== day) : [...prev.schedule.days, day] } }));
    const changeType = (type) => setDraft((prev) => ({ ...prev, type, targets: type === 'CATEGORY' ? [] : [''] }));
    return _jsx("div", { className: "modal-backdrop", children: _jsxs("div", { className: "modal", children: [_jsxs("div", { className: "modal-head", children: [_jsxs("div", { children: [_jsx("div", { className: "eyebrow", children: "POLICY BUILDER" }), _jsx("h2", { children: isNew ? 'Create policy' : 'Edit policy' })] }), _jsx("button", { className: "icon-btn", onClick: onClose, children: "\u00D7" })] }), _jsxs("div", { className: "form-grid", children: [_jsxs("label", { children: ["Name", _jsx("input", { value: draft.name, onChange: (e) => patch({ name: e.target.value }) })] }), _jsxs("label", { children: ["Type", _jsxs("select", { value: draft.type, onChange: (e) => changeType(e.target.value), children: [_jsx("option", { value: "DOMAIN", children: "Domain" }), _jsx("option", { value: "CATEGORY", children: "Category" }), _jsx("option", { value: "URL_PATTERN", children: "URL prefix" })] })] }), _jsxs("label", { children: ["Action", _jsxs("select", { value: draft.action, onChange: (e) => patch({ action: e.target.value }), children: [_jsx("option", { value: "BLOCK", children: "Block" }), _jsx("option", { value: "ALLOW", children: "Allow" })] })] }), _jsxs("label", { children: ["Priority", _jsx("input", { type: "number", min: 1, max: 1000, value: draft.priority, onChange: (e) => patch({ priority: Number(e.target.value) }) })] })] }), _jsxs("label", { className: "full-label", children: ["Targets ", _jsx("span", { className: "muted", children: draft.type === 'CATEGORY' ? 'Choose one or more categories' : 'One target per line' }), draft.type === 'CATEGORY' ? _jsx("div", { className: "check-grid", children: CATEGORY_NAMES.map((category) => _jsxs("label", { className: "check-item", children: [_jsx("input", { type: "checkbox", checked: draft.targets.includes(category), onChange: () => setDraft((prev) => ({ ...prev, targets: prev.targets.includes(category) ? prev.targets.filter((item) => item !== category) : [...prev.targets, category] })) }), category] }, category)) }) : _jsx("textarea", { rows: 5, value: draft.targets.join('\n'), onChange: (e) => patch({ targets: e.target.value.split('\n') }), placeholder: draft.type === 'DOMAIN' ? 'youtube.com\ninstagram.com' : 'https://example.com/education' })] }), _jsxs("div", { className: "schedule-box", children: [_jsxs("label", { className: "switch-line", children: [_jsx("input", { type: "checkbox", checked: draft.schedule.enabled, onChange: (e) => setDraft((prev) => ({ ...prev, schedule: { ...prev.schedule, enabled: e.target.checked } })) }), _jsx("span", { children: "Enable schedule" })] }), _jsx("div", { className: "days", children: WEEK_DAYS.map((day) => _jsx("button", { type: "button", className: draft.schedule.days.includes(day.value) ? 'day active' : 'day', onClick: () => toggleDay(day.value), children: day.label }, day.value)) }), _jsxs("div", { className: "time-row", children: [_jsxs("label", { children: ["Start", _jsx("input", { type: "time", value: draft.schedule.start, onChange: (e) => setDraft((prev) => ({ ...prev, schedule: { ...prev.schedule, start: e.target.value } })) })] }), _jsxs("label", { children: ["End", _jsx("input", { type: "time", value: draft.schedule.end, onChange: (e) => setDraft((prev) => ({ ...prev, schedule: { ...prev.schedule, end: e.target.value } })) })] })] })] }), _jsxs("label", { className: "switch-line", children: [_jsx("input", { type: "checkbox", checked: draft.enabled, onChange: (e) => patch({ enabled: e.target.checked }) }), _jsx("span", { children: "Policy active" })] }), _jsxs("div", { className: "modal-actions", children: [_jsx("button", { className: "secondary-btn", onClick: onClose, children: "Cancel" }), _jsx("button", { className: "primary-btn", onClick: () => onSave(draft), children: "Save policy" })] })] }) });
}
function Empty({ text }) { return _jsx("div", { className: "empty", children: text }); }
createRoot(document.getElementById('root')).render(_jsx(Dashboard, {}));
