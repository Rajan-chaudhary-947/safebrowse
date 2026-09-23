# SafeBrowse — Web Policy & Parental Controls

SafeBrowse is a **local-first browser extension for web filtering and parental controls**. It turns user-defined access rules into browser-enforced policies and provides a management console for domains, categories, schedules, profiles, activity, analytics, and administration.

Built with **React, TypeScript, Vite, and Manifest V3**, SafeBrowse treats web blocking as a **policy-engine problem** rather than a simple static blocklist. Policies can be combined with priorities, schedules, profiles, exceptions, and enforcement analytics.

> **Primary targets:** Google Chrome and Microsoft Edge
> **Extension platform:** Chromium / Manifest V3

---

## Overview

A basic website blocker usually works like:

```text
Add website → Block website
```

That works for simple use cases, but becomes limited when users need more control.

SafeBrowse is designed to support scenarios such as:

* blocking social media during school or work hours;
* allowing specific exceptions inside broader blocked domains;
* managing different rules for different profiles;
* scheduling restrictions automatically;
* testing policies before applying them;
* protecting administration with a parent PIN;
* understanding which policies are producing blocked requests.

The result is a browser-level policy system rather than a simple URL blocker.

---

## Key Features

### Domain & Website Blocking

Create policies for individual domains or URL targets.

```text
youtube.com      → BLOCK
instagram.com    → BLOCK
reddit.com       → BLOCK
```

Policies are translated into browser-level declarative rules for top-level navigation requests.

### Allow Rules & Exceptions

SafeBrowse supports both `BLOCK` and `ALLOW` policies.

Example:

```text
Block:
youtube.com

Allow:
youtube.com/education/*
```

This allows specific exceptions to coexist with broader restrictions.

### Category Filtering

Users can create policies around configured categories such as:

```text
Social Media
Gaming
Streaming
Shopping
```

Category targets are expanded into their configured domains and processed through the same policy engine.

### Scheduled Restrictions

Policies can operate only during configured days and time windows.

Example:

```text
Policy: School Hours
Category: Social Media
Action: BLOCK
Days: Monday–Friday
Time: 08:00–16:00
```

Cross-midnight schedules such as:

```text
22:00 → 06:00
```

are supported.

Scheduling is coordinated through the browser alarms API so the management console does not need to remain open.

### Policy Priorities & Conflict Resolution

Multiple policies may match the same destination.

Example:

```text
Rule A
Block youtube.com
Priority: 100

Rule B
Allow youtube.com/education/*
Priority: 200
```

SafeBrowse evaluates applicable rules deterministically so overlapping policies and exceptions produce predictable results.

### Policy Simulator

Test a URL against the active policy set before relying on it.

```text
URL:
https://example.com

Result:
BLOCKED

Matched policy:
School Hours
```

The simulator uses the same policy decision logic used by the enforcement layer.

### Multiple Profiles

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

Each profile maintains its own policy configuration and enforcement history.

### Parent Console Protection

Administrative controls can be protected by a parent PIN.

SafeBrowse does not store the raw PIN. It uses a salted PBKDF2-derived verifier through the Web Crypto API.

The parent console can be locked after configuration changes.

### Activity Logging

When a top-level navigation is blocked, SafeBrowse records a policy-enforcement event for its Activity and Analytics features.

Events can include:

```text
Domain
Timestamp
Profile
Policy
Policy type
Category
Event type
```

The design focuses on **policy-enforcement activity**, not a general browser-history database.

### Analytics Dashboard

The dashboard aggregates local enforcement events into:

* blocked requests today;
* seven-day blocked activity;
* blocked activity by hour;
* top blocked destinations;
* policy impact;
* category activity;
* recent activity.

The analytics layer is separated from the enforcement engine so raw events and derived metrics remain distinct responsibilities.

### Backup & Restore

Users can export supported SafeBrowse configuration and restore it later.

Imported configuration is validated before being accepted.

### Optional Browser Sync

SafeBrowse can use browser-provided extension synchronization for supported configuration such as profiles and policies.

Local authentication material and local activity history are intentionally kept out of the synchronization path.

### Local-First Design

SafeBrowse does not require a SafeBrowse backend for core policy enforcement.

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

### Responsive Product UI

The management interface supports:

* desktop layouts;
* tablet layouts;
* mobile layouts;
* small-screen layouts;
* responsive navigation;
* responsive policy cards;
* responsive charts;
* responsive filters;
* responsive forms and modals;
* light and dark themes;
* consistent SR branding.

---

## How SafeBrowse Works

A blocked navigation follows this flow:

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

