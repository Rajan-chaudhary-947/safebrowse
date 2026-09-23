import type { AppState, ActivityEvent, PersistedState, Policy, Profile, ProfileData, PublicSettings, Settings, SyncPayload } from './types';

export const DEFAULT_SETTINGS: Settings = {
  protectionEnabled: true,
  pinHash: '',
  retentionDays: 14,
  maxLogEntries: 1000,
  syncEnabled: false
};

const DEFAULT_PROFILE: Profile = {
  id: 'profile_default',
  name: 'Primary',
  color: '#2d64b6',
  createdAt: Date.now(),
  updatedAt: Date.now()
};

const AUTH_KEY = 'safebrowseAuth';
const CONFIG_KEYS = ['profiles', 'activeProfileId', 'profileData', 'settings', 'configUpdatedAt', 'policies', 'events'];
const SYNC_KEY = 'safebrowseSync';

function emptyData(): ProfileData {
  return { policies: [], events: [] };
}

function normalizeProfile(value: unknown, fallback: Profile): Profile {
  if (!value || typeof value !== 'object') return fallback;
  const v = value as Partial<Profile>;
  return {
    id: typeof v.id === 'string' && v.id ? v.id : fallback.id,
    name: typeof v.name === 'string' && v.name.trim() ? v.name.trim().slice(0, 40) : fallback.name,
    color: typeof v.color === 'string' && v.color ? v.color : fallback.color,
    createdAt: Number.isFinite(v.createdAt) ? Number(v.createdAt) : fallback.createdAt,
    updatedAt: Number.isFinite(v.updatedAt) ? Number(v.updatedAt) : fallback.updatedAt
  };
}

function normalizeSettings(value: unknown): Settings {
  const incoming = (value && typeof value === 'object' ? value : {}) as Partial<Settings>;
  return {
    ...DEFAULT_SETTINGS,
    ...incoming,
    retentionDays: [7, 14, 30, 90].includes(Number(incoming.retentionDays)) ? Number(incoming.retentionDays) : DEFAULT_SETTINGS.retentionDays,
    maxLogEntries: Math.min(5000, Math.max(100, Number(incoming.maxLogEntries) || DEFAULT_SETTINGS.maxLogEntries)),
    syncEnabled: Boolean(incoming.syncEnabled),
    protectionEnabled: incoming.protectionEnabled !== false,
    pinHash: typeof incoming.pinHash === 'string' ? incoming.pinHash : ''
  };
}

function normalizeData(value: unknown): ProfileData {
  if (!value || typeof value !== 'object') return emptyData();
  const input = value as Partial<ProfileData>;
  return {
    policies: Array.isArray(input.policies) ? input.policies as Policy[] : [],
    events: Array.isArray(input.events) ? input.events as ActivityEvent[] : []
  };
}

export async function getInternalState(): Promise<PersistedState> {
  const stored = await chrome.storage.local.get(CONFIG_KEYS);
  let profiles = Array.isArray(stored.profiles)
    ? (stored.profiles as unknown[]).map((p, i) => normalizeProfile(p, i === 0 ? DEFAULT_PROFILE : { ...DEFAULT_PROFILE, id: `profile_${i}` }))
    : [];

  const oldPolicies = Array.isArray(stored.policies) ? stored.policies as Policy[] : [];
  const oldEvents = Array.isArray(stored.events) ? stored.events as ActivityEvent[] : [];
  const storedProfileData = stored.profileData && typeof stored.profileData === 'object' ? stored.profileData as Record<string, unknown> : {};

  if (!profiles.length) profiles = [{ ...DEFAULT_PROFILE, createdAt: Date.now(), updatedAt: Date.now() }];

  const profileData: Record<string, ProfileData> = {};
  for (const profile of profiles) profileData[profile.id] = normalizeData(storedProfileData[profile.id]);

  // One-time migration from the original v2 scaffold into the profile-aware model.
  const migratedProfile = profileData[profiles[0].id];
  if (!migratedProfile.policies.length && oldPolicies.length) migratedProfile.policies = oldPolicies;
  if (!migratedProfile.events.length && oldEvents.length) migratedProfile.events = oldEvents;

  const activeCandidate = typeof stored.activeProfileId === 'string' ? stored.activeProfileId : profiles[0].id;
  const activeProfileId = profiles.some((profile) => profile.id === activeCandidate) ? activeCandidate : profiles[0].id;

  return {
    profiles,
    activeProfileId,
    profileData,
    settings: normalizeSettings(stored.settings),
    configUpdatedAt: Number.isFinite(stored.configUpdatedAt) ? Number(stored.configUpdatedAt) : Date.now()
  };
}

