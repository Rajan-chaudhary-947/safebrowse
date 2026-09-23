import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../styles.css';
import srLogo from "../assets/sr-logo.svg";
function Popup() {
    const [state, setState] = useState(null);
    const [pin, setPin] = useState('');
    const [error, setError] = useState('');
    useEffect(() => { chrome.runtime.sendMessage({ type: 'GET_STATE' }).then(setState).catch(() => setError('Could not load SafeBrowse.')); }, []);
    if (!state)
        return _jsx("div", { className: "popup loading", children: "Loading SafeBrowse\u2026" });
    async function unlock() {
        setError('');
        try {
            const result = await chrome.runtime.sendMessage({ type: 'VERIFY_PIN', pin });
            if (result.error || !result.ok)
                throw new Error(result.error || 'Incorrect PIN.');
            setPin('');
            setState(await chrome.runtime.sendMessage({ type: 'GET_STATE' }));
        }
        catch (err) {
            setError(err instanceof Error ? err.message : 'Incorrect PIN.');
        }
    }
    return _jsxs("main", { className: "popup", children: [_jsxs("div", { className: "brand-row", children: [_jsx("img", { src: srLogo, alt: "SafeBrowse", className: "brand-logo" }), _jsxs("div", { children: [_jsx("div", { className: "brand-name", children: "SafeBrowse" }), _jsx("div", { className: "brand-sub", children: "Web policy & analytics" })] }), _jsx("span", { className: `status-dot ${state.settings.protectionEnabled ? 'on' : 'off'}` })] }), _jsxs("div", { className: "popup-status", children: [_jsx("strong", { children: state.settings.protectionEnabled ? 'Protection enabled' : 'Protection paused' }), _jsxs("span", { children: [state.profiles.find((p) => p.id === state.activeProfileId)?.name, " \u00B7 ", state.policies.filter((p) => p.enabled).length, " active policies"] })] }), state.settings.pinConfigured && !state.auth.unlocked && _jsxs("div", { className: "popup-lock", children: [_jsx("input", { inputMode: "numeric", type: "password", maxLength: 8, value: pin, onChange: (e) => setPin(e.target.value.replace(/\D/g, '')), onKeyDown: (e) => { if (e.key === 'Enter')
                            void unlock(); }, placeholder: "Parent PIN" }), _jsx("button", { className: "primary-btn", onClick: () => void unlock(), disabled: pin.length < 4, children: "Unlock" })] }), error && _jsx("div", { className: "form-error", children: error }), _jsx("button", { className: "primary-btn", onClick: () => window.open(chrome.runtime.getURL('dashboard.html'), '_blank', 'noopener,noreferrer'), children: "Open Parent Console" }), _jsx("div", { className: "popup-foot", children: "Policies and activity are stored locally by default." })] });
}
createRoot(document.getElementById('root')).render(_jsx(Popup, {}));