The key separation is:

```text
Policy Engine
      ↓
Policy Decision
      ↓
Browser Enforcement
```

and independently:

```text
Enforcement Event
      ↓
Local Analytics
```

Blocking does not depend on the dashboard remaining open.

---

## Architecture

```text
                         SafeBrowse
                              │
              ┌───────────────┼───────────────┐
              │               │               │
              ▼               ▼               ▼
        React + TS       Service Worker    Blocked Page
              │               │               │
              │               ├─ Policy Engine
              │               ├─ Rule Generator
              │               ├─ Scheduler
              │               ├─ Activity Logger
              │               └─ Message Handler
              │               │
              └───────────────┼───────────────┘
                              │
                              ▼
                  declarativeNetRequest
                              │
                       ┌──────┴──────┐
                       │             │
                     ALLOW         BLOCK
                                     │
                                     ▼
                               blocked.html
```

### React UI

Handles the dashboard, popup, blocked page, policies, profiles, settings, analytics, and user interaction.

### Service Worker

Handles background/event-driven operations such as policy updates, rule generation, scheduling, state coordination, and message handling.

### Policy Engine

Evaluates targets, schedules, priorities, profiles, and conflicts.

### declarativeNetRequest

Performs browser-level request handling using generated declarative rules.

### Browser Storage

Persists policies, profiles, settings, and policy-enforcement activity required by the application.

---

## Policy Engine

SafeBrowse's policy model is based on concepts such as:

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

Supported policy concepts include:

```text
DOMAIN
CATEGORY
URL_PATTERN

BLOCK
ALLOW
```

The engine also evaluates:

* enabled/disabled state;
* profile ownership;
* schedule windows;
* overlapping policies;
* policy priority;
* specific exceptions.

The decision logic is kept separate from the UI so it can be reused by both the simulator and enforcement layer.

---

## Analytics Pipeline

```text
Blocked navigation
        ↓
BLOCKED_REQUEST
        ↓
Local event storage
        ↓
Aggregation
        ├── Today
        ├── Last 7 days
        ├── By hour
        ├── By domain
        ├── By policy
        └── By category
        ↓
Dashboard
```

This allows SafeBrowse to answer questions such as:

```text
How many requests were blocked today?
Which destinations were blocked most often?
Which policies caused the most blocks?
At which hours are restrictions triggered most often?
```

---

## Security & Privacy

SafeBrowse is designed as a privacy-oriented, local-first browser extension.

### Security Choices

* Manifest V3 architecture;
* no remotely executed JavaScript or WebAssembly;
* salted PBKDF2-derived PIN verification;
* no plaintext PIN storage;
* validated configuration imports;
* declarative browser-level enforcement;
* sensitive authentication material excluded from optional sync.

### Data Handling

SafeBrowse does not intentionally collect:

```text
Passwords
Payment information
Health information
Private messages
Page text
Form contents
Device location
```

The Activity and Analytics features record limited policy-enforcement information such as blocked domains and associated policy metadata.

### Privacy Policy

https://rajanchaudhary947.vercel.app/safebrowse/privacy

---

## Technology Stack

### Frontend

* React
* TypeScript
* Vite
* CSS

### Browser Platform

* Manifest V3
* `declarativeNetRequest`
* `chrome.storage`
* `chrome.alarms`
* `chrome.runtime`

### Security

* Web Crypto API
* PBKDF2

### Testing

* Vitest
* TypeScript compilation checks

---

## Project Structure

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

---

## Getting Started

### Prerequisites

* Node.js LTS
* npm
* Microsoft Edge or Google Chrome

Verify:

```bash
node -v
npm -v
```

### Install dependencies

```bash
npm install
```

---

## Testing

Run the test suite:

```bash
npm test
```

The test suite covers core areas including:

* policy behavior;
* analytics aggregation;
* security and authentication behavior.

Current baseline:

```text
Test Files  3 passed
Tests       10 passed
```

---

## Build

Create the production extension bundle:

```bash
npm run build
```

The output is generated in:

```text
dist/
```

The built package contains `manifest.json` directly at its root.

---

## Run in Microsoft Edge

Build the extension:

```bash
npm run build
```

Open:

```text
edge://extensions
```

Enable **Developer mode**.

Click **Load unpacked**.

Select:

```text
dist/
```

SafeBrowse will then appear as an installed developer extension.

### Test a blocking policy

Create:

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

The navigation should be redirected to the SafeBrowse blocked page according to the active policy.

---

## Run in Google Chrome

Build:

```bash
npm run build
```

Open:

```text
chrome://extensions
```

