/* ============================================
   HAMHAM v1.0.2 — Diagnostic
   Nuclear inline styles · impossible to miss
   ============================================ */

import { extension_settings, getContext } from "../../../extensions.js";
import { saveSettingsDebounced, eventSource, event_types } from "../../../../script.js";

const extensionName = "Hamham";
const extensionFolderPath = `scripts/extensions/third-party/${extensionName}`;
const VERSION = "1.0.2-diag";

const DEFAULT_SETTINGS = {
    iconVisible: true,
    autoBond: true,
    panelVisible: false,
    currentTab: 'atlas',
    iconPos: null,
    atmosphere: { effect: 'none', intensity: 'medium' },
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

const HAMSTER_SVG = `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:100%;display:block">
<circle cx="7" cy="7" r="2.5" fill="#ED93B1"/>
<circle cx="17" cy="7" r="2.5" fill="#ED93B1"/>
<circle cx="12" cy="12.5" r="7" fill="#F4C0D1"/>
<circle cx="7.8" cy="13.5" r="1.8" fill="#ED93B1" opacity="0.7"/>
<circle cx="16.2" cy="13.5" r="1.8" fill="#ED93B1" opacity="0.7"/>
<circle cx="9.5" cy="11.5" r="0.9" fill="#4B1528"/>
<circle cx="14.5" cy="11.5" r="0.9" fill="#4B1528"/>
<ellipse cx="12" cy="14.5" rx="0.7" ry="0.5" fill="#4B1528"/>
</svg>`;

// ============================================
// Debug logging
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
// Settings helpers
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
        if (!s.atmosphere) s.atmosphere = { effect: 'none', intensity: 'medium' };
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
// FLOATING ICON — Shadow DOM + inline styles (nuclear)
// ============================================
let shadowHost = null;
let shadowRoot = null;

function buildShadowHost() {
    // Remove existing if any
    const existing = document.getElementById('hamham-shadow-host');
    if (existing) existing.remove();

    // Create host element with MAX z-index and position:fixed
    shadowHost = document.createElement('div');
    shadowHost.id = 'hamham-shadow-host';
    shadowHost.setAttribute('style', `
        position: fixed !important;
        top: 0 !important;
        left: 0 !important;
        width: 0 !important;
        height: 0 !important;
        z-index: 2147483647 !important;
        pointer-events: none !important;
        margin: 0 !important;
        padding: 0 !important;
        border: 0 !important;
        display: block !important;
        visibility: visible !important;
        opacity: 1 !important;
    `.replace(/\s+/g, ' ').trim());

    // Append to documentElement (html) — can't be hidden by body styles
    document.documentElement.appendChild(shadowHost);

    // Create shadow root — complete CSS isolation from SillyTavern
    shadowRoot = shadowHost.attachShadow({ mode: 'open' });

    log('Shadow host attached to <html>');
    return shadowRoot;
}

const SHADOW_CSS = `
:host { all: initial; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Noto Sans Thai', sans-serif; }
* { box-sizing: border-box; }

.floater {
    position: fixed;
    right: 16px;
    top: 80px;
    width: 58px;
    height: 58px;
    border-radius: 50%;
    background: linear-gradient(135deg, #FBEAF0 0%, #F4C0D1 100%);
    border: 3px solid #fff;
    box-shadow: 0 6px 20px rgba(212, 83, 126, 0.45), 0 2px 6px rgba(75, 21, 40, 0.2);
    cursor: pointer;
    pointer-events: auto;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: transform 0.2s;
    animation: ham-pulse 2s ease-out 3;
    touch-action: none;
    user-select: none;
    -webkit-user-select: none;
}
.floater.hidden { display: none; }
.floater:active { transform: scale(0.92); }
.floater .svg-wrap { width: 38px; height: 38px; pointer-events: none; }

@keyframes ham-pulse {
    0%, 100% { transform: scale(1); box-shadow: 0 6px 20px rgba(212, 83, 126, 0.45), 0 0 0 0 rgba(237, 147, 177, 0.7); }
    50% { transform: scale(1.08); box-shadow: 0 6px 24px rgba(212, 83, 126, 0.6), 0 0 0 14px rgba(237, 147, 177, 0); }
}

.panel {
    position: fixed;
    bottom: 100px;
    right: 16px;
    width: min(92vw, 440px);
    max-height: 80vh;
    background: #fff;
    border-radius: 20px;
    box-shadow: 0 16px 48px rgba(75, 21, 40, 0.35), 0 0 0 1px rgba(212, 83, 126, 0.15);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    pointer-events: auto;
    color: #3d2030;
    animation: ham-slide 0.25s ease-out;
}
.panel.hidden { display: none; }
@keyframes ham-slide {
    from { opacity: 0; transform: translateY(16px) scale(0.96); }
    to { opacity: 1; transform: translateY(0) scale(1); }
}

.header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 14px 16px;
    background: linear-gradient(135deg, #FBEAF0, #F4C0D1);
    border-bottom: 1px solid rgba(212, 83, 126, 0.15);
}
.brand { display: flex; align-items: center; gap: 10px; }
.brand-logo { width: 32px; height: 32px; background: #fff; border-radius: 50%; display: flex; align-items: center; justify-content: center; box-shadow: 0 2px 6px rgba(212, 83, 126, 0.25); }
.brand-logo svg { width: 22px; height: 22px; }
.brand-name { font-weight: 700; font-size: 14px; color: #4B1528; line-height: 1; letter-spacing: 0.5px; }
.brand-sub { font-size: 10px; color: #993556; margin-top: 2px; }
.char-pill { display: inline-flex; align-items: center; gap: 6px; padding: 4px 10px; background: #fff; border-radius: 99px; font-size: 11px; color: #4B1528; font-weight: 500; max-width: 140px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.char-dot { width: 6px; height: 6px; border-radius: 50%; background: #1D9E75; }
.close-btn { width: 28px; height: 28px; border-radius: 50%; border: none; background: rgba(255, 255, 255, 0.5); color: #72243E; font-size: 16px; cursor: pointer; display: flex; align-items: center; justify-content: center; }
.close-btn:active { background: #fff; }

.stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; padding: 10px 16px; background: #fff9fb; }
.stat { background: #fff; padding: 8px; border-radius: 8px; border: 1px solid rgba(212, 83, 126, 0.1); text-align: center; }
.stat-label { font-size: 9px; color: #8b6676; text-transform: uppercase; letter-spacing: 0.5px; }
.stat-value { font-size: 16px; font-weight: 700; color: #4B1528; margin-top: 2px; }

.tabs { display: flex; padding: 0 16px; background: #fff9fb; border-bottom: 1px solid rgba(212, 83, 126, 0.1); overflow-x: auto; }
.tab { padding: 10px 12px; font-size: 12px; color: #8b6676; cursor: pointer; border: none; background: none; font-weight: 500; border-bottom: 2px solid transparent; margin-bottom: -1px; white-space: nowrap; }
.tab.active { color: #D4537E; border-bottom-color: #D4537E; }

.content { flex: 1; overflow-y: auto; padding: 14px 16px; }

.empty { padding: 20px; text-align: center; color: #8b6676; font-size: 12px; background: #fff9fb; border-radius: 10px; line-height: 1.6; }
.empty b { display: block; color: #D4537E; margin-bottom: 6px; font-size: 13px; }

.section { margin-top: 14px; }
.section-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
.section-title { font-size: 12px; font-weight: 600; color: #4B1528; }
.add-btn { font-size: 11px; padding: 4px 10px; background: #D4537E; color: #fff; border: none; border-radius: 7px; cursor: pointer; font-weight: 500; }
.add-btn:active { background: #993556; }

.list { display: flex; flex-direction: column; gap: 5px; }
.list-item { display: flex; justify-content: space-between; align-items: center; padding: 8px 11px; background: #fff9fb; border-radius: 8px; border: 1px solid rgba(212, 83, 126, 0.08); gap: 8px; }
.list-name { font-size: 12px; color: #4B1528; flex: 1; display: flex; align-items: center; gap: 6px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.npc-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
.list-name small { color: #8b6676; font-size: 10px; }
.del-btn { width: 24px; height: 24px; border-radius: 6px; border: none; background: transparent; color: #8b6676; cursor: pointer; font-size: 12px; flex-shrink: 0; }
.del-btn:active { background: #FCEBEB; color: #E24B4A; }

.map-wrap { position: relative; width: 100%; aspect-ratio: 5/3; background: #FBEAF0; border-radius: 12px; overflow: hidden; border: 1px solid rgba(212, 83, 126, 0.15); }
.map-wrap svg { width: 100%; height: 100%; display: block; }
.pin { position: absolute; width: 14px; height: 14px; border-radius: 50%; border: 2px solid #fff; box-shadow: 0 2px 4px rgba(0,0,0,0.2); transform: translate(-50%, -50%); }

.const-wrap { background: #FBEAF0; border-radius: 12px; padding: 0; border: 1px solid rgba(212, 83, 126, 0.15); overflow: hidden; }
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
.mem-del { position: absolute; top: 4px; right: 4px; width: 20px; height: 20px; border-radius: 50%; background: rgba(255,255,255,0.9); border: none; cursor: pointer; font-size: 10px; color: #8b6676; }

.atmos-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(100px, 1fr)); gap: 6px; }
.atmos-card { background: #fff; border: 2px solid rgba(212, 83, 126, 0.1); border-radius: 10px; padding: 12px 8px; cursor: pointer; text-align: center; }
.atmos-card.active { border-color: #D4537E; background: #FBEAF0; }
.atmos-name { font-size: 12px; font-weight: 600; color: #4B1528; }
.atmos-desc { font-size: 9px; color: #8b6676; margin-top: 2px; }

.intensity-row { margin-top: 12px; padding: 10px; background: #fff9fb; border-radius: 10px; display: flex; align-items: center; gap: 10px; }
.intensity-row label { font-size: 12px; font-weight: 500; color: #4B1528; }
.seg { display: flex; gap: 4px; flex: 1; justify-content: flex-end; }
.seg-btn { font-size: 10px; padding: 5px 10px; border: 1px solid rgba(212, 83, 126, 0.15); background: #fff; border-radius: 6px; cursor: pointer; color: #8b6676; }
.seg-btn.active { background: #D4537E; color: #fff; border-color: #D4537E; }

.footer { display: flex; justify-content: space-between; padding: 10px 16px; background: #fff9fb; border-top: 1px solid rgba(212, 83, 126, 0.1); gap: 6px; }
.foot-btns { display: flex; gap: 4px; }
.foot-btn { font-size: 11px; padding: 5px 10px; background: #fff; border: 1px solid rgba(212, 83, 126, 0.2); border-radius: 6px; cursor: pointer; color: #993556; }
.foot-btn.danger { color: #E24B4A; border-color: rgba(226, 75, 74, 0.3); }
`;

function mountUI() {
    try {
        buildShadowHost();
        shadowRoot.innerHTML = `
<style>${SHADOW_CSS}</style>
<div id="floater" class="floater" title="HAMHAM">
    <div class="svg-wrap">${HAMSTER_SVG}</div>
</div>
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
        <button class="foot-btn danger" data-action="reset">Reset this character</button>
    </div>
</div>`;

        // Wire up events INSIDE shadow root
        const $root = $(shadowRoot);
        const floater = shadowRoot.getElementById('floater');
        const panel = shadowRoot.getElementById('panel');

        // Drag support for floater
        let dragStartX, dragStartY, dragStartR, dragStartT, dragging = false, moved = false;
        floater.addEventListener('mousedown', onDragStart);
        floater.addEventListener('touchstart', onDragStart, { passive: false });
        function onDragStart(e) {
            const ev = e.touches ? e.touches[0] : e;
            dragStartX = ev.clientX;
            dragStartY = ev.clientY;
            const r = floater.getBoundingClientRect();
            dragStartR = window.innerWidth - r.right;
            dragStartT = r.top;
            dragging = true;
            moved = false;
            e.preventDefault();
        }
        document.addEventListener('mousemove', onDragMove);
        document.addEventListener('touchmove', onDragMove, { passive: false });
        function onDragMove(e) {
            if (!dragging) return;
            const ev = e.touches ? e.touches[0] : e;
            const dx = ev.clientX - dragStartX;
            const dy = ev.clientY - dragStartY;
            if (Math.abs(dx) > 5 || Math.abs(dy) > 5) moved = true;
            const nr = Math.max(8, Math.min(window.innerWidth - 64, dragStartR - dx));
            const nt = Math.max(8, Math.min(window.innerHeight - 64, dragStartT + dy));
            floater.style.right = nr + 'px';
            floater.style.top = nt + 'px';
            floater.style.bottom = 'auto';
        }
        document.addEventListener('mouseup', onDragEnd);
        document.addEventListener('touchend', onDragEnd);
        function onDragEnd() {
            if (!dragging) return;
            dragging = false;
            if (moved) {
                const r = floater.getBoundingClientRect();
                getSettings().iconPos = {
                    right: Math.round(window.innerWidth - r.right),
                    top: Math.round(r.top)
                };
                save();
            }
        }

        floater.addEventListener('click', () => {
            if (moved) { moved = false; return; }
            log('Floater clicked');
            togglePanel();
        });

        shadowRoot.getElementById('btn-close').addEventListener('click', closePanel);

        // Apply saved position
        const s = getSettings();
        if (s.iconPos) {
            if (typeof s.iconPos.right === 'number') floater.style.right = s.iconPos.right + 'px';
            if (typeof s.iconPos.top === 'number') { floater.style.top = s.iconPos.top + 'px'; floater.style.bottom = 'auto'; }
        }
        setFloaterVisible(s.iconVisible);

        // Tab clicks
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

        // Footer actions (delegated)
        shadowRoot.getElementById('panel').addEventListener('click', (e) => {
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

        // Content area click delegation
        shadowRoot.getElementById('content').addEventListener('click', (e) => {
            const el = e.target.closest('[data-action]');
            if (!el) return;
            const action = el.dataset.action;
            if (action === 'add-loc') promptAddLocation();
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

        log('Shadow DOM UI mounted');

        // Log actual position after mount for diagnostic
        setTimeout(() => {
            const r = floater.getBoundingClientRect();
            log(`Icon pos: right=${Math.round(window.innerWidth - r.right)}px top=${Math.round(r.top)}px, size=${Math.round(r.width)}x${Math.round(r.height)}`);
            log(`Viewport: ${window.innerWidth}x${window.innerHeight}`);
        }, 100);
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
    log('Icon ' + (visible ? 'shown' : 'hidden'));
}

function openPanel() {
    if (!shadowRoot) return;
    const p = shadowRoot.getElementById('panel');
    p.classList.remove('hidden');
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
    log('Panel closed');
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
        c.innerHTML = '<div class="empty"><b>No character selected</b>Open a character in SillyTavern first. HAMHAM tracks each character\'s world separately.</div>';
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
    `;
}

function renderMemory(c, data) {
    if (!data.memories.length) {
        c.innerHTML = `<div class="empty"><b>No memories yet</b>Save important scenes from your roleplay</div><button class="add-btn" data-action="add-memory" style="margin-top:10px;width:100%;padding:10px">+ Add memory</button>`;
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
        { id: 'none', name: 'None', desc: 'Off' },
        { id: 'petals', name: 'Sakura', desc: 'Pink petals' },
        { id: 'rain', name: 'Rain', desc: 'Light shower' },
        { id: 'snow', name: 'Snow', desc: 'Snowfall' },
        { id: 'fireflies', name: 'Fireflies', desc: 'Warm glow' },
        { id: 'stars', name: 'Stars', desc: 'Twinkle' },
        { id: 'dust', name: 'Dust', desc: 'Warm motes' }
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
    const count = intensity === 'subtle' ? 20 : intensity === 'dramatic' ? 80 : 40;
    atmosParticles = [];
    for (let i = 0; i < count; i++) atmosParticles.push(newParticle(effect));
    function loop() {
        atmosCtx.clearRect(0, 0, atmosCanvas.width, atmosCanvas.height);
        for (const p of atmosParticles) {
            updateParticle(p, effect);
            drawParticle(p, effect);
            if (p.y > atmosCanvas.height + 20 || p.x < -20 || p.x > atmosCanvas.width + 20) {
                Object.assign(p, newParticle(effect));
                p.y = -20;
            }
        }
        atmosRAF = requestAnimationFrame(loop);
    }
    loop();
}

function newParticle(effect) {
    const w = window.innerWidth, h = window.innerHeight;
    const p = { x: Math.random() * w, y: Math.random() * h - h, vx: 0, vy: 0, size: 3, rot: Math.random() * Math.PI * 2, vr: (Math.random() - 0.5) * 0.05, opacity: 0.5 + Math.random() * 0.3, hue: Math.random() };
    if (effect === 'petals') { p.vx = (Math.random() - 0.5) * 0.8; p.vy = 0.8 + Math.random() * 0.8; p.size = 6 + Math.random() * 5; }
    else if (effect === 'rain') { p.vx = -1; p.vy = 7 + Math.random() * 4; p.size = 1; }
    else if (effect === 'snow') { p.vx = (Math.random() - 0.5) * 0.5; p.vy = 0.8 + Math.random() * 0.6; p.size = 2 + Math.random() * 2; }
    else if (effect === 'fireflies') { p.vx = (Math.random() - 0.5) * 0.3; p.vy = (Math.random() - 0.5) * 0.3; p.size = 3; p.y = Math.random() * h; }
    else if (effect === 'stars') { p.vy = 0.2; p.size = 1 + Math.random() * 1.5; p.y = Math.random() * h; }
    else if (effect === 'dust') { p.vx = (Math.random() - 0.5) * 0.3; p.vy = -0.2 + Math.random() * 0.4; p.size = 1.5 + Math.random(); p.y = Math.random() * h; }
    return p;
}

function updateParticle(p, effect) {
    p.x += p.vx; p.y += p.vy; p.rot += p.vr;
    if (effect === 'fireflies') p.opacity = 0.4 + Math.abs(Math.sin(Date.now() / 700 + p.hue * 10)) * 0.5;
    if (effect === 'stars') p.opacity = 0.3 + Math.abs(Math.sin(Date.now() / 900 + p.hue * 6)) * 0.6;
}

function drawParticle(p, effect) {
    const c = atmosCtx;
    c.save();
    c.globalAlpha = p.opacity;
    if (effect === 'petals') {
        c.translate(p.x, p.y); c.rotate(p.rot);
        c.fillStyle = ['#F4C0D1', '#ED93B1', '#FBEAF0'][Math.floor(p.hue * 3)];
        c.beginPath(); c.ellipse(0, 0, p.size, p.size * 0.55, 0, 0, Math.PI * 2); c.fill();
    } else if (effect === 'rain') {
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
// Settings drawer (in SillyTavern Extensions panel)
// ============================================
async function loadSettingsUI() {
    try {
        const html = await $.get(`${extensionFolderPath}/settings.html`);
        $('#extensions_settings2').append(html);
        log('Settings HTML appended');

        // Add debug log + Find Icon button
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
        .on('click.hamham', '#hamham-open-panel-btn', () => { log('Open panel btn'); openPanel(); })
        .on('click.hamham', '#hamham-reset-all-btn', resetAllData)
        .on('click.hamham', '#hamham-find-btn', function () {
            if (!shadowRoot) return alert('Icon not mounted!');
            const el = shadowRoot.getElementById('floater');
            if (!el) return alert('Icon element missing!');
            const r = el.getBoundingClientRect();
            log(`Finder: Icon is at x=${Math.round(r.left)} y=${Math.round(r.top)} size=${Math.round(r.width)}x${Math.round(r.height)}`);
            // Flash it red
            const orig = el.style.cssText;
            el.style.cssText = orig + '; background: red !important; transform: scale(2) !important; z-index: 2147483647 !important;';
            setTimeout(() => { el.style.cssText = orig; }, 3000);
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
