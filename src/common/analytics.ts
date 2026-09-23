import type { ActivityEvent, Policy } from './types';

export interface AnalyticsSummary {
  blockedToday: number;
  blocked7Days: number;
  totalBlocked: number;
  uniqueDomains: number;
  byDomain: [string, number][];
  byPolicy: [string, number][];
  byCategory: [string, number][];
  daily: { label: string; count: number; timestamp: number }[];
  hourly: { hour: number; count: number }[];
}

export function aggregateAnalytics(events: ActivityEvent[], policies: Policy[], now = new Date()): AnalyticsSummary {
  const blocked = events.filter((event) => event.kind === 'BLOCKED_REQUEST');
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const sevenDays = today.getTime() - 6 * 24 * 60 * 60 * 1000;

  const countBy = (selector: (event: ActivityEvent) => string) => {
    const counter = new Map<string, number>();
    for (const event of blocked) {
      const key = selector(event) || 'Unknown';
      counter.set(key, (counter.get(key) ?? 0) + 1);
    }
    return [...counter.entries()].sort((a, b) => b[1] - a[1]);
  };

  const policyMap = new Map(policies.map((policy) => [policy.id, policy]));
  const byCategory = countBy((event) => {
    if (event.category) return event.category;
    const policy = event.policyId ? policyMap.get(event.policyId) : undefined;
    return policy?.type === 'CATEGORY' ? policy.targets[0] ?? 'Category' : 'Custom rules';
  });

  const daily = Array.from({ length: 7 }, (_, offset) => {
    const day = new Date(today);
    day.setDate(today.getDate() - (6 - offset));
    const start = day.getTime();
    const end = start + 24 * 60 * 60 * 1000;
    return {
      label: new Intl.DateTimeFormat(undefined, { weekday: 'short' }).format(day),
      count: blocked.filter((event) => event.timestamp >= start && event.timestamp < end).length,
      timestamp: start
    };
  });

  const hourly = Array.from({ length: 24 }, (_, hour) => ({
    hour,
    count: blocked.filter((event) => new Date(event.timestamp).getHours() === hour).length
  }));

  return {
    blockedToday: blocked.filter((event) => event.timestamp >= today.getTime()).length,
    blocked7Days: blocked.filter((event) => event.timestamp >= sevenDays).length,
    totalBlocked: blocked.length,
    uniqueDomains: new Set(blocked.map((event) => event.domain).filter(Boolean)).size,
    byDomain: countBy((event) => event.domain ?? 'Unknown').slice(0, 8),
    byPolicy: countBy((event) => event.policyName ?? event.policyId ?? 'Unknown').slice(0, 8),
    byCategory: byCategory.slice(0, 8),
    daily,
    hourly
  };
}
