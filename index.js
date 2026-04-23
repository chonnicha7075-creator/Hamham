/* ============================================
   HAMHAM v1.0.4
   + Auto-extract from chat (uses bot's LLM)
   + Softer 5-petal sakura + Chinese lanterns
   ============================================ */

import { extension_settings, getContext } from "../../../extensions.js";
import { saveSettingsDebounced, eventSource, event_types, generateQuietPrompt } from "../../../../script.js";

const extensionName = "Hamham";
const extensionFolderPath = `scripts/extensions/third-party/${extensionName}`;
const VERSION = "1.0.4";

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
    rival:   { label: 'Rival',   color: '#BA7517', bg: '#FAEEDA' },
    enemy:   { label: 'Enemy',   color: '#E24B4A', bg: '#FCEBEB' },
    neutral: { label: 'Neutral', color: '#888780', bg: '#F1EFE8' }
};

const VALID_RELATIONSHIPS = Object.keys(RELATIONSHIP_TYPES);

const HAMSTER_SVG = `<svg width="40" height="40" viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg">
<circle cx="12" cy="13" r="4.5" fill="#ED93B1"/>
<circle cx="28" cy="13" r="4.5" fill="#ED93B1"/>
<circle cx="12" cy="13" r="2.2" fill="#F4C0D1"/>
<circle cx="28" cy="13" r="2.2" fill="#F4C0D1"/>
<circle cx="20" cy="22" r="13" fill="#F4C0D1"/>
<circle cx="13.5" cy="24.5" r="2.8" fill="#ED93B1" opacity="0.7"/>
<circle cx="26.5" cy="24.5" r="2.8" fill="#ED93B1" opacity="0.7"/>
<circle cx="16" cy="21" r="1.6" fill="#4B1528"/>
<circle cx="24" cy="21" r="1.6" fill="#4B1528"/>
<circle cx="16.6" cy="20.4" r="0.5" fill="#fff"/>
<circle cx="24.6" cy="20.4" r="0.5" fill="#fff"/>
<ellipse cx="20" cy="24.5" rx="1.3" ry="0.9" fill="#4B1528"/>
<path d="M 18 25 Q 20 27 22 25" stroke="#4B1528" stroke-width="0.8" fill="none" stroke-linecap="round"/>
</svg>`;

// ============================================
// Logging
// ============================================
const debugLog = [];
function log(msg, isError = false) {
    const ts = new Date().toLocaleTimeString();
    const line = `[${ts}] ${isError ? 'ERR ' : 'OK  '}${msg}`;
    debugLog.push(line);
    if (debugLog.length > 60) debugLog.shift();
    if (isError) console.error(`[Hamham] ${msg}`);
    else console.log(`[Hamham] ${msg}`);
    const $dbg = $('#hamham-debug-log');
    if ($dbg.length) $dbg.text(debugLog.slice(-12).join('\n'));
}

// ============================================
// Settings
// ============================================
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
        if (ctx.groupId) return ctx.groups?.find(g => g.id === ctx.groupId)?.name || 'Group';
        if (ctx.characterId !== undefined && ctx.characterId !== null) {
            return ctx.characters[ctx.characterId]?.name || '—';
        }
    } catch (e) {}
    return '—';
}

function getUserName() {
    try { return getContext()?.name1 || 'You'; } catch (e) { return 'You'; }
}

function getCharData() {
    const key = getCurrentCharacterKey();
    if (!key) return null;
    const s = getSettings();
    if (!s.characters[key]) {
        s.characters[key] = { name: getCurrentCharacterName(), locations: [], npcs: [], memories: [] };
        save();
    }
    return s.characters[key];
}