async function setInternalState(state: PersistedState): Promise<void> {
  await chrome.storage.local.set({ ...state });
}

async function getAuthSession(): Promise<{ unlocked: boolean; unlockedAt: number } | null> {
  const stored = await chrome.storage.session.get(AUTH_KEY);
  const session = stored[AUTH_KEY] as { unlocked?: boolean; unlockedAt?: number } | undefined;
  if (!session?.unlocked) return null;
  return { unlocked: true, unlockedAt: Number(session.unlockedAt) || Date.now() };
}

export async function isAdminUnlocked(settings?: Settings): Promise<boolean> {
  const rawSettings = settings ?? (await getInternalState()).settings;
  if (!rawSettings.pinHash) return true;
  const auth = await getAuthSession();
  if (!auth) return false;
  const autoLockMinutes = 30;
  if (Date.now() - auth.unlockedAt > autoLockMinutes * 60_000) {
    await chrome.storage.session.remove(AUTH_KEY);
    return false;
  }
  return true;
}

export async function setAdminUnlocked(unlocked: boolean): Promise<void> {
  if (!unlocked) {
    await chrome.storage.session.remove(AUTH_KEY);
    return;
  }
  await chrome.storage.session.set({ [AUTH_KEY]: { unlocked: true, unlockedAt: Date.now() } });
}

export async function touchAdminSession(): Promise<void> {
  const unlocked = await isAdminUnlocked();
  if (unlocked) await setAdminUnlocked(true);
}

export async function getState(): Promise<AppState> {
  const state = await getInternalState();
  const activeData = state.profileData[state.activeProfileId] ?? emptyData();
  const unlocked = await isAdminUnlocked(state.settings);
  const settings: PublicSettings = {
    protectionEnabled: state.settings.protectionEnabled,
    retentionDays: state.settings.retentionDays,
    maxLogEntries: state.settings.maxLogEntries,
    syncEnabled: state.settings.syncEnabled,
    pinConfigured: Boolean(state.settings.pinHash)
  };
  return {
    profiles: state.profiles,
    activeProfileId: state.activeProfileId,
    policies: activeData.policies,
    events: activeData.events,
    settings,
    auth: { unlocked, autoLockMinutes: 30 }
  };
}

export async function savePolicies(policies: Policy[]): Promise<void> {
  const state = await getInternalState();
  state.profileData[state.activeProfileId] = { ...(state.profileData[state.activeProfileId] ?? emptyData()), policies };
  state.configUpdatedAt = Date.now();
  await setInternalState(state);
  await syncIfEnabled(state);
}

export async function saveEvents(events: ActivityEvent[]): Promise<void> {
  const state = await getInternalState();
  state.profileData[state.activeProfileId] = { ...(state.profileData[state.activeProfileId] ?? emptyData()), events };
  await setInternalState(state);
}

export async function saveSettings(settings: Settings): Promise<void> {
  const state = await getInternalState();
  state.settings = settings;
  state.configUpdatedAt = Date.now();
  await setInternalState(state);
  await syncIfEnabled(state);
}

export async function switchProfile(profileId: string): Promise<void> {
  const state = await getInternalState();
  if (!state.profiles.some((profile) => profile.id === profileId)) throw new Error('Profile not found.');
  state.activeProfileId = profileId;
  state.configUpdatedAt = Date.now();
  await setInternalState(state);
  await syncIfEnabled(state);
}

export async function createProfile(profile: Profile): Promise<void> {
  const state = await getInternalState();
  if (state.profiles.some((item) => item.id === profile.id)) throw new Error('Profile already exists.');
  state.profiles = [...state.profiles, profile];
  state.profileData[profile.id] = emptyData();
  state.configUpdatedAt = Date.now();
  await setInternalState(state);
  await syncIfEnabled(state);
}

export async function deleteProfile(profileId: string): Promise<void> {
  const state = await getInternalState();
  if (state.profiles.length <= 1) throw new Error('At least one profile must remain.');
  state.profiles = state.profiles.filter((profile) => profile.id !== profileId);
  delete state.profileData[profileId];
  if (state.activeProfileId === profileId) state.activeProfileId = state.profiles[0].id;
  state.configUpdatedAt = Date.now();
  await setInternalState(state);
  await syncIfEnabled(state);
}

