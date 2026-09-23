import type { ActivityEvent, Policy, Profile } from './types';

export type Message =
  | { type: 'GET_STATE' }
  | { type: 'REFRESH_RULES' }
  | { type: 'UPSERT_POLICY'; policy: Policy }
  | { type: 'DELETE_POLICY'; policyId: string }
  | { type: 'TOGGLE_PROTECTION'; enabled: boolean }
  | { type: 'LOG_EVENT'; event: ActivityEvent }
  | { type: 'SIMULATE'; url: string }
  | { type: 'SET_PIN'; pin: string; currentPin?: string }
  | { type: 'VERIFY_PIN'; pin: string }
  | { type: 'LOCK_ADMIN' }
  | { type: 'CREATE_PROFILE'; profile: Profile }
  | { type: 'SWITCH_PROFILE'; profileId: string }
  | { type: 'DELETE_PROFILE'; profileId: string }
  | { type: 'SET_RETENTION'; retentionDays: number; maxLogEntries?: number }
  | { type: 'CLEAR_ACTIVITY' }
  | { type: 'EXPORT_BACKUP' }
  | { type: 'IMPORT_BACKUP'; bundle: unknown }
  | { type: 'SET_SYNC_ENABLED'; enabled: boolean }
  | { type: 'SYNC_PUSH' }
  | { type: 'SYNC_PULL' }
  | {
    type: 'RECORD_BLOCKED_PAGE';
    url: string;
    policyId?: string;
    profileId?: string;
  };