Enable **Developer mode**.

Select **Load unpacked** and choose:

```text
dist/
```

SafeBrowse is designed around Chromium extension APIs, so Chrome and Edge are the primary development targets.

---

## Configuration & Data

SafeBrowse stores application state through browser-managed extension storage.

Stored configuration can include:

```text
Profiles
Policies
Settings
Supported sync configuration
Policy-enforcement events
```

### Backups

Exported configuration files may contain SafeBrowse policy/profile information and should be treated as private configuration.

### Sync

Optional browser synchronization is intended for supported configuration rather than local activity history or authentication material.

---

## Permission Model

SafeBrowse uses permissions aligned with its web-filtering purpose.

| Permission              | Purpose                                                                        |
| ----------------------- | ------------------------------------------------------------------------------ |
| `declarativeNetRequest` | Enforce user-defined web filtering rules through browser-declarative requests. |
| `storage`               | Persist policies, profiles, settings, and local enforcement data.              |
| `alarms`                | Trigger scheduled policy changes.                                              |
| `http://*/*`            | Apply filtering to HTTP website navigation.                                    |
| `https://*/*`           | Apply filtering to HTTPS website navigation.                                   |

SafeBrowse does not use remote executable code and does not require a user account for its core functionality.

---

## Browser Compatibility

### Primary targets

* Google Chrome
* Microsoft Edge

### Additional Chromium browsers

The architecture is Chromium-oriented and may also work with:

* Brave
* Opera

Each browser should be tested independently before being considered officially supported because browser APIs, update behavior, and store requirements can differ.

### Not currently targeted

* Firefox
* Safari

Those browsers require separate compatibility testing and potentially different packaging or API handling.

---

## Limitations

SafeBrowse is a **browser-level web filtering system**.

It does not automatically provide operating-system-wide network filtering.

It does not directly control:

```text
Other browsers
Desktop applications
Router traffic
Operating-system networking
Mobile applications
```

A user with sufficient control over the device may also be able to disable or remove a browser extension. Stronger device-management guarantees require OS-level, enterprise, DNS, router, or network controls.

SafeBrowse should therefore be considered a **browser web-filtering and parental-control extension**, not a complete device-management solution.

---

## Release & Store Publishing

SafeBrowse is designed for distribution through official browser extension stores.

### Microsoft Edge Add-ons

```text
Source Code
    ↓
npm test
    ↓
npm run build
    ↓
Package dist/
    ↓
Microsoft Partner Center
    ↓
Privacy + Permissions + Store Listing
    ↓
Certification
    ↓
Edge Add-ons
```

### Chrome Web Store

```text
Source Code
    ↓
npm test
    ↓
npm run build
    ↓
Package dist/
    ↓
Chrome Web Store
    ↓
Privacy + Permissions + Store Listing
    ↓
Review
    ↓
Chrome Web Store
```

### Versioning

Extension releases follow semantic-style version progression:

```text
2.0.0
2.0.1
2.1.0
3.0.0
```

Each published update requires an increased extension version in `manifest.json`.

---

## Development Workflow

```text
Edit source
    ↓
npm test
    ↓
npm run build
    ↓
Reload extension
    ↓
Test in Edge / Chrome
    ↓
Inspect service worker logs when required
```

Changes affecting the policy engine, service worker, rule generation, or analytics should be verified through the complete browser flow rather than relying only on unit tests.

---

## Future Scope

Potential future improvements include:

* encrypted cloud backups;
* remote parent/child account management;
* multi-device policy synchronization;
* richer category databases;
* browser-specific adapters;
* stronger enterprise/device-management integrations;
* advanced policy simulation and debugging;
* optional native networking companion;
* additional automated browser tests;
* performance benchmarking for large rule sets.

---

## Project Status

**Release Preparation**

### Implemented

* Manifest V3 architecture
* Domain-based blocking
* Allow/block policies
* Category filtering
* Scheduled policies
* Policy priorities and conflict handling
* Multiple profiles
* Parent PIN protection
* Policy simulator
* Local activity logging
* Analytics dashboard
* Backup/restore
* Optional browser configuration sync
* Responsive management UI
* Light/dark theme
* SR branding
* Automated tests
* Production Vite build

### Release Targets

* Google Chrome
* Microsoft Edge

---

## Author

### Rajan Chaudhary

**Full-Stack Developer**

[Portfolio](https://rajanchaudhary947.vercel.app)

SafeBrowse is a practical exploration of browser extension development, web filtering, policy engines, event-driven architecture, local analytics, security, and privacy-oriented product engineering.
