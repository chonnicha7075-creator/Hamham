/* HAMHAM v1.0.5 */

import { extension_settings, getContext } from "../../../extensions.js";
import { saveSettingsDebounced, eventSource, event_types } from "../../../../script.js";

const extensionName = "Hamham";
const extensionFolderPath = `scripts/extensions/third-party/${extensionName}`;
const VERSION = "1.0.5";

const DEFAULT_SETTINGS = {
    iconVisible: true,
    autoBond: true,
    panelVisible: false,
    currentTab: 'atlas',
    iconPos: null,
    atmosphere: { effect: 'petals', intensity: 'subtle' },
    characters: {}
};

const RELATIONSHIP_TYPES = {
    romance: { label: 'Romance', color: '#D4537E', bg: '#FBEAF0' },
    ally:    { label: 'Ally',    color: '#1D9E75', bg: '#E1F5EE' },
    friend:  { label: 'Friend',  color: '#7F77DD', bg: '#EEEDFE' },
    family:  { label: 'Family',  color: '#E8833A', bg: '#FFF2E0' },
    rival:   { label: 'Rival',   color: '#BA7517', bg: '#FAEEDA' },
    enemy:   { label: 'Enemy',   color: '#E24B4A', bg: '#FCEBEB' },
    neutral: { label: 'Neutral', color: '#888780', bg: '#F1EFE8' }
};
const VALID_RELATIONSHIPS = Object.keys(RELATIONSHIP_TYPES);

const ROLE_SUGGESTIONS = ['friend','best friend','lover','spouse','crush','ex','father','mother','son','daughter','brother','sister','mentor','student','master','servant','boss','ally','rival','enemy','uncle','aunt','cousin','grandfather','grandmother','colleague','classmate','neighbor'];

const GENDERS = [
    { id: 'female', symbol: '\u2640', label: 'Female', color: '#D4537E' },
    { id: 'male',   symbol: '\u2642', label: 'Male',   color: '#5B8FD4' },
    { id: 'other',  symbol: '\u26A7', label: 'Other',  color: '#8B6BC7' },
    { id: 'unknown',symbol: '?',      label: 'Unknown', color: '#888780' }
];

const HAMSTER_SVG = '<svg width="40" height="40" viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="13" r="4.5" fill="#ED93B1"/><circle cx="28" cy="13" r="4.5" fill="#ED93B1"/><circle cx="12" cy="13" r="2.2" fill="#F4C0D1"/><circle cx="28" cy="13" r="2.2" fill="#F4C0D1"/><circle cx="20" cy="22" r="13" fill="#F4C0D1"/><circle cx="13.5" cy="24.5" r="2.8" fill="#ED93B1" opacity="0.7"/><circle cx="26.5" cy="24.5" r="2.8" fill="#ED93B1" opacity="0.7"/><circle cx="16" cy="21" r="1.6" fill="#4B1528"/><circle cx="24" cy="21" r="1.6" fill="#4B1528"/><circle cx="16.6" cy="20.4" r="0.5" fill="#fff"/><circle cx="24.6" cy="20.4" r="0.5" fill="#fff"/><ellipse cx="20" cy="24.5" rx="1.3" ry="0.9" fill="#4B1528"/><path d="M 18 25 Q 20 27 22 25" stroke="#4B1528" stroke-width="0.8" fill="none" stroke-linecap="round"/></svg>';

const debugLog = [];
function log(msg, isError) {
    const ts = new Date().toLocaleTimeString();
    const line = '[' + ts + '] ' + (isError ? 'ERR ' : 'OK  ') + msg;
    debugLog.push(line);
    if (debugLog.length > 60) debugLog.shift();
    if (isError) console.error('[Hamham] ' + msg);
    else console.log('[Hamham] ' + msg);
    const $dbg = $('#hamham-debug-log');
    if ($dbg.length) $dbg.text(debugLog.slice(-12).join('\n'));
}

function uid(prefix) { return prefix + '_' + Math.random().toString(36).slice(2, 9); }

function getSettings() {
    try {
        if (!extension_settings[extensionName]) {
            extension_settings[extensionName] = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
        }
        const s = extension_settings[extensionName];
        for (const key of Object.keys(DEFAULT_SETTINGS)) {
            if (s[key] === undefined) s[key] = JSON.parse(JSON.stringify(DEFAULT_SETTINGS[key]));
        }
        if (!s.atmosphere) s.atmosphere = { effect: 'petals', intensity: 'subtle' };
        if (!s.characters) s.characters = {};
        return s;
    } catch (e) {
        log('getSettings err: ' + e.message, true);
        return JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
    }
}

function save() {
    try { saveSettingsDebounced(); } catch (e) { log('save err: ' + e.message, true); }
}

function getCurrentCharacterKey() {
    try {
        const ctx = getContext();
        if (ctx.groupId) return 'group_' + ctx.groupId;
        if (ctx.characterId !== undefined && ctx.characterId !== null) {
            const ch = ctx.characters[ctx.characterId];
            if (ch && ch.avatar) return ch.avatar;
        }
    } catch (e) {}
    return null;
}

function getCurrentCharacterName() {
    try {
        const ctx = getContext();
        if (ctx.groupId) {
            const g = ctx.groups && ctx.groups.find(x => x.id === ctx.groupId);
            return g ? g.name : 'Group';
        }
        if (ctx.characterId !== undefined && ctx.characterId !== null) {
            return (ctx.characters[ctx.characterId] && ctx.characters[ctx.characterId].name) || '-';
        }
    } catch (e) {}
    return '-';
}

function getUserName() {
    try {
        const ctx = getContext();
        return (ctx && ctx.name1) || 'You';
    } catch (e) { return 'You'; }
}

function getCharData() {
    const key = getCurrentCharacterKey();
    if (!key) return null;
    const s = getSettings();
    if (!s.characters[key]) {
        s.characters[key] = { name: getCurrentCharacterName(), locations: [], npcs: [], memories: [] };
        save();
    }
    const d = s.characters[key];
    if (!d.locations) d.locations = [];
    if (!d.npcs) d.npcs = [];
    if (!d.memories) d.memories = [];
    for (const n of d.npcs) {
        if (!n.id) n.id = uid('npc');
        if (!n.gender) n.gender = 'unknown';
        if (!n.description) n.description = '';
        if (!n.role) n.role = '';
        if (!n.relations) n.relations = [];
    }
    for (const l of d.locations) {
        if (!l.id) l.id = uid('loc');
        if (!l.description) l.description = '';
    }
    for (const m of d.memories) {
        if (!m.id) m.id = uid('mem');
    }
    return d;
}

function escapeHtml(s) {
    return String(s || '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}

function getGenderInfo(g) {
    return GENDERS.find(x => x.id === g) || GENDERS[3];
}

async function callLLM(prompt, systemPrompt) {
    let ctx = null;
    try {
        if (typeof window !== 'undefined' && window.SillyTavern && typeof window.SillyTavern.getContext === 'function') {
            ctx = window.SillyTavern.getContext();
        }
    } catch (e) {}
    if (!ctx) {
        try { ctx = getContext(); } catch (e) {}
    }
    if (!ctx) throw new Error('Could not get SillyTavern context');

    const sysPrompt = systemPrompt || 'You are a data extraction assistant. Always respond with valid minified JSON only. Never use markdown code fences. Never add explanation text.';

    // PRIMARY: generateRaw — no chat context, no character card, no jailbreak interference
    // This is critical because character cards often instruct the AI to stay in roleplay / reply in Thai
    if (typeof ctx.generateRaw === 'function') {
        try {
            log('Using generateRaw (no-context, clean)...');
            const r = await ctx.generateRaw({ systemPrompt: sysPrompt, prompt: prompt });
            if (r !== undefined && r !== null && String(r).trim() !== '') return r;
            log('generateRaw returned empty, trying fallback');
        } catch (e) {
            log('generateRaw err: ' + e.message, true);
        }
    }

    // FALLBACK: generateQuietPrompt (may inherit character context)
    if (typeof ctx.generateQuietPrompt === 'function') {
        try {
            log('Fallback to generateQuietPrompt (new API)...');
            const r = await ctx.generateQuietPrompt({ quietPrompt: prompt });
            if (r !== undefined && r !== null && String(r).trim() !== '') return r;
        } catch (e1) {
            try {
                log('Trying old API style...');
                const r = await ctx.generateQuietPrompt(prompt, false, false);
                if (r !== undefined && r !== null && String(r).trim() !== '') return r;
            } catch (e2) {
                try {
                    return await ctx.generateQuietPrompt(prompt);
                } catch (e3) {
                    throw new Error('generateQuietPrompt failed: ' + e2.message);
                }
            }
        }
    }

    throw new Error('No LLM function available. Please update SillyTavern to the latest version.');
}

function stripReasoning(text) {
    // Strip <think>, <thinking>, <reasoning> blocks commonly used by Gemini 2.5, DeepSeek R1, Claude thinking, etc.
    return String(text || '')
        .replace(/<think(?:ing)?>[\s\S]*?<\/think(?:ing)?>/gi, '')
        .replace(/<reasoning>[\s\S]*?<\/reasoning>/gi, '')
        .replace(/```json\s*|\s*```/g, '')
        .trim();
}

function extractJSON(text) {
    const cleaned = stripReasoning(text);
    // Try to find object first, then array
    const objMatch = cleaned.match(/\{[\s\S]*\}/);
    if (objMatch) {
        try { return JSON.parse(objMatch[0]); } catch (e) {
            // Try to clean common issues: trailing commas, single quotes
            const fixed = objMatch[0]
                .replace(/,(\s*[}\]])/g, '$1')
                .replace(/([{,]\s*)'([^']+)'(\s*:)/g, '$1"$2"$3')
                .replace(/:\s*'([^']*)'/g, ': "$1"');
            try { return JSON.parse(fixed); } catch (e2) {
                log('JSON repair failed: ' + e2.message + '\nRaw: ' + objMatch[0].slice(0, 300), true);
                throw new Error('Invalid JSON in response: ' + e2.message);
            }
        }
    }
    throw new Error('No JSON object found. LLM said: "' + cleaned.slice(0, 150) + '..."');
}

function getLorebookEntries() {
    try {
        const ctx = getContext();
        const entries = [];
        const world = ctx.world_info || {};
        if (world.entries && Array.isArray(world.entries)) {
            for (const e of world.entries) {
                if (e.content && !e.disable) {
                    entries.push({ key: (e.key || []).join(', '), content: (e.content || '').slice(0, 600) });
                }
            }
        }
        if (ctx.characterId !== undefined && ctx.characterId !== null) {
            const char = ctx.characters && ctx.characters[ctx.characterId];
            const charBook = char && char.data && char.data.character_book;
            if (charBook && Array.isArray(charBook.entries)) {
                for (const e of charBook.entries) {
                    if (e.content && e.enabled !== false) {
                        entries.push({ key: (e.keys || []).join(', '), content: (e.content || '').slice(0, 600) });
                    }
                }
            }
        }
        return entries.slice(0, 20);
    } catch (e) { log('Lorebook read: ' + e.message, true); return []; }
}

let shadowHost = null;
let shadowRoot = null;

function buildShadowHost() {
    const existing = document.getElementById('hamham-shadow-host');
    if (existing) existing.remove();
    shadowHost = document.createElement('div');
    shadowHost.id = 'hamham-shadow-host';
    shadowHost.setAttribute('style', 'position:fixed !important;top:0 !important;left:0 !important;width:100vw !important;height:100vh !important;z-index:2147483647 !important;pointer-events:none !important;margin:0 !important;padding:0 !important;border:0 !important;');
    document.documentElement.appendChild(shadowHost);
    shadowRoot = shadowHost.attachShadow({ mode: 'open' });
    return shadowRoot;
}