export async function appendEvent(event: ActivityEvent): Promise<ActivityEvent[]> {
  const state = await getInternalState();
  const active = state.profileData[state.activeProfileId] ?? emptyData();
  const retentionCutoff = Date.now() - state.settings.retentionDays * 24 * 60 * 60 * 1000;
  const next = [event, ...active.events]
    .filter((item) => item.timestamp >= retentionCutoff)
    .slice(0, state.settings.maxLogEntries);
  state.profileData[state.activeProfileId] = { ...active, events: next };
  await setInternalState(state);
  return next;
}

export async function clearActiveEvents(): Promise<void> {
  const state = await getInternalState();
  state.profileData[state.activeProfileId] = { ...(state.profileData[state.activeProfileId] ?? emptyData()), events: [] };
  await setInternalState(state);
}

export async function initializeState(): Promise<AppState> {
  const state = await getInternalState();
  await setInternalState(state);
  if (state.settings.syncEnabled) await pullSyncIfNewer(state);
  return await getState();
}

export interface BackupBundle {
  format: 'safebrowse-backup';
  version: 2;
  exportedAt: number;
  activeProfileId: string;
  profiles: Profile[];
  profileData: Record<string, ProfileData>;
  settings: Omit<Settings, 'pinHash'>;
}

export async function buildBackup(): Promise<BackupBundle> {
  const state = await getInternalState();
  return {
    format: 'safebrowse-backup',
    version: 2,
    exportedAt: Date.now(),
    activeProfileId: state.activeProfileId,
    profiles: state.profiles,
    profileData: state.profileData,
    settings: {
      protectionEnabled: state.settings.protectionEnabled,
      retentionDays: state.settings.retentionDays,
      maxLogEntries: state.settings.maxLogEntries,
      syncEnabled: state.settings.syncEnabled
    }
  };
}

function isValidSchedule(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  const schedule = value as Record<string, unknown>;
  const days = Array.isArray(schedule.days) ? schedule.days : [];
  return typeof schedule.enabled === 'boolean'
    && days.every((day) => Number.isInteger(day) && day >= 0 && day <= 6)
    && typeof schedule.start === 'string'
    && /^([01]\d|2[0-3]):[0-5]\d$/.test(schedule.start)
    && typeof schedule.end === 'string'
    && /^([01]\d|2[0-3]):[0-5]\d$/.test(schedule.end);
}

function isValidPolicy(value: unknown): value is Policy {
  if (!value || typeof value !== 'object') return false;
  const policy = value as Partial<Policy>;
  return typeof policy.id === 'string'
    && typeof policy.name === 'string'
    && policy.name.length > 0 && policy.name.length <= 80
    && ['DOMAIN', 'CATEGORY', 'URL_PATTERN'].includes(String(policy.type))
    && Array.isArray(policy.targets) && policy.targets.length > 0 && policy.targets.length <= 200
    && policy.targets.every((target) => typeof target === 'string' && target.length <= 2048)
    && (policy.action === 'BLOCK' || policy.action === 'ALLOW')
    && Number.isInteger(policy.priority) && Number(policy.priority) >= 1 && Number(policy.priority) <= 1000
    && typeof policy.enabled === 'boolean'
    && isValidSchedule(policy.schedule)
    && Number.isFinite(policy.createdAt)
    && Number.isFinite(policy.updatedAt);
}

function isValidEvent(value: unknown): value is ActivityEvent {
  if (!value || typeof value !== 'object') return false;
  const event = value as Partial<ActivityEvent>;
  return typeof event.id === 'string'
    && typeof event.kind === 'string'
    && Number.isFinite(event.timestamp)
    && (!event.domain || typeof event.domain === 'string')
    && (!event.policyId || typeof event.policyId === 'string')
    && (!event.policyName || typeof event.policyName === 'string')
    && (!event.profileId || typeof event.profileId === 'string');
}

