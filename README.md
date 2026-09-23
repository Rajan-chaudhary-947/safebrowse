# SafeBrowse — Web Policy & Parental Controls

SafeBrowse is a **local-first browser extension for web filtering and parental controls**. It turns user-defined access rules into browser-enforced network policies and provides a management console for domains, categories, schedules, profiles, activity, analytics, and administration.

The project is built around **Manifest V3** and the browser's `declarativeNetRequest` API. The core idea is simple: instead of treating web blocking as a static list of URLs, SafeBrowse treats access control as a **policy-engine problem** with priorities, schedules, profiles, exceptions, and measurable enforcement activity.

> **Current target:** Chromium-based browsers, with Microsoft Edge and Google Chrome as the primary release targets.

---

## Contents

- [Why SafeBrowse?](#why-safebrowse)
- [Key Features](#key-features)
- [How It Works](#how-it-works)
- [Architecture](#architecture)
- [Policy Engine](#policy-engine)
- [Analytics Pipeline](#analytics-pipeline)
- [Security & Privacy](#security--privacy)
- [Technology Stack](#technology-stack)
- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
- [Build the Extension](#build-the-extension)
- [Run in Microsoft Edge](#run-in-microsoft-edge)
- [Run in Google Chrome](#run-in-google-chrome)
- [Testing](#testing)
- [Configuration & Data](#configuration--data)
- [Permission Model](#permission-model)
- [Browser Compatibility](#browser-compatibility)
- [Limitations](#limitations)
- [Release & Store Publishing](#release--store-publishing)
- [Development Workflow](#development-workflow)
- [Future Improvements](#future-improvements)
- [Project Status](#project-status)
- [License](#license)
- [Author](#author)

---

## Why SafeBrowse?

A basic website blocker usually works like this:

```text
Add site → Block site
```

That is useful, but it quickly becomes limiting when a user needs more control:

- block social media only during school or work hours;
- allow a specific educational URL inside a blocked domain;
- use different policies for different profiles;
- understand which websites are repeatedly blocked;
- test a rule before applying it;
- lock administrative settings behind a parent PIN.

SafeBrowse addresses these requirements with a **rule-driven browser policy system**.

---

## Key Features

### 1. Domain & Website Blocking

Users can create policies for individual domains or URL targets.

Example:

```text
youtube.com      → BLOCK
instagram.com    → BLOCK
reddit.com       → BLOCK
```

SafeBrowse converts those policies into browser-level rules for top-level navigation requests.

### 2. Allow Rules & Exceptions

Policies can also explicitly allow traffic, which makes exceptions possible.

Example:

```text
Block:
youtube.com

Allow:
youtube.com/education/*
```

The policy engine evaluates overlapping rules using its documented conflict-resolution behavior rather than relying on arbitrary ordering.

### 3. Category Filtering

Instead of maintaining a block list one domain at a time, users can apply policies to configured categories such as:

```text
Social Media
Gaming
Streaming
Shopping
```

The category is expanded into its configured target domains and then passed through the same policy engine.

### 4. Scheduled Restrictions

Policies can be enabled only during configured days and time windows.

Example:

```text
Policy: School Hours
Category: Social Media
Action: BLOCK
Days: Monday–Friday
Time: 08:00–16:00
```

Cross-midnight schedules such as `22:00 → 06:00` are also supported.

Scheduling is coordinated through the browser alarms API so the management dashboard does not need to stay open.

### 5. Policy Priorities & Conflict Resolution

Multiple policies can match the same destination. SafeBrowse therefore assigns priorities and evaluates the applicable policies deterministically.

This supports use cases such as:

```text
Rule A
Block youtube.com
Priority: 100

Rule B
Allow youtube.com/education/*
Priority: 200
```

The policy engine is kept separate from the UI so the same decision logic can be used by the simulator and the enforcement layer.

### 6. Policy Simulator

Users can test a URL against the active policy set before relying on it.

Example:

```text
URL:
https://example.com

Result:
BLOCKED

Matched policy:
School Hours
```

This makes rule behavior easier to understand and debug.

### 7. Multiple Profiles

SafeBrowse supports separate policy sets for different profiles.

Example:

```text
Profile: Child 1
  Social Media → BLOCK
  Gaming       → BLOCK

Profile: Child 2
  Reddit       → BLOCK
  Streaming    → BLOCK
```

Each profile can have its own policies and enforcement history.

### 8. Parent Console Protection

Administrative controls can be protected by a parent PIN.

The raw PIN is not stored. SafeBrowse uses a salted PBKDF2-derived verifier through the Web Crypto API for authentication.

The parent console can be locked after configuration changes so policy administration requires authentication.

### 9. Local Activity Logging

When a top-level navigation is blocked, SafeBrowse records a policy-enforcement event for the Activity and Analytics features.

An event may contain information such as:

```text
Domain
Timestamp
Profile
Policy
Policy type
Category
Event type
```

The project is designed around **policy-enforcement events**, not a general browser-history database.

### 10. Analytics Dashboard

The dashboard aggregates local enforcement events into useful summaries, including:

- blocked requests today;
- seven-day blocked activity;
- blocked activity by hour;
- top blocked destinations;
- policy impact;
- category-level activity;
- recent activity events.

The analytics layer is deliberately separated from the enforcement engine so raw events and derived metrics have distinct responsibilities.

### 11. Backup & Restore

Users can export supported SafeBrowse configuration and restore it later.

Imported configuration is validated before it is accepted rather than being blindly inserted into storage.

### 12. Optional Browser Sync

SafeBrowse can use browser-provided extension synchronization for supported configuration such as profiles and policies.

Sensitive local authentication material and local activity history are intentionally kept out of the synchronization path.

### 13. Local-First Design

The core product does not require a SafeBrowse server to perform policy enforcement.

The intended data flow is:

```text
Browser
  │
  └── SafeBrowse
       ├── Policies       → Local
       ├── Profiles       → Local
       ├── Activity       → Local
       ├── Analytics      → Local
       └── Authentication → Local
```

### 14. Responsive Product UI

The management console was designed for:

```text
Desktop
Tablet
Mobile
Small mobile screens
```

The interface includes:

- responsive navigation;
- responsive policy cards;
- responsive charts;
- responsive filters;
- responsive modals/forms;
- light/dark theme support;
- consistent SR branding.

---

## How It Works

A normal blocked navigation follows this flow:

```text
User opens a website
        ↓
Browser request
        ↓
declarativeNetRequest rule matches
        ↓
SafeBrowse blocked page
        ↓
Blocked-page event message
        ↓
Service worker
        ↓
BLOCKED_REQUEST event
        ↓
Local storage
        ↓
Analytics aggregation
        ↓
Dashboard
```

The important separation is:

```text
Policy engine
    ↓
Decision
    ↓
Browser enforcement
```

and:

```text
Enforcement event
    ↓
Local analytics
```

Blocking does not depend on the dashboard being open.

---

## Architecture

```text
                         SafeBrowse
                             │
              ┌──────────────┼──────────────┐
              │              │              │
              ▼              ▼              ▼
        React + TS      Service Worker   Blocked Page
              │              │              │
              │              ├─ Policy Engine
              │              ├─ Rule Generator
              │              ├─ Scheduler
              │              ├─ Activity Logger
              │              └─ Message Handler
              │              │
              └──────────────┼──────────────┘
                             │
                             ▼
                  declarativeNetRequest
                             │
                    ┌────────┴────────┐
                    │                 │
                  ALLOW             BLOCK
                                      │
                                      ▼
                               blocked.html
```

### Main responsibilities

**React UI**

Handles the dashboard, popup, blocked page, policies, profiles, settings, analytics, and user interaction.

**Service worker**

Owns background/event-driven responsibilities including policy updates, rule regeneration, scheduling, local state coordination, and message handling.

**Policy engine**

Evaluates policies, schedules, priorities, URL/domain targets, and conflicts.

**declarativeNetRequest**

Performs browser-level request handling based on generated declarative rules.

**Local storage**

Persists configuration and policy-enforcement state needed by the application.

---

## Policy Engine

The policy model is designed around concepts such as:

```text
Policy
├── id
├── name
├── type
├── targets
├── action
├── schedule
├── priority
├── enabled
└── profile
```

Supported policy ideas include:

```text
DOMAIN
CATEGORY
URL_PATTERN

BLOCK
ALLOW
```

The engine also accounts for:

- enabled/disabled state;
- profile ownership;
- schedule windows;
- overlapping policies;
- policy priority;
- more specific exceptions.

Keeping these decisions centralized makes it easier to test and reason about policy behavior independently from the UI.

---

## Analytics Pipeline

SafeBrowse analytics are derived from policy-enforcement events.

```text
Blocked navigation
       ↓
BLOCKED_REQUEST
       ↓
Local event storage
       ↓
Aggregation
       ├─ Today
       ├─ Last 7 days
       ├─ By hour
       ├─ By domain
       ├─ By policy
       └─ By category
       ↓
Dashboard
```

The dashboard can therefore answer questions such as:

```text
How many requests were blocked today?
Which domains were blocked most often?
Which policy caused the most blocks?
At which hours are restrictions triggered most often?
```

---

## Security & Privacy

SafeBrowse is designed as a privacy-oriented, local-first browser extension.

### Security choices

- Manifest V3 architecture.
- No remotely executed JavaScript or WebAssembly.
- PIN authentication using a salted PBKDF2-derived verifier.
- No plaintext PIN storage.
- Validated configuration import.
- Policy enforcement through browser-declarative rules.
- Sensitive local authentication material excluded from optional sync.

### Data handling principles

SafeBrowse is intended to keep the core data locally in browser storage.

The project does **not intentionally collect**:

```text
Passwords
Payment information
Health information
Private messages
Page text
Form contents
Device location
```

The Activity/Analytics functionality records limited policy-enforcement information such as blocked domains and associated policy metadata.

### Privacy policy

The public privacy policy is hosted separately from the extension, at:

```text
https://rajanchaudhary947.vercel.app/safebrowse/privacy
```

The privacy policy should always match the actual implementation and must be updated if the extension's data practices change.

---

## Technology Stack

### Frontend

- React
- TypeScript
- Vite
- CSS

### Extension Platform

- Manifest V3
- `declarativeNetRequest`
- `chrome.storage`
- `chrome.alarms`
- `chrome.runtime`

### Security

- Web Crypto API
- PBKDF2

### Testing

- Vitest
- TypeScript compilation checks

---

## Project Structure

A simplified project layout looks like this:

```text
safebrowse/
│
├── public/
│   ├── icons/
│   │   ├── sr-16.png
│   │   ├── sr-32.png
│   │   ├── sr-48.png
│   │   └── sr-128.png
│   └── manifest.json
│
├── src/
│   ├── assets/
│   │   └── sr-logo.svg
│   │
│   ├── background/
│   │   └── serviceWorker.ts
│   │
│   ├── blocked/
│   │   └── main.tsx
│   │
│   ├── dashboard/
│   │   └── main.tsx
│   │
│   ├── popup/
│   │   └── main.tsx
│   │
│   ├── common/
│   │   ├── analytics.ts
│   │   ├── auth.ts
│   │   ├── messages.ts
│   │   ├── policy-engine.ts
│   │   ├── storage.ts
│   │   └── types.ts
│   │
│   └── styles.css
│
├── tests/
│   ├── analytics.test.ts
│   ├── policy-engine.test.ts
│   └── security.test.ts
│
├── blocked.html
├── dashboard.html
├── popup.html
├── package.json
├── tsconfig.json
├── tsconfig.app.json
├── tsconfig.worker.json
└── vite.config.ts
```

The exact source tree may change as the project evolves; the architecture above describes the current separation of concerns.

---

## Getting Started

### Prerequisites

Install:

- Node.js LTS
- npm
- Microsoft Edge or Google Chrome for extension testing

Verify Node.js and npm:

```bash
node -v
npm -v
```

### Clone the repository

```bash
git clone https://github.com/Rajan-chaudhary-947/safebrowse
cd safebrowse
```

> Replace the repository URL above with the final public repository URL when the project is pushed to GitHub.

### Install dependencies

```bash
npm install
```

---

## Testing

Run the test suite with:

```bash
npm test
```

The current suite covers core areas such as:

- policy behavior;
- analytics aggregation;
- security/authentication behavior.

A successful run should look similar to:

```text
Test Files  3 passed
Tests       10 passed
```

The exact number can increase as more tests are added.

---

## Build the Extension

Create the production extension bundle:

```bash
npm run build
```

The output is generated in:

```text
dist/
```

The built package should contain `manifest.json` directly at its root.

---

## Run in Microsoft Edge

1. Build the extension:

```bash
npm run build
```

2. Open:

```text
edge://extensions
```

3. Enable **Developer mode**.

4. Click **Load unpacked**.

5. Select:

```text
C:\Projects\safebrowse\dist
```

6. Open the SafeBrowse popup or Parent Console.

### Testing a block

Create a policy such as:

```text
Name: Analytics Test
Type: Domain
Target: youtube.com
Action: BLOCK
```

Then open:

```text
https://youtube.com
```

The request should be redirected to the SafeBrowse blocked page according to the active policy.

---

## Run in Google Chrome

The development flow is the same:

1. Build:

```bash
npm run build
```

2. Open:

```text
chrome://extensions
```

3. Enable **Developer mode**.

4. Select **Load unpacked**.

5. Choose the `dist/` folder.

SafeBrowse is designed around Chromium extension APIs, so Chrome and Edge are the primary targets.

---

## Configuration & Data

### Local configuration

SafeBrowse stores application state in browser-managed extension storage.

Configuration may include:

- profiles;
- policies;
- settings;
- supported sync configuration;
- policy-enforcement events.

### Backup

Exported configuration files may contain SafeBrowse policy/profile information. Treat exported backups as private configuration files.

### Sync

Optional browser synchronization is intended for supported configuration rather than local activity history or authentication material.

---

## Permission Model

SafeBrowse intentionally uses a small set of permissions aligned with its browser-filtering purpose.

| Permission | Purpose |
|---|---|
| `declarativeNetRequest` | Enforce user-defined web filtering rules through browser-declarative requests. |
| `storage` | Persist policies, profiles, settings, and local enforcement data. |
| `alarms` | Trigger scheduled policy changes. |
| `http://*/*` | Apply filtering to HTTP website navigation. |
| `https://*/*` | Apply filtering to HTTPS website navigation. |

The extension does not use remote executable code and does not require a user account for its core functionality.

---

## Browser Compatibility

### Primary targets

- Google Chrome
- Microsoft Edge

### Additional Chromium targets

The architecture is Chromium-oriented and may also work with browsers such as:

- Brave
- Opera

Each browser should still be tested independently before being advertised as officially supported because browser APIs, permissions, update behavior, and store requirements can differ.

### Not currently a direct target

- Firefox
- Safari

Those browsers require separate compatibility testing and potentially different packaging or API handling.

---

## Limitations

SafeBrowse is a **browser-level** control system.

It does not automatically provide operating-system-wide network filtering.

It does not directly control:

```text
Other browsers
Desktop applications
Router traffic
Operating-system networking
Mobile applications
```

A user with sufficient control over the device may also be able to disable or remove a browser extension. Stronger device-management guarantees require OS, enterprise, DNS, router, or network-level controls.

SafeBrowse should therefore be described as a **browser web-filtering and parental-control extension**, not as a complete device-management solution.

---

## Release & Store Publishing

SafeBrowse is intended to be distributed through official browser extension stores rather than requiring normal users to use Developer Mode.

### Microsoft Edge Add-ons

Release flow:

```text
Source code
   ↓
npm test
   ↓
npm run build
   ↓
Package dist/
   ↓
Microsoft Partner Center
   ↓
Privacy + permissions + listing
   ↓
Certification
   ↓
Edge Add-ons
```

### Chrome Web Store

The same Chromium-oriented codebase can be prepared for Chrome Web Store submission:

```text
Source code
   ↓
npm test
   ↓
npm run build
   ↓
Package dist/
   ↓
Chrome Web Store
   ↓
Privacy + permissions + listing
   ↓
Review
   ↓
Chrome Web Store
```

### Versioning

When shipping an update, increase the extension version in `manifest.json`.

Example:

```text
2.0.0 → 2.0.1
2.0.1 → 2.1.0
2.1.0 → 3.0.0
```

After store approval, the browser's extension update mechanism distributes the new package to existing users.

---

## Development Workflow

The recommended local cycle is:

```text
Edit source
   ↓
npm test
   ↓
npm run build
   ↓
Reload extension
   ↓
Test in Edge/Chrome
   ↓
Inspect service worker logs when needed
```

For changes affecting the background service worker, policy engine, or analytics pipeline, test the full browser flow rather than relying only on unit tests.

---

## Future Improvements

Possible future extensions to the project include:

- encrypted cloud backups;
- remote parent/child account management;
- multi-device policy synchronization;
- richer category databases;
- browser-specific adapters;
- stronger enterprise/device-management integrations;
- advanced policy simulation and debugging;
- optional native networking companion;
- additional automated browser tests;
- deeper performance benchmarking for large rule sets.

---

## Project Status

SafeBrowse is currently in the **release-preparation stage**.

### Completed / implemented

- Manifest V3 architecture
- Domain-based blocking
- Allow/block policies
- Category-based filtering
- Scheduled policies
- Policy priorities and conflict handling
- Multiple profiles
- Parent PIN protection
- Policy simulator
- Local activity logging
- Analytics dashboard
- Backup/restore
- Optional browser configuration sync
- Responsive management UI
- Light/dark theme
- SR branding
- Automated tests
- Production Vite build

### Release preparation

- Final browser QA
- Analytics end-to-end verification
- Final security/privacy audit
- Store screenshots and metadata
- Chrome Web Store submission
- Microsoft Edge Add-ons submission

---

## License

Add the project's final license here before public distribution.

Recommended for a personal/open-source project:

```text
MIT License
```

If you choose MIT, add a `LICENSE` file containing the standard MIT license text and update this section accordingly.

---

## Author

### Rajan Chaudhary

Full-Stack Developer

Portfolio: [rajanchaudhary947.vercel.app](https://rajanchaudhary947.vercel.app)

SafeBrowse was designed and developed as a practical exploration of browser extensions, web filtering, policy engines, event-driven architecture, local analytics, security, and privacy-oriented product engineering.