const SHADOW_CSS = `
:host { all: initial; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Noto Sans Thai', sans-serif; }
* { box-sizing: border-box; }

.floater { position: fixed; right: 16px; top: 80px; width: 60px; height: 60px; border-radius: 50%; background: linear-gradient(135deg, #FFF0F5 0%, #FBEAF0 50%, #F4C0D1 100%); border: 3px solid #fff; box-shadow: 0 8px 24px rgba(212, 83, 126, 0.5), 0 3px 8px rgba(75, 21, 40, 0.2); cursor: pointer; pointer-events: auto; display: flex; align-items: center; justify-content: center; animation: ham-entry 0.6s ease-out, ham-idle 3s ease-in-out 0.6s infinite; user-select: none; -webkit-user-select: none; -webkit-tap-highlight-color: transparent; }
.floater.hidden { display: none; }
.floater.pressed { transform: scale(0.92); transition: transform 0.1s; }
@keyframes ham-entry { 0% { opacity: 0; transform: scale(0) rotate(-180deg); } 60% { transform: scale(1.2) rotate(10deg); } 100% { opacity: 1; transform: scale(1) rotate(0); } }
@keyframes ham-idle { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-4px); } }

.panel { position: fixed; pointer-events: auto; background: #fff; border-radius: 20px; box-shadow: 0 20px 60px rgba(75, 21, 40, 0.4), 0 0 0 1px rgba(212, 83, 126, 0.15); display: flex; flex-direction: column; overflow: hidden; color: #3d2030; animation: ham-slide 0.25s ease-out; top: 5vh; left: 50%; transform: translateX(-50%); width: min(94vw, 480px); max-height: 88vh; }
.panel.hidden { display: none; }
@keyframes ham-slide { from { opacity: 0; transform: translateX(-50%) translateY(-20px) scale(0.95); } to { opacity: 1; transform: translateX(-50%) translateY(0) scale(1); } }

.header { display: flex; align-items: center; justify-content: space-between; padding: 12px 14px; background: linear-gradient(135deg, #FBEAF0, #F4C0D1); border-bottom: 1px solid rgba(212, 83, 126, 0.15); flex-shrink: 0; }
.brand { display: flex; align-items: center; gap: 9px; }
.brand-logo { width: 32px; height: 32px; background: #fff; border-radius: 50%; display: flex; align-items: center; justify-content: center; box-shadow: 0 2px 6px rgba(212, 83, 126, 0.25); overflow: hidden; }
.brand-logo svg { width: 32px; height: 32px; }
.brand-name { font-weight: 700; font-size: 14px; color: #4B1528; line-height: 1; letter-spacing: 0.5px; }
.brand-sub { font-size: 10px; color: #993556; margin-top: 2px; }
.char-pill { display: inline-flex; align-items: center; gap: 5px; padding: 4px 9px; background: #fff; border-radius: 99px; font-size: 10.5px; color: #4B1528; font-weight: 500; max-width: 120px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.char-dot { width: 5px; height: 5px; border-radius: 50%; background: #1D9E75; flex-shrink: 0; }
.close-btn { width: 30px; height: 30px; border-radius: 50%; border: none; background: rgba(255, 255, 255, 0.6); color: #72243E; font-size: 17px; cursor: pointer; display: flex; align-items: center; justify-content: center; -webkit-tap-highlight-color: transparent; pointer-events: auto; }
.close-btn:active { background: #fff; transform: scale(0.9); }

.stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; padding: 10px 14px; background: #fff9fb; flex-shrink: 0; }
.stat { background: #fff; padding: 8px 6px; border-radius: 8px; border: 1px solid rgba(212, 83, 126, 0.1); text-align: center; }
.stat-label { font-size: 9px; color: #8b6676; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 500; }
.stat-value { font-size: 18px; font-weight: 700; color: #4B1528; margin-top: 2px; }

.tabs { display: flex; padding: 0 14px; background: #fff9fb; border-bottom: 1px solid rgba(212, 83, 126, 0.1); overflow-x: auto; flex-shrink: 0; }
.tabs::-webkit-scrollbar { display: none; }
.tab { padding: 10px 12px; font-size: 12px; color: #8b6676; cursor: pointer; border: none; background: none; font-weight: 500; border-bottom: 2px solid transparent; margin-bottom: -1px; white-space: nowrap; -webkit-tap-highlight-color: transparent; }
.tab.active { color: #D4537E; border-bottom-color: #D4537E; }

.content { flex: 1; overflow-y: auto; padding: 12px 14px; -webkit-overflow-scrolling: touch; }
.content::-webkit-scrollbar { width: 6px; }
.content::-webkit-scrollbar-thumb { background: #F4C0D1; border-radius: 3px; }

.empty { padding: 20px; text-align: center; color: #8b6676; font-size: 12px; background: #fff9fb; border-radius: 10px; line-height: 1.6; }
.empty b { display: block; color: #D4537E; margin-bottom: 6px; font-size: 13px; }

.extract-btn { width: 100%; padding: 12px; margin: 4px 0 14px; background: linear-gradient(135deg, #D4537E 0%, #993556 100%); color: #fff; border: none; border-radius: 12px; font-size: 13px; font-weight: 600; cursor: pointer; box-shadow: 0 4px 12px rgba(212, 83, 126, 0.3); -webkit-tap-highlight-color: transparent; display: flex; align-items: center; justify-content: center; gap: 6px; }
.extract-btn:active { transform: scale(0.98); }
.extract-hint { font-size: 10.5px; color: #8b6676; text-align: center; margin-top: -10px; margin-bottom: 10px; }

.section { margin-top: 14px; }
.section-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
.section-title { font-size: 12px; font-weight: 600; color: #4B1528; }
.add-btn { font-size: 11px; padding: 5px 12px; background: #D4537E; color: #fff; border: none; border-radius: 7px; cursor: pointer; font-weight: 500; -webkit-tap-highlight-color: transparent; }
.add-btn:active { background: #993556; transform: scale(0.96); }

.list { display: flex; flex-direction: column; gap: 5px; }
.list-item { display: flex; justify-content: space-between; align-items: center; padding: 10px 12px; background: #fff9fb; border-radius: 10px; border: 1px solid rgba(212, 83, 126, 0.08); gap: 8px; cursor: pointer; -webkit-tap-highlight-color: transparent; }
.list-item:active { background: #FBEAF0; }
.list-name { font-size: 12.5px; color: #4B1528; flex: 1; display: flex; align-items: center; gap: 7px; min-width: 0; }
.npc-avatar { width: 28px; height: 28px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 600; color: #fff; flex-shrink: 0; box-shadow: 0 2px 6px rgba(212,83,126,0.25); }
.npc-text { flex: 1; min-width: 0; overflow: hidden; }
.npc-title { font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; display: flex; align-items: center; gap: 5px; }
.gender-sym { font-size: 14px; font-weight: 700; }
.npc-sub { font-size: 10px; color: #8b6676; margin-top: 1px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.del-btn { width: 26px; height: 26px; border-radius: 6px; border: none; background: transparent; color: #8b6676; cursor: pointer; font-size: 13px; flex-shrink: 0; -webkit-tap-highlight-color: transparent; }
.del-btn:active { background: #FCEBEB; color: #E24B4A; }

.loc-icon { width: 28px; height: 28px; border-radius: 8px; background: linear-gradient(135deg, #FAEEDA, #E8C58D); display: flex; align-items: center; justify-content: center; flex-shrink: 0; }

.const-wrap { background: linear-gradient(180deg, #FFF5F8 0%, #FBEAF0 100%); border-radius: 12px; border: 1px solid rgba(212, 83, 126, 0.15); overflow: hidden; }
.const-wrap svg { width: 100%; display: block; }
.legend { display: flex; flex-wrap: wrap; gap: 8px; padding: 8px 12px; background: #fff9fb; font-size: 10px; color: #8b6676; }
.legend span { display: flex; align-items: center; gap: 4px; }
.legend-dot { width: 8px; height: 8px; border-radius: 50%; }

.mem-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(130px, 1fr)); gap: 8px; }
.mem-card { background: #fff; border-radius: 10px; border: 1px solid rgba(212, 83, 126, 0.1); overflow: hidden; position: relative; }
.mem-banner { padding: 6px 10px; font-size: 10px; font-weight: 600; }
.mem-body { padding: 8px 10px; }
.mem-title { font-size: 12px; font-weight: 600; color: #4B1528; margin-bottom: 4px; }
.mem-quote { font-size: 10px; font-style: italic; color: #8b6676; line-height: 1.4; }
.mem-card.emo-romance .mem-banner { background: #FBEAF0; color: #4B1528; }
.mem-card.emo-battle .mem-banner { background: #FCEBEB; color: #501313; }
.mem-card.emo-victory .mem-banner { background: #E1F5EE; color: #04342C; }
.mem-card.emo-journey .mem-banner { background: #FAEEDA; color: #412402; }
.mem-card.emo-mystery .mem-banner { background: #EEEDFE; color: #26215C; }
.mem-del { position: absolute; top: 4px; right: 4px; width: 22px; height: 22px; border-radius: 50%; background: rgba(255,255,255,0.9); border: none; cursor: pointer; font-size: 10px; color: #8b6676; -webkit-tap-highlight-color: transparent; }

.atmos-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(100px, 1fr)); gap: 6px; }
.atmos-card { background: #fff; border: 2px solid rgba(212, 83, 126, 0.1); border-radius: 10px; padding: 12px 8px; cursor: pointer; text-align: center; -webkit-tap-highlight-color: transparent; }
.atmos-card.active { border-color: #D4537E; background: #FBEAF0; }
.atmos-card:active { transform: scale(0.96); }
.atmos-name { font-size: 12px; font-weight: 600; color: #4B1528; }
.atmos-desc { font-size: 9px; color: #8b6676; margin-top: 2px; }

.intensity-row { margin-top: 12px; padding: 10px; background: #fff9fb; border-radius: 10px; display: flex; align-items: center; gap: 10px; }
.intensity-row label { font-size: 12px; font-weight: 500; color: #4B1528; }
.seg { display: flex; gap: 4px; flex: 1; justify-content: flex-end; }
.seg-btn { font-size: 10px; padding: 6px 11px; border: 1px solid rgba(212, 83, 126, 0.15); background: #fff; border-radius: 6px; cursor: pointer; color: #8b6676; -webkit-tap-highlight-color: transparent; }
.seg-btn.active { background: #D4537E; color: #fff; border-color: #D4537E; }

.auto-row { margin-top: 14px; padding: 12px; background: linear-gradient(135deg, #FFF5F8, #FBEAF0); border-radius: 12px; border: 1px solid rgba(212, 83, 126, 0.15); display: flex; flex-direction: column; gap: 8px; }
.auto-toggle-row { display: flex; justify-content: space-between; align-items: center; font-size: 12px; color: #4B1528; font-weight: 500; }
.toggle { width: 36px; height: 20px; background: #ddd; border-radius: 10px; position: relative; cursor: pointer; transition: background 0.2s; flex-shrink: 0; }
.toggle.on { background: #D4537E; }
.toggle .knob { position: absolute; top: 2px; left: 2px; width: 16px; height: 16px; border-radius: 50%; background: #fff; transition: transform 0.2s; box-shadow: 0 1px 3px rgba(0,0,0,0.2); }
.toggle.on .knob { transform: translateX(16px); }

.footer { display: flex; justify-content: space-between; padding: 10px 14px; background: #fff9fb; border-top: 1px solid rgba(212, 83, 126, 0.1); gap: 6px; flex-shrink: 0; }
.foot-btns { display: flex; gap: 4px; }
.foot-btn { font-size: 11px; padding: 6px 11px; background: #fff; border: 1px solid rgba(212, 83, 126, 0.2); border-radius: 6px; cursor: pointer; color: #993556; -webkit-tap-highlight-color: transparent; }
.foot-btn.danger { color: #E24B4A; border-color: rgba(226, 75, 74, 0.3); }
.foot-btn:active { transform: scale(0.95); }

.modal-backdrop { position: fixed; inset: 0; background: rgba(75, 21, 40, 0.5); backdrop-filter: blur(3px); z-index: 10; display: flex; align-items: center; justify-content: center; animation: modal-fade 0.18s ease; padding: 12px; pointer-events: auto; }
@keyframes modal-fade { from { opacity: 0; } to { opacity: 1; } }
.modal { background: #fff; border-radius: 16px; width: 100%; max-width: 380px; max-height: calc(100vh - 24px); display: flex; flex-direction: column; overflow: hidden; box-shadow: 0 20px 60px rgba(75, 21, 40, 0.4); animation: modal-pop 0.2s cubic-bezier(0.34, 1.56, 0.64, 1); }
@keyframes modal-pop { from { opacity: 0; transform: scale(0.92); } to { opacity: 1; transform: scale(1); } }
.modal-head { padding: 14px 16px; background: linear-gradient(135deg, #FBEAF0, #F4C0D1); border-bottom: 1px solid rgba(212, 83, 126, 0.15); display: flex; justify-content: space-between; align-items: center; flex-shrink: 0; }
.modal-title { font-size: 14px; font-weight: 700; color: #4B1528; margin: 0; }
.modal-body { padding: 14px 16px; display: flex; flex-direction: column; gap: 12px; flex: 1 1 auto; overflow-y: auto; -webkit-overflow-scrolling: touch; min-height: 0; }
.modal-body::-webkit-scrollbar { width: 6px; }
.modal-body::-webkit-scrollbar-thumb { background: #F4C0D1; border-radius: 3px; }
.modal-foot { padding: 10px 16px; border-top: 1px solid rgba(212, 83, 126, 0.1); display: flex; gap: 6px; justify-content: flex-end; background: #fff9fb; flex-shrink: 0; flex-wrap: wrap; }

.field { display: flex; flex-direction: column; gap: 4px; }
.field-label { font-size: 10px; font-weight: 600; color: #993556; text-transform: uppercase; letter-spacing: 0.5px; }
.field input[type=text], .field textarea, .field select { width: 100%; padding: 8px 11px; font-size: 13px; background: #fff9fb; border: 1px solid rgba(212, 83, 126, 0.15); border-radius: 8px; color: #3d2030; font-family: inherit; }
.field textarea { resize: vertical; min-height: 60px; }
.field input:focus, .field textarea:focus, .field select:focus { outline: none; border-color: #D4537E; background: #fff; }

.gender-seg { display: grid; grid-template-columns: repeat(4, 1fr); gap: 4px; }
.gender-btn { padding: 8px 4px; background: #fff9fb; border: 1px solid rgba(212, 83, 126, 0.15); border-radius: 8px; cursor: pointer; font-size: 11px; color: #8b6676; -webkit-tap-highlight-color: transparent; }
.gender-btn.active { background: #D4537E; color: #fff; border-color: #D4537E; }
.gender-btn .gsym { font-size: 16px; font-weight: 700; display: block; }

.relations-list { display: flex; flex-direction: column; gap: 6px; }
.relation-row { display: flex; gap: 6px; align-items: center; background: #fff9fb; padding: 8px; border-radius: 8px; }
.relation-row select, .relation-row input { flex: 1; padding: 6px 8px; font-size: 11px; background: #fff; border: 1px solid rgba(212, 83, 126, 0.15); border-radius: 6px; }
.relation-row .del { width: 24px; height: 24px; border: none; background: transparent; color: #8b6676; cursor: pointer; border-radius: 4px; }
.relation-row .del:active { background: #FCEBEB; color: #E24B4A; }

.btn-primary { background: #D4537E; color: #fff; border: none; padding: 8px 14px; border-radius: 8px; font-size: 12px; font-weight: 500; cursor: pointer; -webkit-tap-highlight-color: transparent; }
.btn-primary:active { background: #993556; }
.btn-secondary { background: #fff; color: #993556; border: 1px solid rgba(212, 83, 126, 0.2); padding: 8px 14px; border-radius: 8px; font-size: 12px; cursor: pointer; -webkit-tap-highlight-color: transparent; }
.btn-secondary:active { background: #FBEAF0; }
.btn-danger { background: #fff; color: #E24B4A; border: 1px solid rgba(226, 75, 74, 0.3); padding: 8px 14px; border-radius: 8px; font-size: 12px; cursor: pointer; -webkit-tap-highlight-color: transparent; margin-right: auto; }
`;