export function validateBackup(value: unknown): value is BackupBundle {
  if (!value || typeof value !== 'object') return false;
  const v = value as Partial<BackupBundle>;
  if (v.format !== 'safebrowse-backup' || v.version !== 2) return false;
  if (!Array.isArray(v.profiles) || !v.profiles.length || !v.profileData || typeof v.profileData !== 'object') return false;
  if (typeof v.activeProfileId !== 'string' || !v.profiles.some((p) => p.id === v.activeProfileId)) return false;
  if (v.profiles.length > 20) return false;
  const profileIds = new Set<string>();
  for (const profile of v.profiles) {
    if (!profile || typeof profile.id !== 'string' || !profile.id || profileIds.has(profile.id)) return false;
    profileIds.add(profile.id);
    if (typeof profile.name !== 'string' || !profile.name.trim() || profile.name.length > 40) return false;
    const data = (v.profileData as Record<string, unknown>)[profile.id] as Partial<ProfileData> | undefined;
    if (!data || !Array.isArray(data.policies) || !Array.isArray(data.events)) return false;
    if (data.policies.length > 500 || data.events.length > 5000) return false;
    if (!data.policies.every(isValidPolicy) || !data.events.every(isValidEvent)) return false;
  }
  if (!v.settings || typeof v.settings !== 'object') return false;
  const settings = v.settings as Partial<Omit<Settings, 'pinHash'>>;
  return typeof settings.protectionEnabled === 'boolean'
    && [7, 14, 30, 90].includes(Number(settings.retentionDays))
    && [500, 1000, 2500, 5000].includes(Number(settings.maxLogEntries))
    && typeof settings.syncEnabled === 'boolean';
}

export async function restoreBackup(bundle: BackupBundle): Promise<void> {
  const current = await getInternalState();
  const profileData = Object.fromEntries(
    bundle.profiles.map((profile) => [profile.id, normalizeData(bundle.profileData[profile.id])])
  );
  await setInternalState({
    profiles: bundle.profiles,
    activeProfileId: bundle.activeProfileId,
    profileData,
    settings: {
      ...current.settings,
      protectionEnabled: bundle.settings.protectionEnabled !== false,
      retentionDays: bundle.settings.retentionDays,
      maxLogEntries: bundle.settings.maxLogEntries,
      syncEnabled: bundle.settings.syncEnabled
    },
    configUpdatedAt: Date.now()
  });
  await syncIfEnabled(await getInternalState());
}

export async function buildSyncPayload(state?: PersistedState): Promise<SyncPayload> {
  const current = state ?? await getInternalState();
  const policiesByProfile: Record<string, Policy[]> = {};
  for (const profile of current.profiles) policiesByProfile[profile.id] = current.profileData[profile.id]?.policies ?? [];
  return {
    version: 1,
    updatedAt: current.configUpdatedAt,
    profiles: current.profiles,
    activeProfileId: current.activeProfileId,
    policiesByProfile
  };
}

export async function pushSync(): Promise<void> {
  const state = await getInternalState();
  if (!state.settings.syncEnabled) throw new Error('Chrome Sync is disabled. Enable it first.');
  const payload = await buildSyncPayload(state);
  const bytes = new TextEncoder().encode(JSON.stringify(payload)).byteLength;
  if (bytes > 90_000) throw new Error('Configuration is too large for Chrome Sync. Export a backup or reduce policy count.');
  await chrome.storage.sync.set({ [SYNC_KEY]: payload });
}

export async function pullSyncIfNewer(local?: PersistedState): Promise<boolean> {
  const current = local ?? await getInternalState();
  if (!current.settings.syncEnabled) return false;
  const remote = (await chrome.storage.sync.get(SYNC_KEY))[SYNC_KEY] as SyncPayload | undefined;
  if (!remote || remote.version !== 1 || !Number.isFinite(remote.updatedAt)) return false;
  if (remote.updatedAt <= current.configUpdatedAt) return false;
  const profileData = { ...current.profileData };
  for (const profile of remote.profiles) {
    profileData[profile.id] = { policies: Array.isArray(remote.policiesByProfile[profile.id]) ? remote.policiesByProfile[profile.id] : (profileData[profile.id]?.policies ?? []), events: profileData[profile.id]?.events ?? [] };
  }
  for (const id of Object.keys(profileData)) if (!remote.profiles.some((profile) => profile.id === id)) delete profileData[id];
  await setInternalState({
    ...current,
    profiles: remote.profiles,
    activeProfileId: remote.profiles.some((profile) => profile.id === remote.activeProfileId) ? remote.activeProfileId : remote.profiles[0].id,
    profileData,
    configUpdatedAt: remote.updatedAt
  });
  return true;
}

async function syncIfEnabled(state: PersistedState): Promise<void> {
  if (!state.settings.syncEnabled) return;
  try { await pushSync(); } catch { /* UI surfaces sync errors when explicitly requested. */ }
}
