import { describe, expect, it } from 'vitest';
import { aggregateAnalytics } from '../src/common/analytics';
import type { ActivityEvent, Policy } from '../src/common/types';

const policy = (id: string, name: string, category?: string): Policy => ({
  id,
  name,
  type: category ? 'CATEGORY' : 'DOMAIN',
  targets: category ? [category] : ['example.com'],
  action: 'BLOCK',
  priority: 100,
  enabled: true,
  schedule: { enabled: false, days: [1, 2, 3, 4, 5], start: '08:00', end: '18:00' },
  createdAt: 1,
  updatedAt: 1
});

const event = (timestamp: number, domain: string, policyId: string, policyName: string, category?: string): ActivityEvent => ({
  id: crypto.randomUUID(), kind: 'BLOCKED_REQUEST', timestamp, domain, policyId, policyName, policyType: category ? 'CATEGORY' : 'DOMAIN', category
});

describe('SafeBrowse analytics aggregator', () => {
  it('aggregates domains, policies, categories, daily and hourly series', () => {
    const now = new Date('2026-09-23T15:30:00').getTime();
    const events = [
      event(new Date('2026-09-23T10:00:00').getTime(), 'youtube.com', 'p1', 'Streaming', 'Streaming'),
      event(new Date('2026-09-23T11:00:00').getTime(), 'youtube.com', 'p1', 'Streaming', 'Streaming'),
      event(new Date('2026-09-22T11:00:00').getTime(), 'instagram.com', 'p2', 'Social', 'Social Media')
    ];
    const result = aggregateAnalytics(events, [policy('p1', 'Streaming', 'Streaming'), policy('p2', 'Social', 'Social Media')], new Date(now));
    expect(result.blockedToday).toBe(2);
    expect(result.blocked7Days).toBe(3);
    expect(result.uniqueDomains).toBe(2);
    expect(result.byDomain[0]).toEqual(['youtube.com', 2]);
    expect(result.byPolicy[0]).toEqual(['Streaming', 2]);
    expect(result.byCategory[0]).toEqual(['Streaming', 2]);
    expect(result.daily).toHaveLength(7);
    expect(result.hourly.find((point) => point.hour === 10)?.count).toBe(1);
  });
});