async function autoExtract() {
    const data = getCharData();
    if (!data) { alert('Please select a character first'); return; }

    const btn = shadowRoot && shadowRoot.querySelector('[data-action="auto-extract"]');
    const origText = btn ? btn.textContent : '';
    if (btn) { btn.textContent = '\u23F3 Thinking...'; btn.style.pointerEvents = 'none'; btn.style.opacity = '0.6'; }

    try {
        const ctx = getContext();
        const recent = (ctx.chat || []).slice(-10);
        const lore = getLorebookEntries();
        if (recent.length === 0 && lore.length === 0) {
            alert('No chat or lorebook data yet.');
            return;
        }

        const existingNpcs = data.npcs.map(n => n.name).join(', ') || 'none';
        const existingLocs = data.locations.map(l => l.name).join(', ') || 'none';
        const userName = getUserName();
        const charName = getCurrentCharacterName();

        const chatText = recent.map(m => {
            const speaker = m.is_user ? userName : (m.name || charName);
            const text = (m.mes || '').replace(/\n+/g, ' ').slice(0, 600);
            return '[' + speaker + ']: ' + text;
        }).join('\n');

        const loreText = lore.length ? lore.map(e => '[' + e.key + ']: ' + e.content).join('\n').slice(0, 3000) : '';

        const sysPrompt = 'You are a JSON extraction tool. You read fiction text and output structured JSON data about characters and places. You MUST output only valid JSON - no narrative, no roleplay, no markdown fences, no prose explanation. Start your response with "{" and end with "}". Nothing else.';

        const prompt =
            'TASK: Extract NPCs (other named characters), locations, and relationships from the text below.\n\n' +
            'CONTEXT:\n' +
            '- User (the player): ' + userName + '\n' +
            '- Main character (the bot): ' + charName + '\n' +
            '- Already tracked NPCs: ' + existingNpcs + '\n' +
            '- Already tracked locations: ' + existingLocs + '\n\n' +
            'OUTPUT SCHEMA (STRICT - output exactly this structure):\n' +
            '{\n' +
            '  "npcs": [\n' +
            '    {\n' +
            '      "name": "character name",\n' +
            '      "gender": "female" | "male" | "other" | "unknown",\n' +
            '      "relationship": "romance" | "ally" | "friend" | "family" | "rival" | "enemy" | "neutral",\n' +
            '      "role": "specific role like mother/lover/mentor in source language",\n' +
            '      "description": "1-2 sentence description in source language",\n' +
            '      "known_others": [\n' +
            '        {"name": "other NPC name", "role": "how they relate e.g. brother/enemy/friend"}\n' +
            '      ]\n' +
            '    }\n' +
            '  ],\n' +
            '  "locations": [\n' +
            '    {"name": "place name", "description": "1-2 sentences in source language"}\n' +
            '  ]\n' +
            '}\n\n' +
            'RULES:\n' +
            '1. "relationship" = how THIS NPC relates to ' + userName + ' (the user)\n' +
            '2. "known_others" = list of OTHER NPCs this character has any relationship with (family, rival, etc.)\n' +
            '3. Names must match exactly between npcs and known_others entries so we can link them\n' +
            '4. Skip NPCs/locations already tracked\n' +
            '5. Do not include ' + userName + ' or ' + charName + ' as NPCs\n' +
            '6. Only include NAMED characters (not "the guard", "a merchant")\n' +
            '7. Use the SAME LANGUAGE as the source text for descriptions and roles\n' +
            '8. Output empty arrays if nothing new: {"npcs":[],"locations":[]}\n' +
            '9. Return ONLY the JSON object. No greetings, no explanations, no narrative.\n\n' +
            (loreText ? '=== LOREBOOK ===\n' + loreText + '\n\n' : '') +
            '=== RECENT CHAT ===\n' + chatText + '\n\n' +
            'Now output the JSON:';

        log('Extracting... (prompt ' + prompt.length + ' chars, lore entries: ' + lore.length + ')');
        const response = await callLLM(prompt, sysPrompt);
        const respStr = String(response || '');
        log('Got ' + respStr.length + ' chars');
        // Log a preview of the response for debugging
        console.log('[Hamham] Raw LLM response:', respStr.slice(0, 500));

        let parsed;
        try {
            parsed = extractJSON(respStr);
        } catch (parseErr) {
            // Save full response to console for debug
            console.error('[Hamham] Full LLM response:', respStr);
            throw parseErr;
        }

        let addedNpcs = 0, addedLocs = 0, skipped = 0, linked = 0;
        const newlyAdded = []; // Track for second pass (relations)

        for (const npc of (parsed.npcs || [])) {
            if (!npc || !npc.name || typeof npc.name !== 'string') { skipped++; continue; }
            const name = npc.name.trim().slice(0, 40);
            if (!name) { skipped++; continue; }
            if (data.npcs.find(n => n.name.toLowerCase() === name.toLowerCase())) { skipped++; continue; }
            const rel = VALID_RELATIONSHIPS.includes(npc.relationship) ? npc.relationship : 'neutral';
            const gender = ['female','male','other','unknown'].includes(npc.gender) ? npc.gender : 'unknown';
            const newNpc = {
                id: uid('npc'), name, gender, relationship: rel,
                role: (npc.role || '').slice(0, 30),
                description: (npc.description || '').slice(0, 500),
                bondLevel: 0, mentions: 0, relations: [],
                _pendingKnownOthers: Array.isArray(npc.known_others) ? npc.known_others : []
            };
            data.npcs.push(newNpc);
            newlyAdded.push(newNpc);
            addedNpcs++;
        }

        for (const loc of (parsed.locations || [])) {
            if (!loc || !loc.name || typeof loc.name !== 'string') { skipped++; continue; }
            const name = loc.name.trim().slice(0, 40);
            if (!name) { skipped++; continue; }
            if (data.locations.find(l => l.name.toLowerCase() === name.toLowerCase())) { skipped++; continue; }
            data.locations.push({
                id: uid('loc'), name,
                description: (loc.description || '').slice(0, 500)
            });
            addedLocs++;
        }

        // SECOND PASS: resolve known_others → actual relations with targetIds
        // Also do this for existing NPCs in case LLM mentions new links between old NPCs
        for (const npc of newlyAdded) {
            for (const ko of (npc._pendingKnownOthers || [])) {
                if (!ko || !ko.name || !ko.role) continue;
                const targetName = String(ko.name).trim().toLowerCase();
                if (!targetName) continue;
                const target = data.npcs.find(n => n.id !== npc.id && n.name.toLowerCase() === targetName);
                if (!target) continue;
                const role = String(ko.role).trim().slice(0, 30);
                if (!role) continue;
                // Avoid duplicates
                if (!npc.relations.find(r => r.targetId === target.id)) {
                    npc.relations.push({ targetId: target.id, role });
                    linked++;
                }
                // Also add reverse link if it doesn't exist (mirrored)
                if (!target.relations.find(r => r.targetId === npc.id)) {
                    target.relations.push({ targetId: npc.id, role });
                }
            }
            delete npc._pendingKnownOthers;
        }

        save(); refreshPanel();
        log('Extract: +' + addedNpcs + ' NPCs, +' + addedLocs + ' locs, +' + linked + ' links');
        alert('\u273F Added ' + addedNpcs + ' NPC' + (addedNpcs !== 1 ? 's' : '') +
            ', ' + addedLocs + ' location' + (addedLocs !== 1 ? 's' : '') +
            ', ' + linked + ' relationship link' + (linked !== 1 ? 's' : '') +
            (skipped > 0 ? '\n(' + skipped + ' skipped or duplicate)' : ''));
    } catch (e) {
        log('Extract: ' + e.message, true);
        alert('Extract failed: ' + e.message + '\n\nCheck browser console (F12) for the raw LLM response.');
    } finally {
        if (btn) { btn.textContent = origText; btn.style.pointerEvents = ''; btn.style.opacity = ''; }
    }
}

