import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../styles.css';
import srLogo from "../assets/sr-logo.svg";

function Blocked() {
  const [url, setUrl] = useState('this website');
  useEffect(() => {
  const params = new URLSearchParams(
    window.location.search
  );

  const source = params.get('site');
  const policyId = params.get('policyId') ?? undefined;
  const profileId = params.get('profileId') ?? undefined;

  const safeSource =
    source || 'Unknown destination';

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
      console.log(
        'SafeBrowse blocked event recorded:',
        result
      );
    })
    .catch((error) => {
      console.error(
        'SafeBrowse could not record blocked request:',
        error
      );
    });
}, []);
  return <main className="blocked-screen"><div className="blocked-card"><img src={srLogo} alt="SafeBrowse" className="brand-logo"/><div className="eyebrow">SAFEBROWSE</div><h1>Website Restricted</h1><p className="blocked-domain">{url}</p><p className="blocked-copy">This destination is currently restricted by an active browsing policy.</p><div className="blocked-note">A parent or administrator can review the matching policy from the SafeBrowse console.</div><div className="blocked-actions"><button className="secondary-btn" onClick={() => window.location.href = chrome.runtime.getURL('dashboard.html')}>Open parent console</button><button className="secondary-btn" onClick={() => window.location.href = 'https://www.google.com'}>Back to safety</button></div></div></main>;
}

createRoot(document.getElementById('root')!).render(<Blocked />);
