import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../styles.css';
import srLogo from "../assets/sr-logo.svg";
function Blocked() {
    const [url, setUrl] = useState('this website');
    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const source = params.get('site');
        const policyId = params.get('policyId') ?? undefined;
        const profileId = params.get('profileId') ?? undefined;
        const safeSource = source || 'Unknown destination';
        setUrl(safeSource);
        void chrome.runtime
            .sendMessage({
            type: 'RECORD_BLOCKED_PAGE',
            url: safeSource.startsWith('http')
                ? safeSource
                : `https://${safeSource}/`,
            policyId,
            profileId
        })
            .then((result) => {
            console.log('SafeBrowse blocked event recorded:', result);
        })
            .catch((error) => {
            console.error('SafeBrowse could not record blocked request:', error);
        });
    }, []);
    return _jsx("main", { className: "blocked-screen", children: _jsxs("div", { className: "blocked-card", children: [_jsx("img", { src: srLogo, alt: "SafeBrowse", className: "brand-logo" }), _jsx("div", { className: "eyebrow", children: "SAFEBROWSE" }), _jsx("h1", { children: "Website Restricted" }), _jsx("p", { className: "blocked-domain", children: url }), _jsx("p", { className: "blocked-copy", children: "This destination is currently restricted by an active browsing policy." }), _jsx("div", { className: "blocked-note", children: "A parent or administrator can review the matching policy from the SafeBrowse console." }), _jsxs("div", { className: "blocked-actions", children: [_jsx("button", { className: "secondary-btn", onClick: () => window.location.href = chrome.runtime.getURL('dashboard.html'), children: "Open parent console" }), _jsx("button", { className: "secondary-btn", onClick: () => window.location.href = 'https://www.google.com', children: "Back to safety" })] })] }) });
}
createRoot(document.getElementById('root')).render(_jsx(Blocked, {}));