let lastAutoMoodAt = 0;

async function autoMood(silent) {
    const btn = shadowRoot && shadowRoot.querySelector('[data-action="auto-mood"]');
    const origText = btn ? btn.textContent : '';
    if (btn && !silent) { btn.textContent = '\u23F3'; btn.style.pointerEvents = 'none'; btn.style.opacity = '0.6'; }

    try {
        const ctx = getContext();
        const recent = (ctx.chat || []).slice(-3);
        if (recent.length === 0) { if (!silent) alert('No messages yet.'); return; }
        const text = recent.map(m => (m.mes || '').replace(/\n+/g, ' ')).join('\n').slice(0, 2000);

        const sysPrompt = 'You are a mood classifier. You analyze text and respond with exactly one lowercase word from a given list. Never add explanation.';

        const prompt = 'Read the text and output ONE word naming the best atmosphere effect. Output only the word, nothing else.\n\n' +
            'Effects available:\n' +
            '- petals = soft romantic, spring, tender moments, gardens, flowers\n' +
            '- lanterns = Chinese ancient, festival, palace, warm celebration, imperial\n' +
            '- snow = cold, melancholy, winter, quiet, loss\n' +
            '- fireflies = magical, evening, intimate, forest, summer night\n' +
            '- stars = night sky, cosmic, hopeful, vast, wonder\n' +
            '- rain = sorrow, reflection, storm, tension\n' +
            '- leaves = autumn, nostalgia, warm afternoon, falling leaves, aging\n' +
            '- none = action, combat, bright day, urgent, chaotic\n\n' +
            'Text:\n' + text + '\n\n' +
            'Your answer (ONE word only): petals, lanterns, snow, fireflies, stars, rain, leaves, or none';

        const response = await callLLM(prompt, sysPrompt);
        const effect = String(response || '').toLowerCase().match(/petals|lanterns|snow|fireflies|stars|rain|leaves|none/);
        if (!effect) throw new Error('Could not parse mood from: "' + String(response || '').slice(0, 100) + '"');

        getSettings().atmosphere.effect = effect[0];
        save(); restartAtmosphere(); renderTab('atmosphere');
        log('Auto-mood: ' + effect[0]);
    } catch (e) {
        log('Auto-mood: ' + e.message, true);
        if (!silent) alert('Auto-mood failed: ' + e.message);
    } finally {
        if (btn && !silent) { btn.textContent = origText; btn.style.pointerEvents = ''; btn.style.opacity = ''; }
    }
}

async function autoMoodCheck() {
    if (!getSettings().autoMood) return;
    const now = Date.now();
    if (now - lastAutoMoodAt < 30000) return;
    lastAutoMoodAt = now;
    await autoMood(true);
}

function mountUI() {
    try {
        buildShadowHost();
        shadowRoot.innerHTML =
            '<style>' + SHADOW_CSS + '</style>' +
            '<div id="floater" class="floater" title="HAMHAM">' + HAMSTER_SVG + '</div>' +
            '<div id="panel" class="panel hidden">' +
                '<div class="header">' +
                    '<div class="brand">' +
                        '<div class="brand-logo">' + HAMSTER_SVG + '</div>' +
                        '<div>' +
                            '<div class="brand-name">HAMHAM</div>' +
                            '<div class="brand-sub">World memory</div>' +
                        '</div>' +
                    '</div>' +
                    '<div style="display:flex;align-items:center;gap:6px">' +
                        '<div class="char-pill"><span class="char-dot"></span><span id="char-name">-</span></div>' +
                        '<button class="close-btn" id="btn-close">\u2715</button>' +
                    '</div>' +
                '</div>' +
                '<div class="stats" id="stats"></div>' +
                '<div class="tabs">' +
                    '<button class="tab active" data-tab="atlas">Characters</button>' +
                    '<button class="tab" data-tab="constellation">Bonds</button>' +
                    '<button class="tab" data-tab="memory">Memories</button>' +
                    '<button class="tab" data-tab="atmosphere">Mood</button>' +
                '</div>' +
                '<div class="content" id="content"></div>' +
                '<div class="footer">' +
                    '<div class="foot-btns">' +
                        '<button class="foot-btn" data-action="export">Export</button>' +
                        '<button class="foot-btn" data-action="refresh">Refresh</button>' +
                    '</div>' +
                    '<button class="foot-btn danger" data-action="reset">Reset char</button>' +
                '</div>' +
            '</div>' +
            '<div id="modal-root"></div>';

        const floater = shadowRoot.getElementById('floater');
        const panel = shadowRoot.getElementById('panel');

        let pDown = false, pStartX = 0, pStartY = 0, pMoved = false;
        floater.addEventListener('pointerdown', (e) => {
            pDown = true; pStartX = e.clientX; pStartY = e.clientY; pMoved = false;
            floater.classList.add('pressed');
            try { floater.setPointerCapture(e.pointerId); } catch (_) {}
        });
        floater.addEventListener('pointermove', (e) => {
            if (!pDown) return;
            const dx = e.clientX - pStartX, dy = e.clientY - pStartY;
            if (Math.abs(dx) > 6 || Math.abs(dy) > 6) pMoved = true;
            if (pMoved) {
                const r = floater.getBoundingClientRect();
                const newRight = Math.max(8, Math.min(window.innerWidth - 68, window.innerWidth - r.right - dx));
                const newTop = Math.max(8, Math.min(window.innerHeight - 68, r.top + dy));
                floater.style.right = newRight + 'px';
                floater.style.top = newTop + 'px';
                floater.style.bottom = 'auto';
                pStartX = e.clientX; pStartY = e.clientY;
            }
        });
        floater.addEventListener('pointerup', () => {
            floater.classList.remove('pressed');
            if (!pDown) return;
            pDown = false;
            if (pMoved) {
                const r = floater.getBoundingClientRect();
                getSettings().iconPos = { right: Math.round(window.innerWidth - r.right), top: Math.round(r.top) };
                save();
            } else { togglePanel(); }
        });
        floater.addEventListener('pointercancel', () => { pDown = false; pMoved = false; floater.classList.remove('pressed'); });

        const s = getSettings();
        if (s.iconPos) {
            if (typeof s.iconPos.right === 'number') floater.style.right = s.iconPos.right + 'px';
            if (typeof s.iconPos.top === 'number') { floater.style.top = s.iconPos.top + 'px'; floater.style.bottom = 'auto'; }
        }
        setFloaterVisible(s.iconVisible);

        shadowRoot.getElementById('btn-close').addEventListener('click', closePanel);

        shadowRoot.querySelectorAll('.tab').forEach(tab => {
            tab.addEventListener('click', () => {
                const t = tab.dataset.tab;
                getSettings().currentTab = t;
                save();
                shadowRoot.querySelectorAll('.tab').forEach(x => x.classList.remove('active'));
                tab.classList.add('active');
                renderTab(t);
            });
        });

        panel.addEventListener('click', (e) => {
            const btn = e.target.closest('.foot-btn');
            if (!btn) return;
            const action = btn.dataset.action;
            if (action === 'export') exportData();
            else if (action === 'refresh') refreshPanel();
            else if (action === 'reset') {
                if (!confirm('Reset data for THIS character only?')) return;
                const key = getCurrentCharacterKey();
                if (key) { delete getSettings().characters[key]; save(); refreshPanel(); }
            }
        });

        shadowRoot.getElementById('content').addEventListener('click', (e) => {
            const el = e.target.closest('[data-action]');
            if (!el) return;
            e.stopPropagation();
            const action = el.dataset.action;
            if (action === 'auto-extract') autoExtract();
            else if (action === 'auto-mood') autoMood(false);
            else if (action === 'toggle-auto-mood') {
                getSettings().autoMood = !getSettings().autoMood;
                save(); renderTab('atmosphere');
            }
            else if (action === 'add-loc') openLocationModal(null);
            else if (action === 'add-npc') openNpcModal(null);
            else if (action === 'add-memory') promptAddMemory();
            else if (action === 'edit-loc') openLocationModal(el.dataset.id);
            else if (action === 'edit-npc') openNpcModal(el.dataset.id);
            else if (action === 'del-loc') { if (confirm('Delete this location?')) { delItem('locations', el.dataset.id); } }
            else if (action === 'del-npc') { if (confirm('Delete this NPC?')) { delItem('npcs', el.dataset.id); } }
            else if (action === 'del-memory') { if (confirm('Delete this memory?')) { delItem('memories', el.dataset.id); } }
            else if (action === 'set-atmos') {
                getSettings().atmosphere.effect = el.dataset.effect;
                save(); restartAtmosphere(); renderTab('atmosphere');
            }
            else if (action === 'set-intensity') {
                getSettings().atmosphere.intensity = el.dataset.intensity;
                save(); restartAtmosphere(); renderTab('atmosphere');
            }
        });

        log('UI mounted');
    } catch (e) { log('mountUI failed: ' + e.message, true); }
}

function setFloaterVisible(visible) {
    if (!shadowRoot) return;
    const el = shadowRoot.getElementById('floater');
    if (!el) return;
    if (visible) el.classList.remove('hidden'); else el.classList.add('hidden');
}

function openPanel() {
    if (!shadowRoot) return;
    shadowRoot.getElementById('panel').classList.remove('hidden');
    getSettings().panelVisible = true;
    save(); refreshPanel();
}

function closePanel() {
    if (!shadowRoot) return;
    shadowRoot.getElementById('panel').classList.add('hidden');
    getSettings().panelVisible = false;
    save();
}

function togglePanel() {
    if (!shadowRoot) return;
    const p = shadowRoot.getElementById('panel');
    if (p.classList.contains('hidden')) openPanel(); else closePanel();
}


function refreshPanel() {
    if (!shadowRoot) return;
    const p = shadowRoot.getElementById('panel');
    if (p.classList.contains('hidden')) return;
    const data = getCharData();
    shadowRoot.getElementById('char-name').textContent = getCurrentCharacterName();

    const stats = data ? {
        loc: data.locations.length, npcs: data.npcs.length,
        mem: data.memories.length,
        links: data.npcs.reduce((acc, n) => acc + (n.relations ? n.relations.length : 0), 0)
    } : { loc: 0, npcs: 0, mem: 0, links: 0 };
    shadowRoot.getElementById('stats').innerHTML =
        '<div class="stat"><div class="stat-label">NPCS</div><div class="stat-value">' + stats.npcs + '</div></div>' +
        '<div class="stat"><div class="stat-label">LOC</div><div class="stat-value">' + stats.loc + '</div></div>' +
        '<div class="stat"><div class="stat-label">LINKS</div><div class="stat-value">' + stats.links + '</div></div>' +
        '<div class="stat"><div class="stat-label">MEM</div><div class="stat-value">' + stats.mem + '</div></div>';

    const tab = getSettings().currentTab || 'atlas';
    shadowRoot.querySelectorAll('.tab').forEach(x => x.classList.toggle('active', x.dataset.tab === tab));
    renderTab(tab);
}

