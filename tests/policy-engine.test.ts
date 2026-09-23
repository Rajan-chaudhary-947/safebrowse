import { describe, expect, it } from 'vitest';
import { domainMatches, isTimeInSchedule, normalizeDomain, policyMatchesUrl, policySpecificity, resolvePolicyExplanation, resolveWinningPolicy } from '../src/common/utils';
import type { Policy } from '../src/common/types';

const base = (patch: Partial<Policy>): Policy => ({
  id: crypto.randomUUID(),
  name: 'Policy',
  type: 'DOMAIN',
  targets: ['example.com'],
  action: 'BLOCK',
  priority: 100,
  enabled: true,
  schedule: { enabled: false, days: [1, 2, 3, 4, 5], start: '08:00', end: '18:00' },
  createdAt: Date.now(),
  updatedAt: Date.now(),
  ...patch
});

describe('SafeBrowse policy engine', () => {
  it('normalizes domains and matches subdomains', () => {
    expect(normalizeDomain('https://WWW.YouTube.com/watch?v=1')).toBe('youtube.com');
    expect(domainMatches('music.youtube.com', 'youtube.com')).toBe(true);
    expect(domainMatches('notyoutube.com', 'youtube.com')).toBe(false);
  });

  it('supports ordinary and cross-midnight schedules', () => {
    const day = { enabled: true, days: [1], start: '08:00', end: '18:00' };
    expect(isTimeInSchedule(new Date('2026-09-21T10:00:00'), day)).toBe(true);
    expect(isTimeInSchedule(new Date('2026-09-21T19:00:00'), day)).toBe(false);

    const overnight = { enabled: true, days: [5], start: '22:00', end: '02:00' };
    expect(isTimeInSchedule(new Date('2026-09-25T23:00:00'), overnight)).toBe(true);
    expect(isTimeInSchedule(new Date('2026-09-26T01:00:00'), overnight)).toBe(true);
    expect(isTimeInSchedule(new Date('2026-09-26T23:00:00'), overnight)).toBe(false);
  });

  it('lets priority dominate specificity', () => {
    const broadHighPriority = base({ id: 'broad', targets: ['example.com'], priority: 200 });
    const specificLowPriority = base({ id: 'specific', type: 'URL_PATTERN', targets: ['https://example.com/education'], priority: 100 });
    expect(resolveWinningPolicy([specificLowPriority, broadHighPriority], 'https://example.com/education/lesson')?.id).toBe('broad');
  });

  it('uses specificity when policy priorities are equal', () => {
    const broadBlock = base({ id: 'block', targets: ['example.com'], priority: 100, action: 'BLOCK' });
    const specificAllow = base({ id: 'allow', type: 'URL_PATTERN', targets: ['https://example.com/education'], priority: 100, action: 'ALLOW' });
    expect(policySpecificity(specificAllow, specificAllow.targets[0])).toBeGreaterThan(policySpecificity(broadBlock, broadBlock.targets[0]));
    expect(resolveWinningPolicy([broadBlock, specificAllow], 'https://example.com/education/lesson')?.id).toBe('allow');
  });

  it('returns an ordered explanation for the simulator', () => {
    const block = base({ id: 'block', name: 'Block Example', priority: 100 });
    const allow = base({ id: 'allow', name: 'Allow Exception', action: 'ALLOW', priority: 100, type: 'URL_PATTERN', targets: ['https://example.com/edu'] });
    const result = resolvePolicyExplanation([block, allow], 'https://example.com/edu/lesson');
    expect(result.winner?.id).toBe('allow');
    expect(result.matches.map((policy) => policy.id)).toEqual(['allow', 'block']);
  });

  it('matches URL-prefix rules literally as a prefix', () => {
    const policy = base({ type: 'URL_PATTERN', targets: ['https://example.com/edu'], action: 'BLOCK' });
    expect(policyMatchesUrl(policy, 'https://example.com/education/lesson')).toBe(true);
    expect(policyMatchesUrl(policy, 'https://example.com/other')).toBe(false);
  });
});
