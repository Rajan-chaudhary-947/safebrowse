import type { Policy, Schedule } from './types';
import { CATEGORY_CATALOG } from './catalog';

export function uid(prefix = 'id') {
  return `${prefix}_${crypto.randomUUID()}`;
}

export function normalizeDomain(input: string): string {
  let value = input.trim().toLowerCase();
  if (!value) throw new Error('Domain cannot be empty.');
  if (!value.includes('://')) value = `https://${value}`;
  const url = new URL(value);
  const hostname = url.hostname.replace(/^www\./, '').replace(/\.$/, '');
  if (!hostname || !hostname.includes('.') || hostname.includes(' ')) throw new Error('Enter a valid domain such as youtube.com.');
  return hostname;
}

export function normalizeUrlPattern(input: string): string {
  const value = input.trim();
  if (!value) throw new Error('URL pattern cannot be empty.');
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Only HTTP(S) URL patterns are supported.');
  return value;
}

export function isTimeInSchedule(now: Date, schedule: Schedule): boolean {
  if (!schedule.enabled) return true;
  const [sh, sm] = schedule.start.split(':').map(Number);
  const [eh, em] = schedule.end.split(':').map(Number);
  const start = sh * 60 + sm;
  const end = eh * 60 + em;
  const current = now.getHours() * 60 + now.getMinutes();
  if (start === end) return schedule.days.includes(now.getDay());
  if (start < end) return schedule.days.includes(now.getDay()) && current >= start && current < end;
  // For cross-midnight windows, late-night time belongs to the selected start day,
  // while after-midnight time belongs to the previous selected day.
  if (current >= start) return schedule.days.includes(now.getDay());
  const previousDay = (now.getDay() + 6) % 7;
  return current < end && schedule.days.includes(previousDay);
}

export function expandPolicyTargets(policy: Policy): string[] {
  if (policy.type === 'CATEGORY') {
    return policy.targets
      .flatMap((category) => CATEGORY_CATALOG[category] ?? [])
      .map(normalizeDomain);
  }
  return policy.targets
    .map((target) => policy.type === 'DOMAIN' ? normalizeDomain(target) : normalizeUrlPattern(target))
    .filter(Boolean);
}

export function domainMatches(hostname: string, domain: string): boolean {
  const host = hostname.replace(/^www\./, '').toLowerCase();
  const target = domain.replace(/^www\./, '').toLowerCase();
  return host === target || host.endsWith(`.${target}`);
}

export function policyMatchesUrl(policy: Policy, inputUrl: string, now = new Date()): boolean {
  if (!policy.enabled || !isTimeInSchedule(now, policy.schedule)) return false;
  let url: URL;
  try { url = new URL(inputUrl); } catch { return false; }
  if (policy.type === 'URL_PATTERN') {
    return expandPolicyTargets(policy).some((target) => inputUrl.toLowerCase().startsWith(target.toLowerCase()));
  }
  return expandPolicyTargets(policy).some((target) => domainMatches(url.hostname, target));
}

export function policySpecificity(policy: Policy, target?: string): number {
  if (policy.type === 'URL_PATTERN') return 10_000 + Math.min(9_000, (target ?? policy.targets[0] ?? '').length);
  if (policy.type === 'DOMAIN') return 1_000 + Math.min(900, (target ?? '').split('.').filter(Boolean).length * 50);
  return 100;
}

export function resolveWinningPolicy(policies: Policy[], inputUrl: string, now = new Date()): Policy | null {
  const matches = policies.filter((policy) => policyMatchesUrl(policy, inputUrl, now));
  matches.sort((a, b) => {
    if (b.priority !== a.priority) return b.priority - a.priority;
    const aSpecific = Math.max(...expandPolicyTargets(a).map((target) => policySpecificity(a, target)));
    const bSpecific = Math.max(...expandPolicyTargets(b).map((target) => policySpecificity(b, target)));
    if (bSpecific !== aSpecific) return bSpecific - aSpecific;
    if (a.action !== b.action) return a.action === 'ALLOW' ? -1 : 1;
    return b.updatedAt - a.updatedAt;
  });
  return matches[0] ?? null;
}

export function resolvePolicyExplanation(policies: Policy[], inputUrl: string, now = new Date()) {
  const matches = policies
    .filter((policy) => policyMatchesUrl(policy, inputUrl, now))
    .sort((a, b) => {
      if (b.priority !== a.priority) return b.priority - a.priority;
      const as = Math.max(...expandPolicyTargets(a).map((target) => policySpecificity(a, target)));
      const bs = Math.max(...expandPolicyTargets(b).map((target) => policySpecificity(b, target)));
      if (bs !== as) return bs - as;
      if (a.action !== b.action) return a.action === 'ALLOW' ? -1 : 1;
      return b.updatedAt - a.updatedAt;
    });
  return { winner: matches[0] ?? null, matches };
}

export function domainRuleFilter(domain: string): string {
  return `||${normalizeDomain(domain)}/`;
}

export function urlPrefixFilter(value: string): string {
  return `|${value.replace(/([\\|*^])/g, '\\$1')}`;
}

export function escapeUrlFilter(value: string): string {
  return urlPrefixFilter(value);
}

export function formatRelativeTime(timestamp: number): string {
  const diff = Math.max(0, Date.now() - timestamp);
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;
  if (diff < minute) return 'just now';
  if (diff < hour) return `${Math.floor(diff / minute)}m ago`;
  if (diff < day) return `${Math.floor(diff / hour)}h ago`;
  return `${Math.floor(diff / day)}d ago`;
}

export function formatDateTime(timestamp: number): string {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(timestamp);
}

export function minutesBetween(start: string, end: string): number {
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  const a = sh * 60 + sm;
  const b = eh * 60 + em;
  const diff = b - a;
  return diff <= 0 ? diff + 24 * 60 : diff;
}