function renderTab(tab) {
    if (!shadowRoot) return;
    const data = getCharData();
    const c = shadowRoot.getElementById('content');
    if (!data) {
        c.innerHTML = '<div class="empty"><b>No character selected</b>Open a character in SillyTavern first.</div>';
        return;
    }
    if (tab === 'atlas') renderAtlas(c, data);
    else if (tab === 'constellation') renderConstellation(c, data);
    else if (tab === 'memory') renderMemory(c, data);
    else if (tab === 'atmosphere') renderAtmosphere(c);
}

function avatarBg(n) {
    const r = RELATIONSHIP_TYPES[n.relationship] || RELATIONSHIP_TYPES.neutral;
    return 'linear-gradient(135deg, ' + r.bg + ' 0%, ' + r.color + ' 100%)';
}

function renderNpcItem(n) {
    const r = RELATIONSHIP_TYPES[n.relationship] || RELATIONSHIP_TYPES.neutral;
    const g = getGenderInfo(n.gender);
    const initial = escapeHtml((n.name || '?').charAt(0).toUpperCase());
    const genderSym = g.symbol && g.symbol !== '?' ? '<span class="gender-sym" style="color:' + g.color + '">' + g.symbol + '</span>' : '';
    const roleText = n.role || r.label;
    return '<div class="list-item" data-action="edit-npc" data-id="' + n.id + '">' +
        '<div class="list-name">' +
            '<div class="npc-avatar" style="background:' + avatarBg(n) + '">' + initial + '</div>' +
            '<div class="npc-text">' +
                '<div class="npc-title">' + escapeHtml(n.name) + genderSym + '</div>' +
                '<div class="npc-sub">' + escapeHtml(roleText) + (n.bondLevel ? ' \u00B7 ' + '\u2665'.repeat(Math.min(5, n.bondLevel)) : '') + '</div>' +
            '</div>' +
        '</div>' +
        '<button class="del-btn" data-action="del-npc" data-id="' + n.id + '">\u2715</button>' +
    '</div>';
}

function renderLocItem(l) {
    const desc = l.description ? escapeHtml(l.description.slice(0, 50)) + (l.description.length > 50 ? '\u2026' : '') : 'Tap to add description';
    return '<div class="list-item" data-action="edit-loc" data-id="' + l.id + '">' +
        '<div class="list-name">' +
            '<div class="loc-icon">\uD83D\uDCCD</div>' +
            '<div class="npc-text">' +
                '<div class="npc-title">' + escapeHtml(l.name) + '</div>' +
                '<div class="npc-sub">' + desc + '</div>' +
            '</div>' +
        '</div>' +
        '<button class="del-btn" data-action="del-loc" data-id="' + l.id + '">\u2715</button>' +
    '</div>';
}

function renderAtlas(c, data) {
    const locList = data.locations.length
        ? data.locations.map(renderLocItem).join('')
        : '<div class="empty" style="padding:12px;font-size:11px">No locations yet. Tap + Add or use Auto-extract</div>';

    const npcList = data.npcs.length
        ? data.npcs.map(renderNpcItem).join('')
        : '<div class="empty" style="padding:12px;font-size:11px">No NPCs yet. Tap + Add or use Auto-extract</div>';

    c.innerHTML =
        '<button class="extract-btn" data-action="auto-extract">\uD83E\uDE84 Auto-extract from chat + lorebook</button>' +
        '<div class="extract-hint">AI reads last 10 messages + lorebook to find characters, places, and relationships</div>' +
        '<div class="section">' +
            '<div class="section-head"><span class="section-title">\uD83D\uDC65 NPCs</span><button class="add-btn" data-action="add-npc">+ Add</button></div>' +
            '<div class="list">' + npcList + '</div>' +
        '</div>' +
        '<div class="section">' +
            '<div class="section-head"><span class="section-title">\uD83D\uDCCD Locations</span><button class="add-btn" data-action="add-loc">+ Add</button></div>' +
            '<div class="list">' + locList + '</div>' +
        '</div>';
}

function renderConstellation(c, data) {
    const user = getUserName();
    const cx = 200, cy = 180;
    const npcs = data.npcs.slice(0, 14);

    if (npcs.length === 0) {
        c.innerHTML = '<div class="empty"><b>No bonds yet</b>Add NPCs in the Characters tab first</div>';
        return;
    }

    const positions = npcs.map((n, i) => {
        const angle = (i / npcs.length) * Math.PI * 2 - Math.PI / 2;
        const dist = 95 + (3 - Math.min(3, n.bondLevel || 0)) * 18;
        return { n, x: cx + Math.cos(angle) * dist, y: cy + Math.sin(angle) * dist };
    });

    const npcLinks = [];
    const drawnPairs = new Set();
    for (const pos of positions) {
        for (const rel of (pos.n.relations || [])) {
            const target = positions.find(p => p.n.id === rel.targetId);
            if (!target) continue;
            const pairKey = [pos.n.id, target.n.id].sort().join('|');
            if (drawnPairs.has(pairKey)) continue;
            drawnPairs.add(pairKey);
            const midX = (pos.x + target.x) / 2;
            const midY = (pos.y + target.y) / 2;
            const role = (rel.role || '').slice(0, 10);
            npcLinks.push(
                '<line x1="' + pos.x + '" y1="' + pos.y + '" x2="' + target.x + '" y2="' + target.y +
                '" stroke="#C89EB8" stroke-width="1.2" stroke-dasharray="3 3" opacity="0.6"/>' +
                (role ? '<text x="' + midX + '" y="' + midY + '" text-anchor="middle" font-size="8" fill="#8b6676" font-style="italic">' + escapeHtml(role) + '</text>' : '')
            );
        }
    }

    const userLines = positions.map(pos => {
        const r = RELATIONSHIP_TYPES[pos.n.relationship] || RELATIONSHIP_TYPES.neutral;
        const sw = 1.2 + (pos.n.bondLevel || 0) * 0.4;
        return '<line x1="' + cx + '" y1="' + cy + '" x2="' + pos.x + '" y2="' + pos.y + '" stroke="' + r.color + '" stroke-width="' + sw + '" opacity="0.75"/>';
    }).join('');

    const nodes = positions.map(pos => {
        const n = pos.n;
        const r = RELATIONSHIP_TYPES[n.relationship] || RELATIONSHIP_TYPES.neutral;
        const g = getGenderInfo(n.gender);
        const initial = escapeHtml((n.name || '?').charAt(0).toUpperCase());
        const gSym = g.symbol && g.symbol !== '?'
            ? '<text x="' + (pos.x + 15) + '" y="' + (pos.y - 12) + '" text-anchor="middle" font-size="11" fill="' + g.color + '" font-weight="700">' + g.symbol + '</text>'
            : '';
        return '<g style="cursor:pointer" data-action="edit-npc" data-id="' + n.id + '">' +
            '<circle cx="' + pos.x + '" cy="' + pos.y + '" r="18" fill="' + r.bg + '" stroke="' + r.color + '" stroke-width="2"/>' +
            '<text x="' + pos.x + '" y="' + (pos.y + 5) + '" text-anchor="middle" font-size="14" fill="' + r.color + '" font-weight="700">' + initial + '</text>' +
            gSym +
            '<text x="' + pos.x + '" y="' + (pos.y + 34) + '" text-anchor="middle" font-size="10" fill="#4B1528" font-weight="500">' + escapeHtml((n.name || '').slice(0, 10)) + '</text>' +
            (n.role ? '<text x="' + pos.x + '" y="' + (pos.y + 46) + '" text-anchor="middle" font-size="8" fill="#8b6676">' + escapeHtml(n.role.slice(0, 12)) + '</text>' : '') +
        '</g>';
    }).join('');

    const userInitial = escapeHtml(user.charAt(0).toUpperCase());

    c.innerHTML =
        '<div class="const-wrap">' +
            '<svg viewBox="0 0 400 360">' +
                '<defs><radialGradient id="bgC" cx="50%" cy="50%" r="60%"><stop offset="0%" stop-color="#FFF5F8"/><stop offset="100%" stop-color="#FBEAF0"/></radialGradient></defs>' +
                '<rect x="0" y="0" width="400" height="360" fill="url(#bgC)"/>' +
                npcLinks.join('') +
                userLines +
                nodes +
                '<circle cx="' + cx + '" cy="' + cy + '" r="26" fill="#D4537E" stroke="white" stroke-width="3"/>' +
                '<text x="' + cx + '" y="' + (cy + 6) + '" text-anchor="middle" font-size="16" fill="white" font-weight="700">' + userInitial + '</text>' +
                '<text x="' + cx + '" y="' + (cy + 48) + '" text-anchor="middle" font-size="11" fill="#4B1528" font-weight="700">' + escapeHtml(user) + '</text>' +
            '</svg>' +
            '<div class="legend">' +
                Object.entries(RELATIONSHIP_TYPES).map(([k, r]) => '<span><span class="legend-dot" style="background:' + r.color + '"></span>' + r.label + '</span>').join('') +
            '</div>' +
        '</div>' +
        '<div class="extract-hint" style="margin:10px 0 0">Tap a character to view & edit relationships</div>';

    shadowRoot.querySelectorAll('.const-wrap svg g[data-action="edit-npc"]').forEach(g => {
        g.addEventListener('click', () => { openNpcModal(g.dataset.id); });
    });
}

function renderMemory(c, data) {
    if (!data.memories.length) {
        c.innerHTML = '<div class="empty"><b>No memories yet</b>Save important moments from your roleplay</div><button class="add-btn" data-action="add-memory" style="margin-top:10px;width:100%;padding:10px">+ Add memory</button>';
        return;
    }
    const cards = data.memories.map(m =>
        '<div class="mem-card emo-' + (m.emotion || 'journey') + '">' +
            '<div class="mem-banner">' + escapeHtml(m.chapter || 'Moment') + '</div>' +
            '<div class="mem-body">' +
                '<div class="mem-title">' + escapeHtml(m.title || '') + '</div>' +
                '<div class="mem-quote">' + escapeHtml(m.quote || '') + '</div>' +
            '</div>' +
            '<button class="mem-del" data-action="del-memory" data-id="' + (m.id || '') + '">\u2715</button>' +
        '</div>'
    ).join('');
    c.innerHTML = '<div class="mem-grid">' + cards + '</div><button class="add-btn" data-action="add-memory" style="margin-top:10px;width:100%;padding:8px">+ Add memory</button>';
}

