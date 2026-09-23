import { verifyPin, hashPin, validatePin } from '../common/auth';
import { appendEvent, buildBackup, clearActiveEvents, createProfile, deleteProfile, getInternalState, getState, initializeState, isAdminUnlocked, pushSync, pullSyncIfNewer, restoreBackup, savePolicies, saveSettings, setAdminUnlocked, switchProfile } from '../common/storage';
import { domainRuleFilter, expandPolicyTargets, isTimeInSchedule, normalizeDomain, policySpecificity, resolvePolicyExplanation, resolveWinningPolicy, urlPrefixFilter } from '../common/utils';
import { validateBackup } from '../common/storage';
const SCHEDULE_ALARM = 'safebrowse-schedule-tick';
const RULE_ID_START = 1000;
const MAX_RULES_BUDGET = 10_000;
const MAX_UNSAFE_REDIRECT_TARGETS = 4_500;
function policyRulePriority(policy, target) {
    // Deliberately encode application priority and target specificity into browser priority.
    // This keeps the local simulator and Chrome's rule evaluation aligned.
    return Math.min(2_000_000_000, policy.priority * 900_000 + policySpecificity(policy, target));
}
function policyUrlFilter(policy, target) {
    return policy.type === 'DOMAIN' || policy.type === 'CATEGORY'
        ? domainRuleFilter(target)
        : urlPrefixFilter(target);
}
function activePolicy(policy, now) {
    return policy.enabled && isTimeInSchedule(now, policy.schedule);
}
async function createDynamicRules(policies) {
    const state = await getInternalState();
    const existingIds = await getCurrentRuleIds();
    if (!state.settings.protectionEnabled) {
        if (existingIds.length)
            await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds: existingIds });
        return 0;
    }
    const now = new Date();
    const active = policies.filter((policy) => activePolicy(policy, now));
    const rules = [];
    let nextRuleId = RULE_ID_START;
    let unsafeRedirectTargets = 0;
    for (const policy of active) {
        let targets;
        try {
            targets = [...new Set(expandPolicyTargets(policy))];
        }
        catch (error) {
            console.warn('Skipping invalid policy', policy.id, error);
            continue;
        }
        for (const target of targets) {
            const priority = policyRulePriority(policy, target);
            const urlFilter = policyUrlFilter(policy, target);
            if (policy.action === 'BLOCK') {
                rules.push({
                    id: nextRuleId++,
                    priority,
                    action: {
                        type: 'redirect',
                        redirect: {
                            url: `${chrome.runtime.getURL('blocked.html')}?site=${encodeURIComponent(target)}&policyId=${encodeURIComponent(policy.id)}&profileId=${encodeURIComponent(state.activeProfileId)}`
                        }
                    },
                    condition: {
                        urlFilter,
                        resourceTypes: ['main_frame']
                    }
                });
                unsafeRedirectTargets += 1;
                if (unsafeRedirectTargets > MAX_UNSAFE_REDIRECT_TARGETS) {
                    throw new Error(`Too many redirect-based blocked targets. Reduce policies below ${MAX_UNSAFE_REDIRECT_TARGETS} targets.`);
                }
                rules.push({
                    id: nextRuleId++,
                    priority,
                    action: { type: 'block' },
                    condition: { urlFilter, resourceTypes: ['sub_frame', 'script', 'image', 'stylesheet', 'font', 'xmlhttprequest', 'media', 'websocket', 'ping', 'other'] }
                });
            }
            else {
                rules.push({
                    id: nextRuleId++,
                    priority,
                    action: { type: 'allow' },
                    condition: { urlFilter, resourceTypes: ['main_frame', 'sub_frame', 'script', 'image', 'stylesheet', 'font', 'xmlhttprequest', 'media', 'websocket', 'ping', 'other'] }
                });
            }
            if (rules.length >= MAX_RULES_BUDGET) {
                throw new Error(`Rule budget exceeded. Reduce policies or categories below ${MAX_RULES_BUDGET} generated rules.`);
            }
        }
    }
    await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds: existingIds, addRules: rules });
    return rules.length;
}
async function getCurrentRuleIds() {
    const rules = await chrome.declarativeNetRequest.getDynamicRules();
    return rules.map((rule) => rule.id).filter((id) => id >= RULE_ID_START);
}
async function setupAlarm() {
    const existing = await chrome.alarms.get(SCHEDULE_ALARM);
    if (!existing)
        await chrome.alarms.create(SCHEDULE_ALARM, { periodInMinutes: 1 });
}
async function requireAdmin() {
    const state = await getInternalState();
    if (!(await isAdminUnlocked(state.settings)))
        throw new Error('Parent authentication required.');
    await setAdminUnlocked(true);
}
async function rebuild() {
    const state = await getInternalState();
    await createDynamicRules(state.profileData[state.activeProfileId]?.policies ?? []);
}
async function recordBlockedPage(originalUrl, policyId, profileId) {
    const state = await getInternalState();
    if (!state.settings.protectionEnabled) {
        return { ok: true };
    }
    const targetProfileId = profileId && state.profileData[profileId]
        ? profileId
        : state.activeProfileId;
    const policies = state.profileData[targetProfileId]?.policies ?? [];
    const winner = policyId
        ? policies.find((policy) => policy.id === policyId &&
            policy.action === 'BLOCK')
        : resolveWinningPolicy(policies, originalUrl, new Date());
    if (!winner || winner.action !== 'BLOCK') {
        return { ok: true };
    }
    let hostname = 'unknown';
    try {
        hostname = new URL(originalUrl).hostname;
    }
    catch {
        try {
            hostname = normalizeDomain(originalUrl);
        }
        catch {
            // Keep "unknown"
        }
    }
    await appendEvent({
        id: crypto.randomUUID(),
        kind: 'BLOCKED_REQUEST',
        timestamp: Date.now(),
        domain: hostname,
        policyId: winner.id,
        policyName: winner.name,
        policyType: winner.type,
        category: winner.type === 'CATEGORY'
            ? winner.targets[0]
            : undefined,
        profileId: targetProfileId,
        detail: 'Top-level navigation redirected to SafeBrowse blocked page'
    });
    return { ok: true };
}
async function handleMessage(message) {
    if (message.type === 'GET_STATE')
        return getState();
    if (message.type === 'VERIFY_PIN') {
        const state = await getInternalState();
        if (!state.settings.pinHash)
            return { ok: true, alreadyUnlocked: true };
        validatePin(message.pin);
        const ok = await verifyPin(message.pin, state.settings.pinHash);
        if (ok)
            await setAdminUnlocked(true);
        return { ok };
    }
    if (message.type === 'SET_PIN') {
        const state = await getInternalState();
        if (state.settings.pinHash) {
            await requireAdmin();
            if (!message.currentPin || !(await verifyPin(message.currentPin, state.settings.pinHash)))
                throw new Error('Current PIN is incorrect.');
        }
        validatePin(message.pin);
        const nextHash = await hashPin(message.pin);
        await saveSettings({ ...state.settings, pinHash: nextHash });
        await setAdminUnlocked(true);
        await appendEvent({ id: crypto.randomUUID(), kind: state.settings.pinHash ? 'PIN_CHANGED' : 'PIN_SET', timestamp: Date.now(), profileId: state.activeProfileId });
        return getState();
    }
    if (message.type === 'LOCK_ADMIN') {
        await setAdminUnlocked(false);
        return getState();
    }
    if (message.type === 'UPSERT_POLICY') {
        await requireAdmin();
        const state = await getInternalState();
        const currentPolicies = state.profileData[state.activeProfileId]?.policies ?? [];
        const exists = currentPolicies.some((item) => item.id === message.policy.id);
        const policies = exists
            ? currentPolicies.map((item) => item.id === message.policy.id ? message.policy : item)
            : [message.policy, ...currentPolicies];
        await savePolicies(policies);
        await appendEvent({ id: crypto.randomUUID(), kind: exists ? 'POLICY_UPDATED' : 'POLICY_CREATED', timestamp: Date.now(), policyId: message.policy.id, policyName: message.policy.name, profileId: state.activeProfileId });
        await rebuild();
        return getState();
    }
    if (message.type === 'DELETE_POLICY') {
        await requireAdmin();
        const state = await getInternalState();
        const currentPolicies = state.profileData[state.activeProfileId]?.policies ?? [];
        const target = currentPolicies.find((item) => item.id === message.policyId);
        await savePolicies(currentPolicies.filter((item) => item.id !== message.policyId));
        await appendEvent({ id: crypto.randomUUID(), kind: 'POLICY_DELETED', timestamp: Date.now(), policyId: message.policyId, policyName: target?.name, profileId: state.activeProfileId });
        await rebuild();
        return getState();
    }
    if (message.type === 'TOGGLE_PROTECTION') {
        await requireAdmin();
        const state = await getInternalState();
        await saveSettings({ ...state.settings, protectionEnabled: message.enabled });
        await rebuild();
        return getState();
    }
    if (message.type === 'REFRESH_RULES') {
        await requireAdmin();
        await rebuild();
        return { ok: true };
    }
    if (message.type === 'SIMULATE') {
        const state = await getInternalState();
        const policies = state.profileData[state.activeProfileId]?.policies ?? [];
        const explanation = resolvePolicyExplanation(policies, message.url, new Date());
        return explanation;
    }
    if (message.type === 'CREATE_PROFILE') {
        await requireAdmin();
        const profile = { ...message.profile, name: message.profile.name.trim().slice(0, 40) };
        if (!profile.name)
            throw new Error('Profile name cannot be empty.');
        await createProfile(profile);
        await appendEvent({ id: crypto.randomUUID(), kind: 'PROFILE_CREATED', timestamp: Date.now(), profileId: profile.id, detail: profile.name });
        return getState();
    }
    if (message.type === 'SWITCH_PROFILE') {
        await requireAdmin();
        const state = await getInternalState();
        if (state.activeProfileId === message.profileId)
            return getState();
        await switchProfile(message.profileId);
        await rebuild();
        await appendEvent({ id: crypto.randomUUID(), kind: 'PROFILE_SWITCHED', timestamp: Date.now(), profileId: message.profileId, detail: state.profiles.find((profile) => profile.id === message.profileId)?.name });
        return getState();
    }
    if (message.type === 'DELETE_PROFILE') {
        await requireAdmin();
        const state = await getInternalState();
        const profile = state.profiles.find((item) => item.id === message.profileId);
        await deleteProfile(message.profileId);
        await rebuild();
        await appendEvent({ id: crypto.randomUUID(), kind: 'PROFILE_DELETED', timestamp: Date.now(), profileId: message.profileId, detail: profile?.name });
        return getState();
    }
    if (message.type === 'SET_RETENTION') {
        await requireAdmin();
        if (![7, 14, 30, 90].includes(message.retentionDays))
            throw new Error('Invalid retention period.');
        const state = await getInternalState();
        const nextMax = Math.min(5000, Math.max(100, Number(message.maxLogEntries) || state.settings.maxLogEntries));
        await saveSettings({ ...state.settings, retentionDays: message.retentionDays, maxLogEntries: nextMax });
        return getState();
    }
    if (message.type === 'CLEAR_ACTIVITY') {
        await requireAdmin();
        await clearActiveEvents();
        return getState();
    }
    if (message.type === 'EXPORT_BACKUP') {
        await requireAdmin();
        return buildBackup();
    }
    if (message.type === 'IMPORT_BACKUP') {
        await requireAdmin();
        if (!validateBackup(message.bundle))
            throw new Error('Invalid SafeBrowse backup file.');
        await restoreBackup(message.bundle);
        await appendEvent({ id: crypto.randomUUID(), kind: 'IMPORT', timestamp: Date.now(), profileId: message.bundle.activeProfileId, detail: 'Configuration restored from backup' });
        await rebuild();
        return getState();
    }
    if (message.type === 'SET_SYNC_ENABLED') {
        await requireAdmin();
        const state = await getInternalState();
        await saveSettings({ ...state.settings, syncEnabled: message.enabled });
        if (message.enabled)
            await pushSync();
        return getState();
    }
    if (message.type === 'SYNC_PUSH') {
        await requireAdmin();
        await pushSync();
        await appendEvent({ id: crypto.randomUUID(), kind: 'SYNC_PUSH', timestamp: Date.now(), profileId: (await getInternalState()).activeProfileId, detail: 'Policies and profiles pushed to Chrome Sync' });
        return getState();
    }
    if (message.type === 'SYNC_PULL') {
        await requireAdmin();
        const updated = await pullSyncIfNewer(await getInternalState());
        if (!updated)
            throw new Error('No newer SafeBrowse configuration was found in Chrome Sync.');
        await appendEvent({ id: crypto.randomUUID(), kind: 'SYNC_PULL', timestamp: Date.now(), profileId: (await getInternalState()).activeProfileId, detail: 'Policies and profiles pulled from Chrome Sync' });
        await rebuild();
        return getState();
    }
    if (message.type === 'RECORD_BLOCKED_PAGE') {
        return recordBlockedPage(message.url, message.policyId, message.profileId);
    }
    if (message.type === 'LOG_EVENT') {
        await appendEvent(message.event);
        return { ok: true };
    }
    return null;
}
chrome.runtime.onInstalled.addListener(async () => {
    await initializeState();
    await setupAlarm();
    const raw = await getInternalState();
    if (raw.settings.syncEnabled)
        await pullSyncIfNewer(raw);
    await rebuild();
});
chrome.runtime.onStartup.addListener(async () => {
    await initializeState();
    await setupAlarm();
    const raw = await getInternalState();
    if (raw.settings.syncEnabled)
        await pullSyncIfNewer(raw);
    await rebuild();
});
chrome.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name !== SCHEDULE_ALARM)
        return;
    await rebuild();
});
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    void handleMessage(message)
        .then(sendResponse)
        .catch((error) => sendResponse({ error: error instanceof Error ? error.message : 'Unknown SafeBrowse error' }));
    return true;
});
void initializeState().then(async () => {
    await setupAlarm();
    await rebuild();
});
