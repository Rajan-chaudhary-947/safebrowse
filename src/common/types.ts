export type PolicyAction = 'BLOCK' | 'ALLOW';
export type PolicyType = 'DOMAIN' | 'CATEGORY' | 'URL_PATTERN';

export interface Schedule {
  enabled: boolean;
  days: number[]; // 0 = Sunday, 6 = Saturday
  start: string; // HH:mm
  end: string;   // HH:mm
}

export interface Policy {
  id: string;
  name: string;
  type: PolicyType;
  targets: string[];
  action: PolicyAction;
  priority: number;
  enabled: boolean;
  schedule: Schedule;
  createdAt: number;
  updatedAt: number;
}

export interface Profile {
  id: string;
  name: string;
  color: string;
  createdAt: number;
  updatedAt: number;
}

export interface ProfileData {
  policies: Policy[];
  events: ActivityEvent[];
}

export type ActivityKind =
  | 'BLOCKED_REQUEST'
  | 'POLICY_CREATED'
  | 'POLICY_UPDATED'
  | 'POLICY_DELETED'
  | 'SCHEDULE_ACTIVATED'
  | 'TEMPORARY_UNLOCK'
  | 'PROFILE_CREATED'
  | 'PROFILE_SWITCHED'
  | 'PROFILE_DELETED'
  | 'PIN_SET'
  | 'PIN_CHANGED'
  | 'IMPORT'
  | 'EXPORT'
  | 'SYNC_PUSH'
  | 'SYNC_PULL'
  | 'SETTINGS_CHANGED';

export interface ActivityEvent {
  id: string;
  kind: ActivityKind;
  timestamp: number;
  domain?: string;
  policyId?: string;
  policyName?: string;
  policyType?: PolicyType;
  category?: string;
  profileId?: string;
  detail?: string;
}

export interface Settings {
  protectionEnabled: boolean;
  pinHash: string;
  retentionDays: number;
  maxLogEntries: number;
  syncEnabled: boolean;
}

export type PublicSettings = Omit<Settings, 'pinHash'> & {
  pinConfigured: boolean;
};

export interface AuthState {
  unlocked: boolean;
  autoLockMinutes: number;
}

export interface AppState {
  profiles: Profile[];
  activeProfileId: string;
  policies: Policy[];
  events: ActivityEvent[];
  settings: PublicSettings;
  auth: AuthState;
}

export interface PersistedState {
  profiles: Profile[];
  activeProfileId: string;
  profileData: Record<string, ProfileData>;
  settings: Settings;
  configUpdatedAt: number;
}

export interface SyncPayload {
  version: 1;
  updatedAt: number;
  profiles: Profile[];
  activeProfileId: string;
  policiesByProfile: Record<string, Policy[]>;
}