function renderAtmosphere(c) {
    const s = getSettings();
    const effects = [
        { id: 'none',      name: 'None',           desc: 'Off' },
        { id: 'petals',    name: '\uD83C\uDF38 Sakura',   desc: 'Soft pink' },
        { id: 'lanterns',  name: '\uD83C\uDFEE Lanterns', desc: 'Chinese' },
        { id: 'snow',      name: '\u2744\uFE0F Snow',     desc: 'Winter' },
        { id: 'fireflies', name: '\u2728 Fireflies',      desc: 'Magical' },
        { id: 'stars',     name: '\u2B50 Stars',          desc: 'Night' },
        { id: 'rain',      name: '\uD83C\uDF27\uFE0F Rain', desc: 'Sorrow' },
        { id: 'leaves',    name: '\uD83C\uDF42 Leaves',   desc: 'Autumn' }
    ];
    const autoOn = !!s.autoMood;
    c.innerHTML =
        '<button class="extract-btn" data-action="auto-mood">\uD83C\uDFAD Match mood to scene</button>' +
        '<div class="extract-hint">AI picks the best effect based on current scene</div>' +
        '<div class="atmos-grid">' +
            effects.map(e =>
                '<div class="atmos-card ' + (s.atmosphere.effect === e.id ? 'active' : '') + '" data-action="set-atmos" data-effect="' + e.id + '">' +
                '<div class="atmos-name">' + e.name + '</div><div class="atmos-desc">' + e.desc + '</div></div>'
            ).join('') +
        '</div>' +
        '<div class="intensity-row">' +
            '<label>Intensity</label>' +
            '<div class="seg">' +
                ['subtle', 'medium', 'dramatic'].map(v =>
                    '<button class="seg-btn ' + (s.atmosphere.intensity === v ? 'active' : '') + '" data-action="set-intensity" data-intensity="' + v + '">' + v + '</button>'
                ).join('') +
            '</div>' +
        '</div>' +
        '<div class="auto-row">' +
            '<div class="auto-toggle-row">' +
                '<span>\uD83C\uDF1F Auto-update mood when new messages arrive</span>' +
                '<div class="toggle ' + (autoOn ? 'on' : '') + '" data-action="toggle-auto-mood"><div class="knob"></div></div>' +
            '</div>' +
            '<div style="font-size:10px;color:#8b6676">When on, HAMHAM automatically picks a mood every time the bot sends a new message (throttled 30s).</div>' +
        '</div>';
}

function closeModal() {
    const root = shadowRoot && shadowRoot.getElementById('modal-root');
    if (root) root.innerHTML = '';
}

function openNpcModal(npcId) {
    const data = getCharData();
    if (!data) return;

    let npc;
    if (npcId) {
        npc = data.npcs.find(n => n.id === npcId);
        if (!npc) return;
    } else {
        npc = { id: uid('npc'), name: '', gender: 'unknown', relationship: 'neutral', role: '', description: '', bondLevel: 0, mentions: 0, relations: [] };
    }

    const otherNpcs = data.npcs.filter(n => n.id !== npc.id);
    const isNew = !npcId;

    const genderBtns = GENDERS.map(g =>
        '<button type="button" class="gender-btn ' + (npc.gender === g.id ? 'active' : '') + '" data-g="' + g.id + '">' +
        '<span class="gsym">' + (g.symbol || '?') + '</span><span>' + g.label + '</span></button>'
    ).join('');

    const relOptions = VALID_RELATIONSHIPS.map(k =>
        '<option value="' + k + '"' + (npc.relationship === k ? ' selected' : '') + '>' + RELATIONSHIP_TYPES[k].label + '</option>'
    ).join('');

    const relationsHTML = npc.relations.map((rel, idx) => {
        const targetOpts = otherNpcs.map(n =>
            '<option value="' + n.id + '"' + (rel.targetId === n.id ? ' selected' : '') + '>' + escapeHtml(n.name) + '</option>'
        ).join('');
        return '<div class="relation-row" data-idx="' + idx + '">' +
            '<select class="rel-target"><option value="">-- select --</option>' + targetOpts + '</select>' +
            '<input type="text" class="rel-role" placeholder="role" value="' + escapeHtml(rel.role || '') + '" list="role-suggestions"/>' +
            '<button type="button" class="del" data-a="del-rel">\u2715</button>' +
        '</div>';
    }).join('');

    const root = shadowRoot.getElementById('modal-root');
    root.innerHTML =
        '<div class="modal-backdrop">' +
            '<div class="modal">' +
                '<div class="modal-head">' +
                    '<h3 class="modal-title">' + (isNew ? 'Add NPC' : 'Edit NPC') + '</h3>' +
                    '<button class="close-btn" data-close="1">\u2715</button>' +
                '</div>' +
                '<div class="modal-body">' +
                    '<div class="field">' +
                        '<label class="field-label">Name</label>' +
                        '<input type="text" id="npc-name" value="' + escapeHtml(npc.name) + '" placeholder="Character name"/>' +
                    '</div>' +
                    '<div class="field">' +
                        '<label class="field-label">Gender</label>' +
                        '<div class="gender-seg">' + genderBtns + '</div>' +
                    '</div>' +
                    '<div class="field">' +
                        '<label class="field-label">Relationship to ' + escapeHtml(getUserName()) + '</label>' +
                        '<select id="npc-rel">' + relOptions + '</select>' +
                    '</div>' +
                    '<div class="field">' +
                        '<label class="field-label">Role (mother, lover, mentor, friend, etc.)</label>' +
                        '<input type="text" id="npc-role" value="' + escapeHtml(npc.role || '') + '" placeholder="friend, mother, ex..." list="role-suggestions"/>' +
                    '</div>' +
                    '<div class="field">' +
                        '<label class="field-label">Description</label>' +
                        '<textarea id="npc-desc" placeholder="Short description of this character...">' + escapeHtml(npc.description || '') + '</textarea>' +
                    '</div>' +
                    (otherNpcs.length > 0 ?
                        '<div class="field">' +
                            '<label class="field-label">Relationships with other NPCs (dropdown + free text)</label>' +
                            '<div class="relations-list" id="relations-list">' + relationsHTML + '</div>' +
                            '<button type="button" class="btn-secondary" data-a="add-rel" style="margin-top:6px;font-size:11px;padding:6px 10px">+ Add relationship</button>' +
                        '</div>' : '') +
                    '<datalist id="role-suggestions">' +
                        ROLE_SUGGESTIONS.map(r => '<option value="' + r + '"></option>').join('') +
                    '</datalist>' +
                '</div>' +
                '<div class="modal-foot">' +
                    (!isNew ? '<button class="btn-danger" data-a="delete">Delete</button>' : '') +
                    '<button class="btn-secondary" data-close="1">Cancel</button>' +
                    '<button class="btn-primary" data-a="save">' + (isNew ? 'Add' : 'Save') + '</button>' +
                '</div>' +
            '</div>' +
        '</div>';

    root.querySelectorAll('.gender-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            root.querySelectorAll('.gender-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
        });
    });

    root.addEventListener('click', (e) => {
        if (e.target === root.querySelector('.modal-backdrop') || e.target.closest('[data-close]')) {
            closeModal(); return;
        }
        const a = e.target.closest('[data-a]');
        if (!a) return;
        const action = a.dataset.a;

        if (action === 'add-rel') {
            const list = root.querySelector('#relations-list');
            if (!list) return;
            const targetOpts = otherNpcs.map(n => '<option value="' + n.id + '">' + escapeHtml(n.name) + '</option>').join('');
            const row = document.createElement('div');
            row.className = 'relation-row';
            row.innerHTML =
                '<select class="rel-target"><option value="">-- select --</option>' + targetOpts + '</select>' +
                '<input type="text" class="rel-role" placeholder="role" list="role-suggestions"/>' +
                '<button type="button" class="del" data-a="del-rel">\u2715</button>';
            list.appendChild(row);
        }
        else if (action === 'del-rel') {
            const row = e.target.closest('.relation-row');
            if (row) row.remove();
        }
        else if (action === 'delete') {
            if (confirm('Delete ' + npc.name + '?')) {
                data.npcs = data.npcs.filter(n => n.id !== npc.id);
                for (const other of data.npcs) {
                    other.relations = (other.relations || []).filter(r => r.targetId !== npc.id);
                }
                save(); refreshPanel(); closeModal();
            }
        }
        else if (action === 'save') {
            const name = root.querySelector('#npc-name').value.trim();
            if (!name) { alert('Name is required'); return; }
            npc.name = name.slice(0, 40);
            const gBtn = root.querySelector('.gender-btn.active');
            npc.gender = gBtn ? gBtn.dataset.g : 'unknown';
            npc.relationship = root.querySelector('#npc-rel').value;
            npc.role = root.querySelector('#npc-role').value.trim().slice(0, 30);
            npc.description = root.querySelector('#npc-desc').value.trim().slice(0, 500);
            npc.relations = [];
            root.querySelectorAll('.relation-row').forEach(row => {
                const targetId = row.querySelector('.rel-target').value;
                const role = row.querySelector('.rel-role').value.trim();
                if (targetId && role) {
                    npc.relations.push({ targetId, role: role.slice(0, 30) });
                }
            });
            if (isNew) data.npcs.push(npc);
            save(); refreshPanel(); closeModal();
        }
    });
}

function openLocationModal(locId) {
    const data = getCharData();
    if (!data) return;

    let loc;
    if (locId) {
        loc = data.locations.find(l => l.id === locId);
        if (!loc) return;
    } else {
        loc = { id: uid('loc'), name: '', description: '' };
    }
    const isNew = !locId;

    const root = shadowRoot.getElementById('modal-root');
    root.innerHTML =
        '<div class="modal-backdrop">' +
            '<div class="modal">' +
                '<div class="modal-head">' +
                    '<h3 class="modal-title">' + (isNew ? 'Add Location' : 'Edit Location') + '</h3>' +
                    '<button class="close-btn" data-close="1">\u2715</button>' +
                '</div>' +
                '<div class="modal-body">' +
                    '<div class="field">' +
                        '<label class="field-label">Name</label>' +
                        '<input type="text" id="loc-name" value="' + escapeHtml(loc.name) + '" placeholder="Location name"/>' +
                    '</div>' +
                    '<div class="field">' +
                        '<label class="field-label">Description</label>' +
                        '<textarea id="loc-desc" placeholder="What is this place like?">' + escapeHtml(loc.description || '') + '</textarea>' +
                    '</div>' +
                '</div>' +
                '<div class="modal-foot">' +
                    (!isNew ? '<button class="btn-danger" data-a="delete">Delete</button>' : '') +
                    '<button class="btn-secondary" data-close="1">Cancel</button>' +
                    '<button class="btn-primary" data-a="save">' + (isNew ? 'Add' : 'Save') + '</button>' +
                '</div>' +
            '</div>' +
        '</div>';

    root.addEventListener('click', (e) => {
        if (e.target === root.querySelector('.modal-backdrop') || e.target.closest('[data-close]')) {
            closeModal(); return;
        }
        const a = e.target.closest('[data-a]');
        if (!a) return;
        const action = a.dataset.a;

        if (action === 'delete') {
            if (confirm('Delete ' + loc.name + '?')) {
                data.locations = data.locations.filter(l => l.id !== loc.id);
                save(); refreshPanel(); closeModal();
            }
        }
        else if (action === 'save') {
            const name = root.querySelector('#loc-name').value.trim();
            if (!name) { alert('Name is required'); return; }
            loc.name = name.slice(0, 40);
            loc.description = root.querySelector('#loc-desc').value.trim().slice(0, 500);
            if (isNew) data.locations.push(loc);
            save(); refreshPanel(); closeModal();
        }
    });
}


let atmosCanvas = null, atmosCtx = null, atmosRAF = null, atmosParticles = [];

function restartAtmosphere() {
    stopAtmosphere();
    const s = getSettings();
    if (!s.atmosphere || s.atmosphere.effect === 'none') return;
    startAtmosphere(s.atmosphere.effect, s.atmosphere.intensity);
}