function escapeHtml(s) {
    return String(s || '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}

// ============================================
// Auto-extract via LLM (uses bot's current API)
// ============================================
async function autoExtract() {
    const data = getCharData();
    if (!data) return alert('Please select a character first');

    const btn = shadowRoot?.querySelector('[data-action="auto-extract"]');
    const origText = btn ? btn.textContent : '';
    if (btn) { btn.textContent = '⏳ Extracting...'; btn.style.pointerEvents = 'none'; btn.style.opacity = '0.6'; }

    try {
        const ctx = getContext();
        const recent = (ctx.chat || []).slice(-10);
        if (recent.length === 0) {
            alert('No chat messages yet.');
            return;
        }

        const existingNpcs = data.npcs.map(n => n.name).join(', ') || 'none';
        const existingLocs = data.locations.map(l => l.name).join(', ') || 'none';

        const chatText = recent.map(m => {
            const speaker = m.is_user ? 'USER' : (m.name || 'CHAR');
            const text = (m.mes || '').replace(/\n+/g, ' ').slice(0, 800);
            return `[${speaker}]: ${text}`;
        }).join('\n\n');

        const prompt = `You are analyzing a roleplay excerpt to extract world data. Return ONLY valid minified JSON, nothing else - no preamble, no code fence, no explanation.

Task: Extract NPCs (named characters other than the user) and locations mentioned in the text below. Skip anyone already tracked.

Already tracked NPCs: ${existingNpcs}
Already tracked locations: ${existingLocs}

Output format (STRICT):
{"npcs":[{"name":"Name","relationship":"ally"}],"locations":[{"name":"Place name"}]}

Valid relationships: romance, ally, friend, rival, enemy, neutral
- romance: lovers, crushes, spouses
- ally: trusted companions, teammates
- friend: close friends
- rival: competitors, frenemies
- enemy: hostile, antagonists
- neutral: unclear or minor characters

Rules:
- Only include characters with proper names (no "the man", "a soldier")
- Only real locations (no abstract concepts)
- Skip the user character
- Keep names short (max 30 chars)
- Names can be in any language (Thai, English, Chinese, etc.)
- If nothing new to add, return {"npcs":[],"locations":[]}

Text to analyze:
${chatText}

JSON:`;

        log('Sending extract prompt (' + prompt.length + ' chars)...');
        const response = await generateQuietPrompt(prompt, false, false);
        log('Got response (' + (response || '').length + ' chars)');

        // Extract JSON from response
        const cleaned = String(response || '').replace(/```json\s*|\s*```/g, '').trim();
        const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
        if (!jsonMatch) throw new Error('No JSON found in LLM response');

        let parsed;
        try { parsed = JSON.parse(jsonMatch[0]); }
        catch (e) {
            log('JSON parse failed, raw: ' + jsonMatch[0].slice(0, 200), true);
            throw new Error('Could not parse LLM response as JSON');
        }

        let addedNpcs = 0, addedLocs = 0, skipped = 0;
        for (const npc of (parsed.npcs || [])) {
            if (!npc?.name || typeof npc.name !== 'string') { skipped++; continue; }
            const name = npc.name.trim().slice(0, 40);
            if (!name) { skipped++; continue; }
            if (data.npcs.find(n => n.name.toLowerCase() === name.toLowerCase())) { skipped++; continue; }
            const rel = VALID_RELATIONSHIPS.includes(npc.relationship) ? npc.relationship : 'neutral';
            data.npcs.push({ name, relationship: rel, bondLevel: 0, mentions: 0 });
            addedNpcs++;
        }
        for (const loc of (parsed.locations || [])) {
            if (!loc?.name || typeof loc.name !== 'string') { skipped++; continue; }
            const name = loc.name.trim().slice(0, 40);
            if (!name) { skipped++; continue; }
            if (data.locations.find(l => l.name.toLowerCase() === name.toLowerCase())) { skipped++; continue; }
            data.locations.push({ name, x: 20 + Math.random() * 60, y: 20 + Math.random() * 60 });
            addedLocs++;
        }

        save();
        refreshPanel();
        log(`Extract: +${addedNpcs} NPCs, +${addedLocs} locations`);
        alert(`✿ Added ${addedNpcs} NPC${addedNpcs !== 1 ? 's' : ''} and ${addedLocs} location${addedLocs !== 1 ? 's' : ''}${skipped > 0 ? ` (${skipped} skipped/duplicate)` : ''}`);
    } catch (e) {
        log('Auto-extract failed: ' + e.message, true);
        alert('Extract failed: ' + e.message);
    } finally {
        if (btn) { btn.textContent = origText; btn.style.pointerEvents = ''; btn.style.opacity = ''; }
    }
}

// ============================================
// Shadow DOM mount
// ============================================
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
    log('Shadow host mounted');
    return shadowRoot;
}

const SHADOW_CSS = `
:host { all: initial; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Noto Sans Thai', sans-serif; }
* { box-sizing: border-box; }

.floater {
    position: fixed;
    right: 16px;
    top: 80px;
    width: 60px;
    height: 60px;
    border-radius: 50%;
    background: linear-gradient(135deg, #FFF0F5 0%, #FBEAF0 50%, #F4C0D1 100%);
    border: 3px solid #fff;
    box-shadow: 0 8px 24px rgba(212, 83, 126, 0.5), 0 3px 8px rgba(75, 21, 40, 0.2);
    cursor: pointer;
    pointer-events: auto;
    display: flex;
    align-items: center;
    justify-content: center;
    animation: ham-entry 0.6s ease-out, ham-idle 3s ease-in-out 0.6s infinite;
    user-select: none;
    -webkit-user-select: none;
    -webkit-tap-highlight-color: transparent;
}
.floater.hidden { display: none; }
.floater.pressed { transform: scale(0.92); transition: transform 0.1s; }

@keyframes ham-entry {
    0% { opacity: 0; transform: scale(0) rotate(-180deg); }
    60% { transform: scale(1.2) rotate(10deg); }
    100% { opacity: 1; transform: scale(1) rotate(0); }
}
@keyframes ham-idle {
    0%, 100% { transform: translateY(0); }
    50% { transform: translateY(-4px); }
}

.panel {
    position: fixed;
    pointer-events: auto;
    background: #fff;
    border-radius: 20px;
    box-shadow: 0 20px 60px rgba(75, 21, 40, 0.4), 0 0 0 1px rgba(212, 83, 126, 0.15);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    color: #3d2030;
    animation: ham-slide 0.25s ease-out;
    top: 5vh;
    left: 50%;
    transform: translateX(-50%);
    width: min(94vw, 480px);
    max-height: 88vh;
}
.panel.hidden { display: none; }
@keyframes ham-slide {
    from { opacity: 0; transform: translateX(-50%) translateY(-20px) scale(0.95); }
    to { opacity: 1; transform: translateX(-50%) translateY(0) scale(1); }
}

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

.extract-btn { width: 100%; padding: 12px; margin: 10px 0 14px; background: linear-gradient(135deg, #D4537E 0%, #993556 100%); color: #fff; border: none; border-radius: 12px; font-size: 13px; font-weight: 600; cursor: pointer; box-shadow: 0 4px 12px rgba(212, 83, 126, 0.3); -webkit-tap-highlight-color: transparent; display: flex; align-items: center; justify-content: center; gap: 6px; }
.extract-btn:active { transform: scale(0.98); }
.extract-hint { font-size: 10.5px; color: #8b6676; text-align: center; margin-top: -8px; margin-bottom: 12px; }

.section { margin-top: 14px; }
.section-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
.section-title { font-size: 12px; font-weight: 600; color: #4B1528; }
.add-btn { font-size: 11px; padding: 5px 12px; background: #D4537E; color: #fff; border: none; border-radius: 7px; cursor: pointer; font-weight: 500; -webkit-tap-highlight-color: transparent; }
.add-btn:active { background: #993556; transform: scale(0.96); }

.list { display: flex; flex-direction: column; gap: 5px; }
.list-item { display: flex; justify-content: space-between; align-items: center; padding: 9px 11px; background: #fff9fb; border-radius: 8px; border: 1px solid rgba(212, 83, 126, 0.08); gap: 8px; }
.list-name { font-size: 12px; color: #4B1528; flex: 1; display: flex; align-items: center; gap: 6px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.npc-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
.list-name small { color: #8b6676; font-size: 10px; }
.del-btn { width: 26px; height: 26px; border-radius: 6px; border: none; background: transparent; color: #8b6676; cursor: pointer; font-size: 13px; flex-shrink: 0; -webkit-tap-highlight-color: transparent; }
.del-btn:active { background: #FCEBEB; color: #E24B4A; }

.map-wrap { position: relative; width: 100%; aspect-ratio: 5/3; background: #FBEAF0; border-radius: 12px; overflow: hidden; border: 1px solid rgba(212, 83, 126, 0.15); }
.map-wrap svg { width: 100%; height: 100%; display: block; }
.pin { position: absolute; width: 14px; height: 14px; border-radius: 50%; border: 2px solid #fff; box-shadow: 0 2px 4px rgba(0,0,0,0.2); transform: translate(-50%, -50%); }

.const-wrap { background: #FBEAF0; border-radius: 12px; border: 1px solid rgba(212, 83, 126, 0.15); overflow: hidden; }
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

.footer { display: flex; justify-content: space-between; padding: 10px 14px; background: #fff9fb; border-top: 1px solid rgba(212, 83, 126, 0.1); gap: 6px; flex-shrink: 0; }
.foot-btns { display: flex; gap: 4px; }
.foot-btn { font-size: 11px; padding: 6px 11px; background: #fff; border: 1px solid rgba(212, 83, 126, 0.2); border-radius: 6px; cursor: pointer; color: #993556; -webkit-tap-highlight-color: transparent; }
.foot-btn.danger { color: #E24B4A; border-color: rgba(226, 75, 74, 0.3); }
.foot-btn:active { transform: scale(0.95); }
`;

function mountUI() {
    try {
        buildShadowHost();
        shadowRoot.innerHTML = `
<style>${SHADOW_CSS}</style>
<div id="floater" class="floater" title="HAMHAM">${HAMSTER_SVG}</div>
<div id="panel" class="panel hidden">
    <div class="header">
        <div class="brand">
            <div class="brand-logo">${HAMSTER_SVG}</div>
            <div>
                <div class="brand-name">HAMHAM</div>
                <div class="brand-sub">World memory</div>
            </div>
        </div>
        <div style="display:flex;align-items:center;gap:6px">
            <div class="char-pill"><span class="char-dot"></span><span id="char-name">—</span></div>
            <button class="close-btn" id="btn-close">✕</button>
        </div>
    </div>
    <div class="stats" id="stats"></div>
    <div class="tabs">
        <button class="tab active" data-tab="atlas">Atlas</button>
        <button class="tab" data-tab="constellation">Bonds</button>
        <button class="tab" data-tab="memory">Memories</button>
        <button class="tab" data-tab="atmosphere">Mood</button>
    </div>
    <div class="content" id="content"></div>
    <div class="footer">
        <div class="foot-btns">
            <button class="foot-btn" data-action="export">Export</button>
            <button class="foot-btn" data-action="refresh">Refresh</button>
        </div>
        <button class="foot-btn danger" data-action="reset">Reset char</button>
    </div>
</div>`;

        const floater = shadowRoot.getElementById('floater');
        const panel = shadowRoot.getElementById('panel');

        let pDown = false, pStartX = 0, pStartY = 0, pMoved = false;

        floater.addEventListener('pointerdown', (e) => {
            pDown = true;
            pStartX = e.clientX;
            pStartY = e.clientY;
            pMoved = false;
            floater.classList.add('pressed');
            try { floater.setPointerCapture(e.pointerId); } catch {}
        });

        floater.addEventListener('pointermove', (e) => {
            if (!pDown) return;
            const dx = e.clientX - pStartX;
            const dy = e.clientY - pStartY;
            if (Math.abs(dx) > 6 || Math.abs(dy) > 6) pMoved = true;
            if (pMoved) {
                const r = floater.getBoundingClientRect();
                const newRight = Math.max(8, Math.min(window.innerWidth - 68, window.innerWidth - r.right - dx));
                const newTop = Math.max(8, Math.min(window.innerHeight - 68, r.top + dy));
                floater.style.right = newRight + 'px';
                floater.style.top = newTop + 'px';
                floater.style.bottom = 'auto';
                pStartX = e.clientX;
                pStartY = e.clientY;
            }
        });

        floater.addEventListener('pointerup', (e) => {
            floater.classList.remove('pressed');
            if (!pDown) return;
            pDown = false;
            if (pMoved) {
                const r = floater.getBoundingClientRect();
                getSettings().iconPos = {
                    right: Math.round(window.innerWidth - r.right),
                    top: Math.round(r.top)
                };
                save();
            } else {
                log('Icon tapped');
                togglePanel();
            }
        });

        floater.addEventListener('pointercancel', () => {
            pDown = false; pMoved = false;
            floater.classList.remove('pressed');
        });

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
            const action = el.dataset.action;
            if (action === 'auto-extract') autoExtract();
            else if (action === 'add-loc') promptAddLocation();
            else if (action === 'add-npc') promptAddNpc();
            else if (action === 'add-memory') promptAddMemory();
            else if (action === 'del-loc') delItem('locations', +el.dataset.idx);
            else if (action === 'del-npc') delItem('npcs', +el.dataset.idx);
            else if (action === 'del-memory') delItem('memories', +el.dataset.idx);
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
    } catch (e) {
        log('mountUI failed: ' + e.message, true);
    }
}

function setFloaterVisible(visible) {
    if (!shadowRoot) return;
    const el = shadowRoot.getElementById('floater');
    if (!el) return;
    if (visible) el.classList.remove('hidden');
    else el.classList.add('hidden');
}

function openPanel() {
    if (!shadowRoot) return;
    shadowRoot.getElementById('panel').classList.remove('hidden');
    getSettings().panelVisible = true;
    save();
    refreshPanel();
    log('Panel opened');
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
    if (p.classList.contains('hidden')) openPanel();
    else closePanel();
}

// ============================================
// Render
// ============================================
function refreshPanel() {
    if (!shadowRoot) return;
    const p = shadowRoot.getElementById('panel');
    if (p.classList.contains('hidden')) return;
    const data = getCharData();
    shadowRoot.getElementById('char-name').textContent = getCurrentCharacterName();

    const stats = data ? {
        loc: data.locations.length, npcs: data.npcs.length,
        mem: data.memories.length, bonds: data.npcs.filter(n => (n.bondLevel || 0) > 0).length
    } : { loc: 0, npcs: 0, mem: 0, bonds: 0 };
    shadowRoot.getElementById('stats').innerHTML = `
        <div class="stat"><div class="stat-label">LOC</div><div class="stat-value">${stats.loc}</div></div>
        <div class="stat"><div class="stat-label">NPCS</div><div class="stat-value">${stats.npcs}</div></div>
        <div class="stat"><div class="stat-label">MEM</div><div class="stat-value">${stats.mem}</div></div>
        <div class="stat"><div class="stat-label">BONDS</div><div class="stat-value">${stats.bonds}</div></div>
    `;

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

function renderAtlas(c, data) {
    const pins = data.npcs.filter(n => n.location).map(n => {
        const loc = data.locations.find(l => l.name === n.location);
        if (!loc) return '';
        const r = RELATIONSHIP_TYPES[n.relationship] || RELATIONSHIP_TYPES.neutral;
        return `<div class="pin" style="left:${loc.x}%;top:${loc.y}%;background:${r.color}" title="${escapeHtml(n.name)}"></div>`;
    }).join('');

    const locList = data.locations.length
        ? data.locations.map((l, i) => `<div class="list-item"><span class="list-name">📍 ${escapeHtml(l.name)}</span><button class="del-btn" data-action="del-loc" data-idx="${i}">✕</button></div>`).join('')
        : '<div class="empty" style="padding:12px;font-size:11px">No locations yet</div>';

    const npcList = data.npcs.length
        ? data.npcs.map((n, i) => {
            const r = RELATIONSHIP_TYPES[n.relationship] || RELATIONSHIP_TYPES.neutral;
            return `<div class="list-item"><span class="list-name"><span class="npc-dot" style="background:${r.color}"></span>${escapeHtml(n.name)} <small>${r.label}</small></span><button class="del-btn" data-action="del-npc" data-idx="${i}">✕</button></div>`;
        }).join('')
        : '<div class="empty" style="padding:12px;font-size:11px">No NPCs yet</div>';

    c.innerHTML = `
        <div class="map-wrap">
            <svg viewBox="0 0 400 240">
                <defs><radialGradient id="bg1" cx="50%" cy="50%" r="70%"><stop offset="0%" stop-color="#FFF5F8"/><stop offset="100%" stop-color="#F4C0D1"/></radialGradient></defs>
                <rect x="0" y="0" width="400" height="240" fill="url(#bg1)"/>
                <ellipse cx="90" cy="170" rx="75" ry="35" fill="#E1F5EE" opacity="0.7"/>
                <text x="90" y="175" text-anchor="middle" font-size="10" fill="#0F6E56">Forest</text>
                <polygon points="200,50 240,140 160,140" fill="#D3D1C7" opacity="0.6"/>
                <text x="200" y="155" text-anchor="middle" font-size="10" fill="#444441">Peak</text>
                <ellipse cx="320" cy="90" rx="60" ry="30" fill="#E6F1FB" opacity="0.75"/>
                <text x="320" y="95" text-anchor="middle" font-size="10" fill="#0C447C">Lake</text>
                <ellipse cx="280" cy="200" rx="55" ry="22" fill="#FAEEDA" opacity="0.7"/>
                <text x="280" y="205" text-anchor="middle" font-size="10" fill="#633806">Meadow</text>
            </svg>
            ${pins}
        </div>
        <button class="extract-btn" data-action="auto-extract">🪄 Auto-extract from last 10 messages</button>
        <div class="extract-hint">Uses your current AI to find NPCs & locations from chat</div>
        <div class="section">
            <div class="section-head"><span class="section-title">Locations</span><button class="add-btn" data-action="add-loc">+ Add</button></div>
            <div class="list">${locList}</div>
        </div>
        <div class="section">
            <div class="section-head"><span class="section-title">NPCs</span><button class="add-btn" data-action="add-npc">+ Add</button></div>
            <div class="list">${npcList}</div>
        </div>
    `;
}

function renderConstellation(c, data) {
    const user = getUserName();
    const cx = 200, cy = 160;
    const npcs = data.npcs.slice(0, 12);
    const nodes = npcs.map((n, i) => {
        const angle = (i / Math.max(npcs.length, 1)) * Math.PI * 2 - Math.PI / 2;
        const dist = 80 + (3 - Math.min(3, n.bondLevel || 0)) * 25;
        const x = cx + Math.cos(angle) * dist;
        const y = cy + Math.sin(angle) * dist;
        const r = RELATIONSHIP_TYPES[n.relationship] || RELATIONSHIP_TYPES.neutral;
        const sw = 1 + (n.bondLevel || 0);
        return `<line x1="${cx}" y1="${cy}" x2="${x}" y2="${y}" stroke="${r.color}" stroke-width="${sw}" opacity="0.7"/>
                <circle cx="${x}" cy="${y}" r="14" fill="${r.bg}" stroke="${r.color}" stroke-width="1.5"/>
                <text x="${x}" y="${y + 4}" text-anchor="middle" font-size="11" fill="${r.color}" font-weight="500">${escapeHtml((n.name || '?').charAt(0))}</text>
                <text x="${x}" y="${y + 28}" text-anchor="middle" font-size="9" fill="#72243E">${escapeHtml((n.name || '').slice(0, 8))}</text>`;
    }).join('');

    c.innerHTML = `
        <div class="const-wrap">
            <svg viewBox="0 0 400 320">
                <defs><radialGradient id="bg2" cx="50%" cy="50%" r="60%"><stop offset="0%" stop-color="#FFF5F8"/><stop offset="100%" stop-color="#FBEAF0"/></radialGradient></defs>
                <rect x="0" y="0" width="400" height="320" fill="url(#bg2)"/>
                ${nodes}
                <circle cx="${cx}" cy="${cy}" r="22" fill="#D4537E" stroke="white" stroke-width="3"/>
                <text x="${cx}" y="${cy + 5}" text-anchor="middle" font-size="13" fill="white" font-weight="600">${escapeHtml(user.charAt(0).toUpperCase())}</text>
                <text x="${cx}" y="${cy + 40}" text-anchor="middle" font-size="11" fill="#4B1528" font-weight="600">${escapeHtml(user)}</text>
            </svg>
            <div class="legend">
                ${Object.entries(RELATIONSHIP_TYPES).map(([k, r]) => `<span><span class="legend-dot" style="background:${r.color}"></span>${r.label}</span>`).join('')}
            </div>
        </div>
        ${data.npcs.length === 0 ? '<div class="empty" style="margin-top:10px;padding:14px">Add NPCs in Atlas tab to see bonds</div>' : ''}
    `;
}

function renderMemory(c, data) {
    if (!data.memories.length) {
        c.innerHTML = `<div class="empty"><b>No memories yet</b>Save important moments from your roleplay</div><button class="add-btn" data-action="add-memory" style="margin-top:10px;width:100%;padding:10px">+ Add memory</button>`;
        return;
    }
    const cards = data.memories.map((m, i) => `
        <div class="mem-card emo-${m.emotion || 'journey'}">
            <div class="mem-banner">${escapeHtml(m.chapter || 'Moment')}</div>
            <div class="mem-body">
                <div class="mem-title">${escapeHtml(m.title || '')}</div>
                <div class="mem-quote">${escapeHtml(m.quote || '')}</div>
            </div>
            <button class="mem-del" data-action="del-memory" data-idx="${i}">✕</button>
        </div>
    `).join('');
    c.innerHTML = `<div class="mem-grid">${cards}</div><button class="add-btn" data-action="add-memory" style="margin-top:10px;width:100%;padding:8px">+ Add memory</button>`;
}

function renderAtmosphere(c) {
    const s = getSettings();
    const effects = [
        { id: 'none',      name: 'None',        desc: 'Off' },
        { id: 'petals',    name: '🌸 Sakura',   desc: 'Soft pink petals' },
        { id: 'lanterns',  name: '🏮 Lanterns', desc: 'Chinese ancient' },
        { id: 'rain',      name: '🌧️ Rain',    desc: 'Light shower' },
        { id: 'snow',      name: '❄️ Snow',    desc: 'Gentle snowfall' },
        { id: 'fireflies', name: '✨ Fireflies', desc: 'Warm glow' },
        { id: 'stars',     name: '⭐ Stars',    desc: 'Twinkling' },
        { id: 'dust',      name: 'Dust',        desc: 'Warm motes' }
    ];
    c.innerHTML = `
        <div class="atmos-grid">
            ${effects.map(e => `<div class="atmos-card ${s.atmosphere.effect === e.id ? 'active' : ''}" data-action="set-atmos" data-effect="${e.id}"><div class="atmos-name">${e.name}</div><div class="atmos-desc">${e.desc}</div></div>`).join('')}
        </div>
        <div class="intensity-row">
            <label>Intensity</label>
            <div class="seg">
                ${['subtle', 'medium', 'dramatic'].map(v => `<button class="seg-btn ${s.atmosphere.intensity === v ? 'active' : ''}" data-action="set-intensity" data-intensity="${v}">${v}</button>`).join('')}
            </div>
        </div>
    `;
}

// ============================================
// Atmosphere canvas
// ============================================
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
    const count = intensity === 'subtle' ? 15 : intensity === 'dramatic' ? 50 : 28;
    atmosParticles = [];
    for (let i = 0; i < count; i++) atmosParticles.push(newParticle(effect));
    function loop() {
        atmosCtx.clearRect(0, 0, atmosCanvas.width, atmosCanvas.height);
        for (const p of atmosParticles) {
            updateParticle(p, effect);
            drawParticle(p, effect);
            const margin = 40;
            if (p.y > atmosCanvas.height + margin || p.y < -margin || p.x < -margin || p.x > atmosCanvas.width + margin) {
                Object.assign(p, newParticle(effect));
            }
        }
        atmosRAF = requestAnimationFrame(loop);
    }
    loop();
    log('Atmosphere: ' + effect + ' (' + intensity + ')');
}

function newParticle(effect) {
    const w = window.innerWidth, h = window.innerHeight;
    const p = {
        x: Math.random() * w,
        y: Math.random() * h - h,
        vx: 0, vy: 0,
        size: 3,
        rot: Math.random() * Math.PI * 2,
        vr: (Math.random() - 0.5) * 0.015,
        opacity: 0.5 + Math.random() * 0.3,
        hue: Math.random(),
        sway: Math.random() * Math.PI * 2,
        swaySpeed: 0.01 + Math.random() * 0.015,
        type: 0
    };

    if (effect === 'petals') {
        p.vy = 0.35 + Math.random() * 0.55;
        p.vx = (Math.random() - 0.5) * 0.4;
        p.size = 7 + Math.random() * 6;
        p.opacity = 0.35 + Math.random() * 0.35;
        p.vr = (Math.random() - 0.5) * 0.02;
    }
    else if (effect === 'lanterns') {
        // 30% lanterns (up), 60% plum petals (down), 10% gold sparkles
        const r = Math.random();
        if (r < 0.3) {
            // Lantern floating up
            p.type = 1;
            p.vx = (Math.random() - 0.5) * 0.15;
            p.vy = -0.25 - Math.random() * 0.25;
            p.size = 11 + Math.random() * 7;
            p.y = h + 30;
            p.opacity = 0.75 + Math.random() * 0.25;
            p.sway = Math.random() * Math.PI * 2;
            p.swaySpeed = 0.008 + Math.random() * 0.012;
        } else if (r < 0.9) {
            // Plum petal falling
            p.type = 2;
            p.vx = (Math.random() - 0.5) * 0.5;
            p.vy = 0.4 + Math.random() * 0.5;
            p.size = 5 + Math.random() * 4;
            p.opacity = 0.4 + Math.random() * 0.35;
            p.vr = (Math.random() - 0.5) * 0.025;
        } else {
            // Gold sparkle
            p.type = 3;
            p.vx = (Math.random() - 0.5) * 0.3;
            p.vy = 0.1 + Math.random() * 0.3;
            p.size = 1.2 + Math.random() * 1.3;
            p.y = Math.random() * h;
        }
    }
    else if (effect === 'rain') { p.vx = -1; p.vy = 7 + Math.random() * 4; p.size = 1; }
    else if (effect === 'snow') { p.vx = (Math.random() - 0.5) * 0.5; p.vy = 0.8 + Math.random() * 0.6; p.size = 2 + Math.random() * 2; }
    else if (effect === 'fireflies') { p.vx = (Math.random() - 0.5) * 0.3; p.vy = (Math.random() - 0.5) * 0.3; p.size = 3; p.y = Math.random() * h; }
    else if (effect === 'stars') { p.vy = 0.2; p.size = 1 + Math.random() * 1.5; p.y = Math.random() * h; }
    else if (effect === 'dust') { p.vx = (Math.random() - 0.5) * 0.3; p.vy = -0.2 + Math.random() * 0.4; p.size = 1.5 + Math.random(); p.y = Math.random() * h; }
    return p;
}

function updateParticle(p, effect) {
    p.rot += p.vr;
    p.sway += p.swaySpeed;

    if (effect === 'petals') {
        // Swaying horizontal motion for realistic drift
        p.x += p.vx + Math.sin(p.sway) * 0.4;
        p.y += p.vy;
    } else if (effect === 'lanterns') {
        if (p.type === 1) {
            // Lantern — slow upward drift with gentle sway
            p.x += p.vx + Math.sin(p.sway) * 0.3;
            p.y += p.vy;
            p.opacity = 0.7 + Math.sin(Date.now() / 800 + p.hue * 5) * 0.15;
        } else if (p.type === 2) {
            // Plum petal — soft swaying fall
            p.x += p.vx + Math.sin(p.sway) * 0.5;
            p.y += p.vy;
        } else {
            // Sparkle — twinkle
            p.x += p.vx;
            p.y += p.vy;
            p.opacity = 0.3 + Math.abs(Math.sin(Date.now() / 500 + p.hue * 8)) * 0.65;
        }
    } else {
        p.x += p.vx;
        p.y += p.vy;
        if (effect === 'fireflies') p.opacity = 0.4 + Math.abs(Math.sin(Date.now() / 700 + p.hue * 10)) * 0.5;
        if (effect === 'stars') p.opacity = 0.3 + Math.abs(Math.sin(Date.now() / 900 + p.hue * 6)) * 0.6;
    }
}

// Draw a 5-petal sakura flower with soft glow
function drawSakura(c, p) {
    c.save();
    c.translate(p.x, p.y);
    c.rotate(p.rot);

    const palette = [
        ['#FFE5EE', '#FFC2D4'],
        ['#FFD1E0', '#FFAAC6'],
        ['#FBEAF0', '#F4C0D1'],
        ['#FFDCE8', '#F7B5CC']
    ];
    const [light, deep] = palette[Math.floor(p.hue * palette.length)];

    // Soft outer glow
    c.shadowColor = light;
    c.shadowBlur = p.size * 0.8;

    // 5 petals (teardrop ellipses pointing outward)
    c.fillStyle = light;
    c.globalAlpha = p.opacity;
    for (let i = 0; i < 5; i++) {
        c.save();
        c.rotate((i * 2 * Math.PI) / 5);
        c.beginPath();
        c.ellipse(0, -p.size * 0.55, p.size * 0.36, p.size * 0.62, 0, 0, Math.PI * 2);
        c.fill();
        c.restore();
    }

    // Inner darker petal layer for depth
    c.shadowBlur = 0;
    c.fillStyle = deep;
    c.globalAlpha = p.opacity * 0.7;
    for (let i = 0; i < 5; i++) {
        c.save();
        c.rotate((i * 2 * Math.PI) / 5);
        c.beginPath();
        c.ellipse(0, -p.size * 0.4, p.size * 0.18, p.size * 0.32, 0, 0, Math.PI * 2);
        c.fill();
        c.restore();
    }

    // Gold center
    c.fillStyle = '#FFD166';
    c.globalAlpha = p.opacity * 0.85;
    c.beginPath();
    c.arc(0, 0, p.size * 0.13, 0, Math.PI * 2);
    c.fill();

    c.restore();
}

// Draw a plum blossom (梅花) — smaller, 5 round petals, deeper red
function drawPlum(c, p) {
    c.save();
    c.translate(p.x, p.y);
    c.rotate(p.rot);

    const palette = [
        ['#FFD1DC', '#D9527A'],
        ['#FFC0CB', '#C43358'],
        ['#FFB6C1', '#B52B4E']
    ];
    const [light, deep] = palette[Math.floor(p.hue * palette.length)];

    c.shadowColor = deep;
    c.shadowBlur = p.size * 0.6;

    // 5 round petals
    c.fillStyle = light;
    c.globalAlpha = p.opacity;
    for (let i = 0; i < 5; i++) {
        c.save();
        c.rotate((i * 2 * Math.PI) / 5);
        c.beginPath();
        c.arc(0, -p.size * 0.55, p.size * 0.45, 0, Math.PI * 2);
        c.fill();
        c.restore();
    }

    // Red center accent
    c.shadowBlur = 0;
    c.fillStyle = deep;
    c.globalAlpha = p.opacity * 0.9;
    c.beginPath();
    c.arc(0, 0, p.size * 0.22, 0, Math.PI * 2);
    c.fill();

    // Gold stamen dots
    c.fillStyle = '#FFD700';
    c.globalAlpha = p.opacity;
    for (let i = 0; i < 5; i++) {
        c.save();
        c.rotate((i * 2 * Math.PI) / 5);
        c.beginPath();
        c.arc(0, -p.size * 0.28, p.size * 0.06, 0, Math.PI * 2);
        c.fill();
        c.restore();
    }

    c.restore();
}

// Draw a Chinese paper lantern (灯笼) with warm red glow
function drawLantern(c, p) {
    c.save();
    c.translate(p.x, p.y);

    const w = p.size * 1.1;
    const h = p.size * 1.4;

    // Outer warm glow
    c.shadowColor = '#FF9933';
    c.shadowBlur = p.size * 2;
    c.globalAlpha = p.opacity * 0.5;
    c.fillStyle = '#FFB347';
    c.beginPath();
    c.arc(0, 0, p.size * 0.8, 0, Math.PI * 2);
    c.fill();

    c.shadowBlur = 0;
    c.globalAlpha = p.opacity;

    // Lantern body — deep red ellipse with radial inner glow suggested
    const grad = c.createRadialGradient(0, -h * 0.15, 0, 0, 0, w * 0.6);
    grad.addColorStop(0, '#FFCC66');
    grad.addColorStop(0.35, '#E64545');
    grad.addColorStop(1, '#A01820');
    c.fillStyle = grad;
    c.beginPath();
    c.ellipse(0, 0, w * 0.5, h * 0.5, 0, 0, Math.PI * 2);
    c.fill();

    // Gold rim top and bottom
    c.strokeStyle = '#FFD700';
    c.lineWidth = 1.2;
    c.beginPath();
    c.ellipse(0, -h * 0.4, w * 0.38, 2, 0, 0, Math.PI * 2);
    c.stroke();
    c.beginPath();
    c.ellipse(0, h * 0.4, w * 0.38, 2, 0, 0, Math.PI * 2);
    c.stroke();

    // Vertical rib lines (subtle)
    c.strokeStyle = 'rgba(255, 180, 90, 0.4)';
    c.lineWidth = 0.6;
    for (let i = -1; i <= 1; i++) {
        c.beginPath();
        c.moveTo(i * w * 0.18, -h * 0.35);
        c.lineTo(i * w * 0.18, h * 0.35);
        c.stroke();
    }

    // Red tassel below
    c.strokeStyle = '#C41E3A';
    c.lineWidth = 1;
    c.beginPath();
    c.moveTo(0, h * 0.5);
    c.lineTo(0, h * 0.85);
    c.stroke();
    c.fillStyle = '#FFD700';
    c.beginPath();
    c.arc(0, h * 0.85, 1.5, 0, Math.PI * 2);
    c.fill();

    // Top string
    c.strokeStyle = '#8B4513';
    c.lineWidth = 0.6;
    c.beginPath();
    c.moveTo(0, -h * 0.5);
    c.lineTo(0, -h * 0.7);
    c.stroke();

    c.restore();
}

// Draw a tiny gold sparkle
function drawSparkle(c, p) {
    c.save();
    c.translate(p.x, p.y);
    c.globalAlpha = p.opacity;
    c.fillStyle = '#FFD700';
    c.shadowColor = '#FFAA00';
    c.shadowBlur = p.size * 3;
    c.beginPath();
    c.arc(0, 0, p.size, 0, Math.PI * 2);
    c.fill();

    // Cross shine
    c.shadowBlur = 0;
    c.strokeStyle = 'rgba(255, 235, 100, ' + p.opacity + ')';
    c.lineWidth = 0.5;
    c.beginPath();
    c.moveTo(-p.size * 2.5, 0);
    c.lineTo(p.size * 2.5, 0);
    c.moveTo(0, -p.size * 2.5);
    c.lineTo(0, p.size * 2.5);
    c.stroke();
    c.restore();
}

function drawParticle(p, effect) {
    const c = atmosCtx;
    if (effect === 'petals') {
        drawSakura(c, p);
        return;
    }
    if (effect === 'lanterns') {
        if (p.type === 1) drawLantern(c, p);
        else if (p.type === 2) drawPlum(c, p);
        else drawSparkle(c, p);
        return;
    }
    c.save();
    c.globalAlpha = p.opacity;
    if (effect === 'rain') {
        c.strokeStyle = 'rgba(125,180,220,0.6)'; c.lineWidth = 1.5;
        c.beginPath(); c.moveTo(p.x, p.y); c.lineTo(p.x - 2, p.y + 10); c.stroke();
    } else if (effect === 'snow' || effect === 'stars') {
        c.fillStyle = '#ffffff'; c.beginPath(); c.arc(p.x, p.y, p.size, 0, Math.PI * 2); c.fill();
    } else if (effect === 'fireflies') {
        c.fillStyle = '#FFD166'; c.shadowColor = '#FFD166'; c.shadowBlur = 12;
        c.beginPath(); c.arc(p.x, p.y, p.size, 0, Math.PI * 2); c.fill();
    } else if (effect === 'dust') {
        c.fillStyle = '#F4C0D1'; c.beginPath(); c.arc(p.x, p.y, p.size, 0, Math.PI * 2); c.fill();
    }
    c.restore();
}

// ============================================
// Actions
// ============================================
function promptAddLocation() {
    const name = prompt('Location name:'); if (!name) return;
    const data = getCharData(); if (!data) return alert('Select a character first');
    data.locations.push({ name, x: 30 + Math.random() * 40, y: 30 + Math.random() * 40 });
    save(); refreshPanel();
}

function promptAddNpc() {
    const name = prompt('NPC name:'); if (!name) return;
    const relInput = prompt('Relationship (romance/ally/friend/rival/enemy/neutral):', 'neutral');
    const relationship = RELATIONSHIP_TYPES[relInput] ? relInput : 'neutral';
    const data = getCharData(); if (!data) return;
    data.npcs.push({ name, relationship, bondLevel: 0, mentions: 0 });
    save(); refreshPanel();
}

function promptAddMemory() {
    const title = prompt('Memory title:'); if (!title) return;
    const chapter = prompt('Chapter/time:', 'Ch 1');
    const quote = prompt('Key quote:', '');
    const emotion = prompt('Emotion (romance/battle/mystery/victory/journey):', 'journey');
    const data = getCharData(); if (!data) return;
    data.memories.push({ title, chapter, quote, emotion });
    save(); refreshPanel();
}

function delItem(listName, idx) {
    const data = getCharData(); if (!data) return;
    data[listName].splice(idx, 1);
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
    if (!getSettings().autoBond) return;
    try {
        const ctx = getContext();
        const msg = ctx.chat?.[ctx.chat.length - 1];
        if (!msg || msg.is_user) return;
        const data = getCharData();
        if (!data) return;
        const text = (msg.mes || '').toLowerCase();
        for (const npc of data.npcs) {
            if (text.includes((npc.name || '').toLowerCase())) {
                npc.mentions = (npc.mentions || 0) + 1;
                if (npc.mentions % 3 === 0) npc.bondLevel = Math.min(5, (npc.bondLevel || 0) + 1);
            }
        }
        save(); refreshPanel();
    } catch (e) {}
}

// ============================================
// Settings drawer
// ============================================
async function loadSettingsUI() {
    try {
        const html = await $.get(`${extensionFolderPath}/settings.html`);
        $('#extensions_settings2').append(html);
        log('Settings HTML appended');

        $('.hamham-settings .inline-drawer-content').append(`
            <div class="hamham-row" style="flex-direction:column;align-items:stretch;margin-top:12px;padding-top:12px;border-top:1px solid rgba(212,83,126,0.15)">
                <button id="hamham-find-btn" class="menu_button" style="margin-bottom:8px">🔍 Find the icon (flash red)</button>
                <label style="font-size:11px;opacity:0.7;margin-bottom:4px">Status log</label>
                <pre id="hamham-debug-log" style="font-size:10px;background:rgba(251,234,240,0.4);padding:8px;border-radius:6px;margin:0;white-space:pre-wrap;word-wrap:break-word;color:#4B1528;max-height:200px;overflow-y:auto;font-family:ui-monospace,monospace"></pre>
            </div>
        `);

        const s = getSettings();
        $('#hamham-toggle-icon').prop('checked', s.iconVisible);
        $('#hamham-toggle-autobond').prop('checked', s.autoBond);
        $('#hamham-debug-log').text(debugLog.slice(-12).join('\n'));
        log('Settings UI ready');
    } catch (e) { log('loadSettingsUI err: ' + e.message, true); }
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
        .on('click.hamham', '#hamham-open-panel-btn', () => { openPanel(); })
        .on('click.hamham', '#hamham-reset-all-btn', resetAllData)
        .on('click.hamham', '#hamham-find-btn', function () {
            if (!shadowRoot) return alert('UI not mounted!');
            const el = shadowRoot.getElementById('floater');
            if (!el) return alert('Icon missing!');
            const r = el.getBoundingClientRect();
            log(`Finder: x=${Math.round(r.left)} y=${Math.round(r.top)}`);
            el.style.background = 'red';
            el.style.transform = 'scale(2)';
            setTimeout(() => { el.style.background = ''; el.style.transform = ''; }, 3000);
        });
    log('Delegation attached');
}

jQuery(async () => {
    log(`HAMHAM ${VERSION} init...`);
    try {
        getSettings();
        attachDelegation();
        await loadSettingsUI();
        mountUI();

        if (eventSource && event_types) {
            try {
                if (event_types.CHAT_CHANGED) eventSource.on(event_types.CHAT_CHANGED, onChatChanged);
                if (event_types.MESSAGE_RECEIVED) eventSource.on(event_types.MESSAGE_RECEIVED, onMessageReceived);
                log('Chat events bound');
            } catch (e) { log('Event bind: ' + e.message, true); }
        }

        restartAtmosphere();
        log('Ready! ✿');
    } catch (e) { log('Init FAILED: ' + e.message, true); }
});