function stopAtmosphere() {
    if (atmosRAF) { cancelAnimationFrame(atmosRAF); atmosRAF = null; }
    if (atmosCanvas) { atmosCanvas.remove(); atmosCanvas = null; atmosCtx = null; }
    atmosParticles = [];
}

function startAtmosphere(effect, intensity) {
    atmosCanvas = document.createElement('canvas');
    atmosCanvas.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:2147483646;';
    document.documentElement.appendChild(atmosCanvas);
    atmosCtx = atmosCanvas.getContext('2d');
    const resize = () => { atmosCanvas.width = window.innerWidth; atmosCanvas.height = window.innerHeight; };
    resize();
    window.addEventListener('resize', resize);
    const count = intensity === 'subtle' ? 10 : intensity === 'dramatic' ? 32 : 18;
    atmosParticles = [];
    for (let i = 0; i < count; i++) atmosParticles.push(newParticle(effect));
    function loop() {
        atmosCtx.clearRect(0, 0, atmosCanvas.width, atmosCanvas.height);
        for (const p of atmosParticles) {
            updateParticle(p, effect);
            drawParticle(p, effect);
            const margin = 60;
            if (p.y > atmosCanvas.height + margin || p.y < -margin * 3 || p.x < -margin || p.x > atmosCanvas.width + margin) {
                Object.assign(p, newParticle(effect));
            }
        }
        atmosRAF = requestAnimationFrame(loop);
    }
    loop();
}

function newParticle(effect) {
    const w = window.innerWidth, h = window.innerHeight;
    const p = {
        x: Math.random() * w, y: Math.random() * h - h,
        vx: 0, vy: 0, size: 3, rot: Math.random() * Math.PI * 2,
        vr: (Math.random() - 0.5) * 0.015, opacity: 0.3 + Math.random() * 0.25,
        hue: Math.random(), sway: Math.random() * Math.PI * 2,
        swaySpeed: 0.01 + Math.random() * 0.015, type: 0
    };

    if (effect === 'petals') {
        p.vy = 0.25 + Math.random() * 0.35;
        p.vx = (Math.random() - 0.5) * 0.25;
        p.size = 7 + Math.random() * 6;
        p.opacity = 0.18 + Math.random() * 0.22;
        p.vr = (Math.random() - 0.5) * 0.012;
    }
    else if (effect === 'lanterns') {
        const r = Math.random();
        if (r < 0.2) {
            p.type = 1;
            p.vx = (Math.random() - 0.5) * 0.08;
            p.vy = -0.15 - Math.random() * 0.15;
            p.size = 8 + Math.random() * 5;
            p.y = h + 30;
            p.opacity = 0.45 + Math.random() * 0.2;
        } else if (r < 0.85) {
            p.type = 2;
            p.vx = (Math.random() - 0.5) * 0.3;
            p.vy = 0.25 + Math.random() * 0.35;
            p.size = 5 + Math.random() * 3;
            p.opacity = 0.22 + Math.random() * 0.2;
            p.vr = (Math.random() - 0.5) * 0.018;
        } else {
            p.type = 3;
            p.vx = (Math.random() - 0.5) * 0.15;
            p.vy = 0.08 + Math.random() * 0.15;
            p.size = 0.9 + Math.random() * 0.8;
            p.y = Math.random() * h;
        }
    }
    else if (effect === 'snow') {
        p.vx = (Math.random() - 0.5) * 0.35;
        p.vy = 0.35 + Math.random() * 0.3;
        p.size = 4 + Math.random() * 3;
        p.opacity = 0.45 + Math.random() * 0.3;
        p.vr = (Math.random() - 0.5) * 0.008;
    }
    else if (effect === 'fireflies') {
        p.vx = (Math.random() - 0.5) * 0.2;
        p.vy = (Math.random() - 0.5) * 0.2;
        p.size = 1.8 + Math.random() * 1.2;
        p.y = Math.random() * h;
    }
    else if (effect === 'stars') {
        p.vy = 0.06 + Math.random() * 0.08;
        p.size = 1 + Math.random();
        p.y = Math.random() * h;
    }
    else if (effect === 'rain') {
        p.vx = -0.8;
        p.vy = 6 + Math.random() * 3;
        p.size = 1;
        p.opacity = 0.3 + Math.random() * 0.25;
    }
    else if (effect === 'leaves') {
        p.vy = 0.3 + Math.random() * 0.4;
        p.vx = (Math.random() - 0.5) * 0.5;
        p.size = 6 + Math.random() * 5;
        p.opacity = 0.35 + Math.random() * 0.3;
        p.vr = (Math.random() - 0.5) * 0.04;
    }
    return p;
}

function updateParticle(p, effect) {
    p.rot += p.vr;
    p.sway += p.swaySpeed;

    if (effect === 'petals') {
        p.x += p.vx + Math.sin(p.sway) * 0.3;
        p.y += p.vy;
    } else if (effect === 'lanterns') {
        if (p.type === 1) {
            p.x += p.vx + Math.sin(p.sway) * 0.2;
            p.y += p.vy;
            p.opacity = 0.45 + Math.sin(Date.now() / 800 + p.hue * 5) * 0.1;
        } else if (p.type === 2) {
            p.x += p.vx + Math.sin(p.sway) * 0.35;
            p.y += p.vy;
        } else {
            p.x += p.vx;
            p.y += p.vy;
            p.opacity = 0.15 + Math.abs(Math.sin(Date.now() / 500 + p.hue * 8)) * 0.45;
        }
    } else if (effect === 'snow') {
        p.x += p.vx + Math.sin(p.sway) * 0.25;
        p.y += p.vy;
    } else if (effect === 'fireflies') {
        p.x += p.vx + Math.sin(p.sway * 0.7) * 0.12;
        p.y += p.vy + Math.cos(p.sway * 0.5) * 0.08;
        p.opacity = 0.2 + Math.abs(Math.sin(Date.now() / 700 + p.hue * 10)) * 0.45;
    } else if (effect === 'stars') {
        p.y += p.vy;
        p.opacity = 0.15 + Math.abs(Math.sin(Date.now() / 1200 + p.hue * 6)) * 0.45;
    } else if (effect === 'leaves') {
        // Leaves sway wider and tumble more
        p.x += p.vx + Math.sin(p.sway) * 0.6;
        p.y += p.vy + Math.sin(p.sway * 0.5) * 0.15;
    } else {
        p.x += p.vx;
        p.y += p.vy;
    }
}

function drawSakura(c, p) {
    c.save();
    c.translate(p.x, p.y);
    c.rotate(p.rot);
    const palette = [['#FFE5EE','#FFC2D4'],['#FFD1E0','#FFAAC6'],['#FBEAF0','#F4C0D1'],['#FFDCE8','#F7B5CC']];
    const pal = palette[Math.floor(p.hue * palette.length)];
    const light = pal[0], deep = pal[1];
    c.shadowColor = light; c.shadowBlur = p.size * 0.6;
    c.fillStyle = light; c.globalAlpha = p.opacity;
    for (let i = 0; i < 5; i++) {
        c.save();
        c.rotate((i * 2 * Math.PI) / 5);
        c.beginPath();
        c.ellipse(0, -p.size * 0.55, p.size * 0.36, p.size * 0.62, 0, 0, Math.PI * 2);
        c.fill();
        c.restore();
    }
    c.shadowBlur = 0;
    c.fillStyle = deep; c.globalAlpha = p.opacity * 0.5;
    for (let i = 0; i < 5; i++) {
        c.save();
        c.rotate((i * 2 * Math.PI) / 5);
        c.beginPath();
        c.ellipse(0, -p.size * 0.4, p.size * 0.15, p.size * 0.28, 0, 0, Math.PI * 2);
        c.fill();
        c.restore();
    }
    c.fillStyle = '#FFD166'; c.globalAlpha = p.opacity * 0.65;
    c.beginPath(); c.arc(0, 0, p.size * 0.11, 0, Math.PI * 2); c.fill();
    c.restore();
}

function drawPlum(c, p) {
    c.save();
    c.translate(p.x, p.y);
    c.rotate(p.rot);
    const palette = [['#FFD1DC','#D9527A'],['#FFC0CB','#C43358'],['#FFB6C1','#B52B4E']];
    const pal = palette[Math.floor(p.hue * palette.length)];
    const light = pal[0], deep = pal[1];
    c.shadowColor = deep; c.shadowBlur = p.size * 0.4;
    c.fillStyle = light; c.globalAlpha = p.opacity;
    for (let i = 0; i < 5; i++) {
        c.save();
        c.rotate((i * 2 * Math.PI) / 5);
        c.beginPath();
        c.arc(0, -p.size * 0.55, p.size * 0.42, 0, Math.PI * 2);
        c.fill();
        c.restore();
    }
    c.shadowBlur = 0;
    c.fillStyle = deep; c.globalAlpha = p.opacity * 0.6;
    c.beginPath(); c.arc(0, 0, p.size * 0.2, 0, Math.PI * 2); c.fill();
    c.restore();
}

function drawLantern(c, p) {
    c.save();
    c.translate(p.x, p.y);
    const w = p.size * 1.1, h = p.size * 1.4;
    c.shadowColor = '#FF9933'; c.shadowBlur = p.size * 1.6;
    c.globalAlpha = p.opacity * 0.3;
    c.fillStyle = '#FFB347';
    c.beginPath(); c.arc(0, 0, p.size * 0.7, 0, Math.PI * 2); c.fill();
    c.shadowBlur = 0; c.globalAlpha = p.opacity;
    const grad = c.createRadialGradient(0, -h * 0.15, 0, 0, 0, w * 0.6);
    grad.addColorStop(0, '#FFCC66'); grad.addColorStop(0.4, '#E64545'); grad.addColorStop(1, '#A01820');
    c.fillStyle = grad;
    c.beginPath(); c.ellipse(0, 0, w * 0.48, h * 0.48, 0, 0, Math.PI * 2); c.fill();
    c.strokeStyle = '#FFD700'; c.lineWidth = 1;
    c.beginPath(); c.ellipse(0, -h * 0.4, w * 0.36, 1.2, 0, 0, Math.PI * 2); c.stroke();
    c.beginPath(); c.ellipse(0, h * 0.4, w * 0.36, 1.2, 0, 0, Math.PI * 2); c.stroke();
    c.strokeStyle = '#C41E3A'; c.lineWidth = 0.8;
    c.beginPath(); c.moveTo(0, h * 0.48); c.lineTo(0, h * 0.8); c.stroke();
    c.fillStyle = '#FFD700';
    c.beginPath(); c.arc(0, h * 0.8, 1.2, 0, Math.PI * 2); c.fill();
    c.restore();
}

function drawSparkle(c, p) {
    c.save();
    c.translate(p.x, p.y);
    c.globalAlpha = p.opacity;
    c.fillStyle = '#FFD700'; c.shadowColor = '#FFAA00'; c.shadowBlur = p.size * 3;
    c.beginPath(); c.arc(0, 0, p.size, 0, Math.PI * 2); c.fill();
    c.shadowBlur = 0;
    c.strokeStyle = 'rgba(255, 235, 100, ' + p.opacity + ')'; c.lineWidth = 0.4;
    c.beginPath();
    c.moveTo(-p.size * 2.2, 0); c.lineTo(p.size * 2.2, 0);
    c.moveTo(0, -p.size * 2.2); c.lineTo(0, p.size * 2.2);
    c.stroke();
    c.restore();
}

function drawSnow(c, p) {
    c.save();
    c.translate(p.x, p.y);
    c.rotate(p.rot);
    c.globalAlpha = p.opacity;
    c.shadowColor = '#E0F0FF';
    c.shadowBlur = p.size * 1.5;
    c.strokeStyle = '#ffffff';
    c.lineWidth = 0.9;
    c.lineCap = 'round';

    // 6 main arms
    for (let i = 0; i < 6; i++) {
        c.save();
        c.rotate((i * Math.PI) / 3);
        c.beginPath();
        c.moveTo(0, 0);
        c.lineTo(0, -p.size * 1.6);
        c.stroke();
        // Two V-shaped side branches near the tip
        c.beginPath();
        c.moveTo(0, -p.size * 1.0);
        c.lineTo(-p.size * 0.35, -p.size * 1.35);
        c.moveTo(0, -p.size * 1.0);
        c.lineTo(p.size * 0.35, -p.size * 1.35);
        c.stroke();
        // Smaller branches midway
        c.beginPath();
        c.moveTo(0, -p.size * 0.55);
        c.lineTo(-p.size * 0.22, -p.size * 0.78);
        c.moveTo(0, -p.size * 0.55);
        c.lineTo(p.size * 0.22, -p.size * 0.78);
        c.stroke();
        c.restore();
    }

    // Small center hexagon
    c.shadowBlur = 0;
    c.fillStyle = '#ffffff';
    c.beginPath();
    c.arc(0, 0, p.size * 0.22, 0, Math.PI * 2);
    c.fill();
    c.restore();
}

function drawLeaf(c, p) {
    c.save();
    c.translate(p.x, p.y);
    c.rotate(p.rot);

    // Autumn palette: orange, red, yellow, amber
    const palette = [
        ['#FF9A3C', '#C9511A'], // bright orange
        ['#FFD166', '#C89A2A'], // gold yellow
        ['#E85A3A', '#8E1E18'], // red
        ['#F4A261', '#C67E3C'], // amber
        ['#FFB347', '#D87A27']  // pumpkin
    ];
    const pal = palette[Math.floor(p.hue * palette.length)];
    const light = pal[0], dark = pal[1];

    c.globalAlpha = p.opacity;
    c.shadowColor = dark;
    c.shadowBlur = p.size * 0.5;

    // Leaf body — pointed oval shape
    c.fillStyle = light;
    c.beginPath();
    c.moveTo(0, -p.size);
    c.bezierCurveTo(p.size * 0.7, -p.size * 0.5, p.size * 0.7, p.size * 0.5, 0, p.size);
    c.bezierCurveTo(-p.size * 0.7, p.size * 0.5, -p.size * 0.7, -p.size * 0.5, 0, -p.size);
    c.fill();

    // Darker shade on one half for depth
    c.shadowBlur = 0;
    c.fillStyle = dark;
    c.globalAlpha = p.opacity * 0.4;
    c.beginPath();
    c.moveTo(0, -p.size);
    c.bezierCurveTo(p.size * 0.7, -p.size * 0.5, p.size * 0.7, p.size * 0.5, 0, p.size);
    c.lineTo(0, -p.size);
    c.fill();

    // Center vein
    c.globalAlpha = p.opacity * 0.8;
    c.strokeStyle = dark;
    c.lineWidth = 0.6;
    c.beginPath();
    c.moveTo(0, -p.size);
    c.lineTo(0, p.size);
    c.stroke();

    // Side veins
    c.lineWidth = 0.35;
    for (let i = -2; i <= 2; i++) {
        if (i === 0) continue;
        const y = i * p.size * 0.3;
        const len = p.size * (1 - Math.abs(i) * 0.2) * 0.55;
        c.beginPath();
        c.moveTo(0, y);
        c.lineTo(len, y + p.size * 0.12);
        c.moveTo(0, y);
        c.lineTo(-len, y + p.size * 0.12);
        c.stroke();
    }

    // Little stem at top
    c.globalAlpha = p.opacity * 0.9;
    c.strokeStyle = dark;
    c.lineWidth = 0.8;
    c.beginPath();
    c.moveTo(0, -p.size);
    c.lineTo(0, -p.size - p.size * 0.25);
    c.stroke();

    c.restore();
}

function drawFirefly(c, p) {
    c.save();
    c.globalAlpha = p.opacity * 0.3;
    c.fillStyle = '#FFD166';
    c.beginPath(); c.arc(p.x, p.y, p.size * 4, 0, Math.PI * 2); c.fill();
    c.globalAlpha = p.opacity * 0.5;
    c.beginPath(); c.arc(p.x, p.y, p.size * 2.5, 0, Math.PI * 2); c.fill();
    c.globalAlpha = p.opacity;
    c.shadowColor = '#FFD166'; c.shadowBlur = p.size * 6;
    c.fillStyle = '#FFEB99';
    c.beginPath(); c.arc(p.x, p.y, p.size, 0, Math.PI * 2); c.fill();
    c.restore();
}

function drawStar(c, p) {
    c.save();
    c.translate(p.x, p.y);
    c.globalAlpha = p.opacity;
    c.fillStyle = '#ffffff';
    c.shadowColor = '#C4DFFF'; c.shadowBlur = p.size * 4;
    c.beginPath(); c.arc(0, 0, p.size, 0, Math.PI * 2); c.fill();
    c.shadowBlur = 0;
    c.strokeStyle = 'rgba(255, 255, 255, ' + (p.opacity * 0.6) + ')';
    c.lineWidth = 0.4;
    c.beginPath();
    c.moveTo(-p.size * 2.5, 0); c.lineTo(p.size * 2.5, 0);
    c.moveTo(0, -p.size * 2.5); c.lineTo(0, p.size * 2.5);
    c.stroke();
    c.restore();
}

function drawRain(c, p) {
    c.save();
    c.globalAlpha = p.opacity;
    const grad = c.createLinearGradient(p.x, p.y, p.x - 2, p.y + 12);
    grad.addColorStop(0, 'rgba(180, 210, 240, 0.8)');
    grad.addColorStop(1, 'rgba(120, 160, 200, 0.2)');
    c.strokeStyle = grad; c.lineWidth = 1.2;
    c.beginPath(); c.moveTo(p.x, p.y); c.lineTo(p.x - 2, p.y + 12); c.stroke();
    c.restore();
}

function drawParticle(p, effect) {
    const c = atmosCtx;
    if (effect === 'petals') { drawSakura(c, p); return; }
    if (effect === 'lanterns') {
        if (p.type === 1) drawLantern(c, p);
        else if (p.type === 2) drawPlum(c, p);
        else drawSparkle(c, p);
        return;
    }
    if (effect === 'snow') { drawSnow(c, p); return; }
    if (effect === 'fireflies') { drawFirefly(c, p); return; }
    if (effect === 'stars') { drawStar(c, p); return; }
    if (effect === 'rain') { drawRain(c, p); return; }
    if (effect === 'leaves') { drawLeaf(c, p); return; }
}

function promptAddMemory() {
    const title = prompt('Memory title:'); if (!title) return;
    const chapter = prompt('Chapter/time:', 'Ch 1');
    const quote = prompt('Key quote:', '');
    const emotion = prompt('Emotion (romance/battle/mystery/victory/journey):', 'journey');
    const data = getCharData(); if (!data) return;
    data.memories.push({ id: uid('mem'), title, chapter, quote, emotion });
    save(); refreshPanel();
}

function delItem(listName, id) {
    const data = getCharData(); if (!data) return;
    data[listName] = data[listName].filter(x => x.id !== id);
    if (listName === 'npcs') {
        for (const n of data.npcs) {
            n.relations = (n.relations || []).filter(r => r.targetId !== id);
        }
    }
    save(); refreshPanel();
}

function resetAllData() {
    if (!confirm('Delete ALL HAMHAM data for ALL characters?')) return;
    getSettings().characters = {};
    save(); refreshPanel();
}

function exportData() {
    const data = JSON.stringify(getSettings(), null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'hamham-backup.json';
    a.click(); URL.revokeObjectURL(url);
}

function onChatChanged() { log('Chat changed'); refreshPanel(); }

function onMessageReceived() {
    try {
        if (getSettings().autoBond) {
            const ctx = getContext();
            const msg = ctx.chat && ctx.chat[ctx.chat.length - 1];
            if (msg && !msg.is_user) {
                const data = getCharData();
                if (data) {
                    const text = (msg.mes || '').toLowerCase();
                    for (const npc of data.npcs) {
                        if (text.includes((npc.name || '').toLowerCase())) {
                            npc.mentions = (npc.mentions || 0) + 1;
                            if (npc.mentions % 3 === 0) npc.bondLevel = Math.min(5, (npc.bondLevel || 0) + 1);
                        }
                    }
                    save(); refreshPanel();
                }
            }
        }
        autoMoodCheck();
    } catch (e) {}
}

async function loadSettingsUI() {
    try {
        const html = await $.get(extensionFolderPath + '/settings.html');
        $('#extensions_settings2').append(html);
        log('Settings HTML appended');
        $('.hamham-settings .inline-drawer-content').append(
            '<div class="hamham-row" style="flex-direction:column;align-items:stretch;margin-top:12px;padding-top:12px;border-top:1px solid rgba(212,83,126,0.15)">' +
                '<button id="hamham-find-btn" class="menu_button" style="margin-bottom:8px">\uD83D\uDD0D Find the icon (flash red)</button>' +
                '<label style="font-size:11px;opacity:0.7;margin-bottom:4px">Status log</label>' +
                '<pre id="hamham-debug-log" style="font-size:10px;background:rgba(251,234,240,0.4);padding:8px;border-radius:6px;margin:0;white-space:pre-wrap;word-wrap:break-word;color:#4B1528;max-height:200px;overflow-y:auto;font-family:ui-monospace,monospace"></pre>' +
            '</div>'
        );
        const s = getSettings();
        $('#hamham-toggle-icon').prop('checked', s.iconVisible);
        $('#hamham-toggle-autobond').prop('checked', s.autoBond);
        $('#hamham-debug-log').text(debugLog.slice(-12).join('\n'));
    } catch (e) { log('loadSettingsUI: ' + e.message, true); }
}

function attachDelegation() {
    $(document).off('.hamham')
        .on('change.hamham', '#hamham-toggle-icon', function () {
            getSettings().iconVisible = $(this).prop('checked');
            save();
            setFloaterVisible(getSettings().iconVisible);
        })
        .on('change.hamham', '#hamham-toggle-autobond', function () {
            getSettings().autoBond = $(this).prop('checked');
            save();
        })
        .on('click.hamham', '#hamham-open-panel-btn', openPanel)
        .on('click.hamham', '#hamham-reset-all-btn', resetAllData)
        .on('click.hamham', '#hamham-find-btn', function () {
            if (!shadowRoot) { alert('UI not mounted!'); return; }
            const el = shadowRoot.getElementById('floater');
            if (!el) { alert('Icon missing!'); return; }
            el.style.background = 'red';
            el.style.transform = 'scale(2)';
            setTimeout(() => { el.style.background = ''; el.style.transform = ''; }, 3000);
        });
}

jQuery(async () => {
    log('HAMHAM ' + VERSION + ' init...');
    try {
        getSettings();
        attachDelegation();
        await loadSettingsUI();
        mountUI();
        if (eventSource && event_types) {
            try {
                if (event_types.CHAT_CHANGED) eventSource.on(event_types.CHAT_CHANGED, onChatChanged);
                if (event_types.MESSAGE_RECEIVED) eventSource.on(event_types.MESSAGE_RECEIVED, onMessageReceived);
            } catch (e) { log('Event bind: ' + e.message, true); }
        }
        restartAtmosphere();
        log('Ready! \u273F');
    } catch (e) { log('Init FAILED: ' + e.message, true); }
});
