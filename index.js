/* ============================================
   HAMHAM ✿ Living World Memory
   v1.0.1 — Hotfix: event delegation + visible errors
   ============================================ */

import { extension_settings, getContext } from "../../../extensions.js";
import { saveSettingsDebounced, eventSource, event_types } from "../../../../script.js";

const extensionName = "Hamham";
const extensionFolderPath = `scripts/extensions/third-party/${extensionName}`;
const VERSION = "1.0.1";

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

const ATMOSPHERE_EFFECTS = [
    { id: 'none',      name: 'None',          desc: 'Off' },
    { id: 'petals',    name: 'Sakura petals', desc: 'Soft falling flowers' },
    { id: 'rain',      name: 'Gentle rain',   desc: 'Light rain' },
    { id: 'snow',      name: 'Snow',          desc: 'Quiet snowfall' },
    { id: 'fireflies', name: 'Fireflies',     desc: 'Glowing sparks' },
    { id: 'stars',     name: 'Starfall',      desc: 'Twinkling stars' },
    { id: 'dust',      name: 'Dust motes',    desc: 'Warm dust' }
];

const HAMSTER_SVG = `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
<circle cx="7" cy="7" r="2.5" fill="#ED93B1"/>
<circle cx="17" cy="7" r="2.5" fill="#ED93B1"/>
<circle cx="12" cy="12.5" r="7" fill="#F4C0D1"/>
<circle cx="7.8" cy="13.5" r="1.8" fill="#ED93B1" opacity="0.7"/>
<circle cx="16.2" cy="13.5" r="1.8" fill="#ED93B1" opacity="0.7"/>
<circle cx="9.5" cy="11.5" r="0.9" fill="#4B1528"/>
<circle cx="14.5" cy="11.5" r="0.9" fill="#4B1528"/>
<ellipse cx="12" cy="14.5" rx="0.7" ry="0.5" fill="#4B1528"/>
</svg>`;

/* ============================================
   Debug log — visible in settings drawer
   ============================================ */
const debugLog = [];
function log(msg, isError = false) {
    const ts = new Date().toLocaleTimeString();
    const line = `[${ts}] ${isError ? 'ERR ' : 'OK  '}${msg}`;
    debugLog.push(line);
    if (debugLog.length > 50) debugLog.shift();
    if (isError) console.error(`[Hamham] ${msg}`);
    else console.log(`[Hamham] ${msg}`);
    const $dbg = $('#hamham-debug-log');
    if ($dbg.length) $dbg.text(debugLog.slice(-8).join('\n'));
}

/* ============================================
   Settings
   ============================================ */
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
        log('getSettings failed: ' + e.message, true);
        return JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
    }
}

function save() {
    try { saveSettingsDebounced(); } catch (e) { log('save failed: ' + e.message, true); }
}

/* ============================================
   Character context
   ============================================ */
function getCurrentCharacterKey() {
    try {
        const ctx = getContext();
        if (ctx.groupId) return 'group_' + ctx.groupId;
        if (ctx.characterId !== undefined && ctx.characterId !== null) {
            const ch = ctx.characters[ctx.characterId];
            if (ch && ch.avatar) return ch.avatar;
        }
    } catch (e) { /* silent */ }
    return null;
}

function getCurrentCharacterName() {
    try {
        const ctx = getContext();
        if (ctx.groupId) {
            const g = ctx.groups?.find(x => x.id === ctx.groupId);
            return g?.name || 'Group';
        }
        if (ctx.characterId !== undefined && ctx.characterId !== null) {
            return ctx.characters[ctx.characterId]?.name || '—';
        }
    } catch (e) { /* silent */ }
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
        s.characters[key] = {
            name: getCurrentCharacterName(),
            locations: [], npcs: [], memories: [], weather: 'clear'
        };
        save();
    }
    return s.characters[key];
}

function escapeHtml(s) {
    return String(s || '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}

/* ============================================
   Floating icon
   ============================================ */
function mountFloatingIcon() {
    try {
        if ($('#hamham-floating').length) { log('Icon already mounted'); return; }
        if (!$('body').length) { setTimeout(mountFloatingIcon, 300); return; }
        $('body').append(`<div id="hamham-floating" title="HAMHAM"><div class="hamham-floating-inner">${HAMSTER_SVG}</div><div class="hamham-pulse"></div></div>`);
        log('Floating icon mounted');

        const $icon = $('#hamham-floating');
        const s = getSettings();
        if (s.iconPos && typeof s.iconPos.right === 'number') {
            $icon.css({ right: s.iconPos.right + 'px', bottom: s.iconPos.bottom + 'px' });
        }

        let startX, startY, startR, startB, dragging = false, moved = false;
        $icon.on('mousedown touchstart', function (e) {
            const ev = e.originalEvent.touches ? e.originalEvent.touches[0] : e;
            startX = ev.clientX; startY = ev.clientY;
            const r = $icon[0].getBoundingClientRect();
            startR = window.innerWidth - r.right;
            startB = window.innerHeight - r.bottom;
            dragging = true; moved = false;
            e.preventDefault();
        });
        $(document).on('mousemove.ham touchmove.ham', function (e) {
            if (!dragging) return;
            const ev = e.originalEvent.touches ? e.originalEvent.touches[0] : e;
            const dx = ev.clientX - startX;
            const dy = ev.clientY - startY;
            if (Math.abs(dx) > 5 || Math.abs(dy) > 5) moved = true;
            const nr = Math.max(8, Math.min(window.innerWidth - 64, startR - dx));
            const nb = Math.max(8, Math.min(window.innerHeight - 64, startB - dy));
            $icon.css({ right: nr + 'px', bottom: nb + 'px' });
        });
        $(document).on('mouseup.ham touchend.ham', function () {
            if (!dragging) return;
            dragging = false;
            if (moved) {
                const r = $icon[0].getBoundingClientRect();
                getSettings().iconPos = {
                    right: Math.round(window.innerWidth - r.right),
                    bottom: Math.round(window.innerHeight - r.bottom)
                };
                save();
            }
        });
        $icon.on('click', function () {
            if (moved) { moved = false; return; }
            log('Icon clicked');
            togglePanel();
        });
    } catch (e) { log('mountFloatingIcon failed: ' + e.message, true); }
}

function setFloatingIconVisible(visible) {
    const $icon = $('#hamham-floating');
    if (!$icon.length) { mountFloatingIcon(); return; }
    if (visible) $icon.removeClass('hamham-hidden');
    else $icon.addClass('hamham-hidden');
    log('Icon visible: ' + visible);
}

/* ============================================
   Panel
   ============================================ */
function mountPanel() {
    try {
        if ($('#hamham-panel').length) return;
        $('body').append(`<div id="hamham-panel" class="hamham-panel hamham-hidden">
            <div class="hamham-header" id="hamham-header">
                <div class="hamham-title">
                    <div class="hamham-logo">${HAMSTER_SVG}</div>
                    <div><div class="hamham-brand">HAMHAM</div><div class="hamham-tagline">World memory</div></div>
                </div>
                <div class="hamham-header-right">
                    <div class="hamham-char-badge"><span class="hamham-dot"></span><span class="hamham-char-name">—</span></div>
                    <button class="hamham-icon-btn" data-action="minimize" title="Minimize"><svg width="14" height="14" viewBox="0 0 14 14"><line x1="3" y1="11" x2="11" y2="11" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg></button>
                    <button class="hamham-icon-btn" data-action="close" title="Close"><svg width="14" height="14" viewBox="0 0 14 14"><path d="M3 3 L11 11 M11 3 L3 11" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" fill="none"/></svg></button>
                </div>
            </div>
            <div class="hamham-stats" id="hamham-stats"></div>
            <div class="hamham-tabs">
                <button class="hamham-tab active" data-tab="atlas">Atlas</button>
                <button class="hamham-tab" data-tab="constellation">Bonds</button>
                <button class="hamham-tab" data-tab="memory">Memories</button>
                <button class="hamham-tab" data-tab="atmosphere">Mood</button>
            </div>
            <div class="hamham-content" id="hamham-content"></div>
            <div class="hamham-footer">
                <div class="hamham-footer-left">
                    <button class="hamham-btn small" data-action="export">Export</button>
                    <button class="hamham-btn small" data-action="refresh">Refresh</button>
                </div>
                <button class="hamham-btn small danger" data-action="reset">Reset</button>
            </div>
        </div>`);
        log('Panel mounted');
    } catch (e) { log('mountPanel failed: ' + e.message, true); }
}

function openPanel() {
    if (!$('#hamham-panel').length) mountPanel();
    $('#hamham-panel').removeClass('hamham-hidden');
    getSettings().panelVisible = true;
    save();
    refreshPanel();
    log('Panel opened');
}

function closePanel() {
    $('#hamham-panel').addClass('hamham-hidden');
    getSettings().panelVisible = false;
    save();
}

function togglePanel() {
    if (!$('#hamham-panel').length || $('#hamham-panel').hasClass('hamham-hidden')) openPanel();
    else closePanel();
}

/* ============================================
   Render tabs
   ============================================ */
function refreshPanel() {
    if (!$('#hamham-panel').length || $('#hamham-panel').hasClass('hamham-hidden')) return;
    const data = getCharData();
    $('#hamham-panel .hamham-char-name').text(getCurrentCharacterName());

    const stats = data ? {
        loc: data.locations.length, npcs: data.npcs.length,
        mem: data.memories.length, bonds: data.npcs.filter(n => (n.bondLevel || 0) > 0).length
    } : { loc: 0, npcs: 0, mem: 0, bonds: 0 };
    $('#hamham-stats').html(`
        <div class="hamham-stat"><div class="hamham-stat-label">LOCATIONS</div><div class="hamham-stat-value">${stats.loc}</div></div>
        <div class="hamham-stat"><div class="hamham-stat-label">NPCS</div><div class="hamham-stat-value">${stats.npcs}</div></div>
        <div class="hamham-stat"><div class="hamham-stat-label">MEMORIES</div><div class="hamham-stat-value">${stats.mem}</div></div>
        <div class="hamham-stat"><div class="hamham-stat-label">BONDS</div><div class="hamham-stat-value">${stats.bonds}</div></div>
    `);

    const tab = getSettings().currentTab || 'atlas';
    $('.hamham-tab').removeClass('active');
    $(`.hamham-tab[data-tab="${tab}"]`).addClass('active');
    renderTab(tab);
}

function renderTab(tab) {
    const data = getCharData();
    const $c = $('#hamham-content');
    if (!data) {
        $c.html('<div class="hamham-empty">Open a character in SillyTavern first. HAMHAM will remember each character\'s world separately.</div>');
        return;
    }
    if (tab === 'atlas') renderAtlas($c, data);
    else if (tab === 'constellation') renderConstellation($c, data);
    else if (tab === 'memory') renderMemory($c, data);
    else if (tab === 'atmosphere') renderAtmosphere($c);
}

function renderAtlas($c, data) {
    const pins = data.npcs.filter(n => n.location).map(n => {
        const loc = data.locations.find(l => l.name === n.location);
        if (!loc) return '';
        const r = RELATIONSHIP_TYPES[n.relationship] || RELATIONSHIP_TYPES.neutral;
        return `<div class="hamham-pin" style="left:${loc.x}%;top:${loc.y}%;background:${r.color}" title="${escapeHtml(n.name)} @ ${escapeHtml(loc.name)}"></div>`;
    }).join('');

    const locList = data.locations.length
        ? data.locations.map((l, i) => `<div class="hamham-list-item"><span class="hamham-list-name">📍 ${escapeHtml(l.name)}</span><button class="hamham-mini-btn" data-action="del-loc" data-idx="${i}">✕</button></div>`).join('')
        : '<div class="hamham-empty-small">No locations yet — add one below</div>';

    const npcList = data.npcs.length
        ? data.npcs.map((n, i) => {
            const r = RELATIONSHIP_TYPES[n.relationship] || RELATIONSHIP_TYPES.neutral;
            return `<div class="hamham-list-item"><span class="hamham-list-name"><span class="hamham-npc-dot" style="background:${r.color}"></span>${escapeHtml(n.name)} <small>· ${r.label}</small></span><button class="hamham-mini-btn" data-action="del-npc" data-idx="${i}">✕</button></div>`;
        }).join('')
        : '<div class="hamham-empty-small">No NPCs yet — add manually or let auto-bond track them from chat</div>';

    $c.html(`
        <div class="hamham-map-wrap">
            <div class="hamham-map">
                <svg viewBox="0 0 400 240" width="100%" height="100%">
                    <defs><radialGradient id="hamham-map-bg" cx="50%" cy="50%" r="70%"><stop offset="0%" stop-color="#FFF5F8"/><stop offset="100%" stop-color="#F4C0D1"/></radialGradient></defs>
                    <rect x="0" y="0" width="400" height="240" fill="url(#hamham-map-bg)"/>
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
        </div>
        <div class="hamham-section">
            <div class="hamham-section-header"><span>Locations</span><button class="hamham-mini-btn" data-action="add-loc">+ Add</button></div>
            <div class="hamham-list">${locList}</div>
        </div>
        <div class="hamham-section">
            <div class="hamham-section-header"><span>NPCs</span><button class="hamham-mini-btn" data-action="add-npc">+ Add</button></div>
            <div class="hamham-list">${npcList}</div>
        </div>
    `);
}

function renderConstellation($c, data) {
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
        return `
            <line x1="${cx}" y1="${cy}" x2="${x}" y2="${y}" stroke="${r.color}" stroke-width="${sw}" opacity="0.7"/>
            <circle cx="${x}" cy="${y}" r="14" fill="${r.bg}" stroke="${r.color}" stroke-width="1.5"/>
            <text x="${x}" y="${y + 4}" text-anchor="middle" font-size="11" fill="${r.color}" font-weight="500">${escapeHtml((n.name || '?').charAt(0))}</text>
            <text x="${x}" y="${y + 28}" text-anchor="middle" font-size="9" fill="#72243E">${escapeHtml((n.name || '').slice(0, 10))}</text>
        `;
    }).join('');

    $c.html(`
        <div class="hamham-constellation-wrap">
            <svg viewBox="0 0 400 320" width="100%" height="auto">
                <defs><radialGradient id="hamham-const-bg" cx="50%" cy="50%" r="60%"><stop offset="0%" stop-color="#FFF5F8"/><stop offset="100%" stop-color="#FBEAF0"/></radialGradient></defs>
                <rect x="0" y="0" width="400" height="320" fill="url(#hamham-const-bg)"/>
                ${nodes}
                <circle cx="${cx}" cy="${cy}" r="22" fill="#D4537E" stroke="white" stroke-width="3"/>
                <text x="${cx}" y="${cy + 5}" text-anchor="middle" font-size="13" fill="white" font-weight="600">${escapeHtml(user.charAt(0).toUpperCase())}</text>
                <text x="${cx}" y="${cy + 40}" text-anchor="middle" font-size="11" fill="#4B1528" font-weight="600">${escapeHtml(user)}</text>
            </svg>
            <div class="hamham-const-legend">
                ${Object.entries(RELATIONSHIP_TYPES).map(([k, r]) => `<span><span class="hamham-legend-dot" style="background:${r.color}"></span>${r.label}</span>`).join('')}
            </div>
        </div>
        ${data.npcs.length === 0 ? '<div class="hamham-empty-small" style="margin-top:12px">No bonds yet</div>' : ''}
    `);
}

function renderMemory($c, data) {
    if (!data.memories.length) {
        $c.html(`<div class="hamham-empty"><b>No memories yet</b><br>Save important moments from your roleplay here.</div><button class="hamham-btn primary" data-action="add-memory">+ Add memory</button>`);
        return;
    }
    const cards = data.memories.map((m, i) => `
        <div class="hamham-memory-card emo-${m.emotion || 'journey'}">
            <div class="hamham-memory-chapter">${escapeHtml(m.chapter || 'Moment')}</div>
            <div class="hamham-memory-title">${escapeHtml(m.title || '')}</div>
            <div class="hamham-memory-quote">${escapeHtml(m.quote || '')}</div>
            <button class="hamham-mini-btn" data-action="del-memory" data-idx="${i}">✕</button>
        </div>
    `).join('');
    $c.html(`<div class="hamham-memory-grid">${cards}</div><button class="hamham-btn primary" data-action="add-memory" style="margin-top:10px">+ Add memory</button>`);
}

function renderAtmosphere($c) {
    const s = getSettings();
    const cards = ATMOSPHERE_EFFECTS.map(e => `
        <div class="hamham-atmos-card ${s.atmosphere.effect === e.id ? 'active' : ''}" data-effect="${e.id}">
            <div class="hamham-atmos-name">${e.name}</div>
            <div class="hamham-atmos-desc">${e.desc}</div>
        </div>
    `).join('');
    $c.html(`
        <div class="hamham-atmos-grid">${cards}</div>
        <div class="hamham-atmos-intensity">
            <label>Intensity</label>
            <div class="hamham-seg">
                ${['subtle', 'medium', 'dramatic'].map(v => `<button class="hamham-seg-btn ${s.atmosphere.intensity === v ? 'active' : ''}" data-intensity="${v}">${v}</button>`).join('')}
            </div>
        </div>
    `);
}

/* ============================================
   Atmosphere — canvas particles
   ============================================ */
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
    atmosCanvas.id = 'hamham-atmos-canvas';
    atmosCanvas.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:8999;';
    document.body.appendChild(atmosCanvas);
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
    const p = { x: Math.random() * w, y: Math.random() * h - h, vx: 0, vy: 0, size: 3 + Math.random() * 3, rot: Math.random() * Math.PI * 2, vr: (Math.random() - 0.5) * 0.05, opacity: 0.5 + Math.random() * 0.3, hue: Math.random() };
    if (effect === 'petals') { p.vx = (Math.random() - 0.5) * 0.8; p.vy = 0.8 + Math.random() * 0.8; p.size = 6 + Math.random() * 5; }
    else if (effect === 'rain') { p.vx = -1; p.vy = 7 + Math.random() * 4; p.size = 1; }
    else if (effect === 'snow') { p.vx = (Math.random() - 0.5) * 0.5; p.vy = 0.8 + Math.random() * 0.6; p.size = 2 + Math.random() * 2; }
    else if (effect === 'fireflies') { p.vx = (Math.random() - 0.5) * 0.3; p.vy = (Math.random() - 0.5) * 0.3; p.size = 3; p.y = Math.random() * h; }
    else if (effect === 'stars') { p.vx = 0; p.vy = 0.2; p.size = 1 + Math.random() * 1.5; p.y = Math.random() * h; }
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
    } else if (effect === 'snow') {
        c.fillStyle = '#ffffff'; c.beginPath(); c.arc(p.x, p.y, p.size, 0, Math.PI * 2); c.fill();
    } else if (effect === 'fireflies') {
        c.fillStyle = '#FFD166'; c.shadowColor = '#FFD166'; c.shadowBlur = 12;
        c.beginPath(); c.arc(p.x, p.y, p.size, 0, Math.PI * 2); c.fill();
    } else if (effect === 'stars') {
        c.fillStyle = '#ffffff'; c.beginPath(); c.arc(p.x, p.y, p.size, 0, Math.PI * 2); c.fill();
    } else if (effect === 'dust') {
        c.fillStyle = '#F4C0D1'; c.beginPath(); c.arc(p.x, p.y, p.size, 0, Math.PI * 2); c.fill();
    }
    c.restore();
}

/* ============================================
   Chat events
   ============================================ */
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
        save();
        refreshPanel();
    } catch (e) { /* silent */ }
}

/* ============================================
   Manual add
   ============================================ */
function promptAddLocation() {
    const name = prompt('Location name:'); if (!name) return;
    const data = getCharData(); if (!data) return alert('Select a character first');
    data.locations.push({ name, x: 30 + Math.random() * 40, y: 30 + Math.random() * 40 });
    save(); refreshPanel();
}
function promptAddNpc() {
    const name = prompt('NPC name:'); if (!name) return;
    const relInput = prompt('Relationship (romance, ally, friend, rival, enemy, neutral):', 'neutral');
    const relationship = RELATIONSHIP_TYPES[relInput] ? relInput : 'neutral';
    const data = getCharData(); if (!data) return;
    data.npcs.push({ name, relationship, bondLevel: 0, mentions: 0 });
    save(); refreshPanel();
}
function promptAddMemory() {
    const title = prompt('Memory title:'); if (!title) return;
    const chapter = prompt('Chapter/time:', 'Ch 1');
    const quote = prompt('Key quote:', '');
    const emotion = prompt('Emotion (romance, battle, mystery, victory, journey):', 'journey');
    const data = getCharData(); if (!data) return;
    data.memories.push({ title, chapter, quote, emotion });
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
    a.href = url; a.download = 'hamham-backup-' + new Date().toISOString().slice(0, 10) + '.json';
    a.click(); URL.revokeObjectURL(url);
}

/* ============================================
   Init — event delegation (survives DOM rebuilds)
   ============================================ */
async function loadSettingsUI() {
    try {
        const settingsHtml = await $.get(`${extensionFolderPath}/settings.html`);
        $('#extensions_settings2').append(settingsHtml);
        log('Settings HTML appended');

        // Debug log display at bottom of drawer
        $('.hamham-settings .inline-drawer-content').append(`
            <div class="hamham-row" style="flex-direction:column;align-items:stretch;margin-top:12px;padding-top:12px;border-top:1px solid rgba(212,83,126,0.15)">
                <label style="font-size:11px;opacity:0.7;margin-bottom:4px">Status log</label>
                <pre id="hamham-debug-log" style="font-size:10px;background:rgba(251,234,240,0.4);padding:8px;border-radius:6px;margin:0;white-space:pre-wrap;word-wrap:break-word;color:#4B1528;max-height:160px;overflow-y:auto;font-family:ui-monospace,monospace"></pre>
            </div>
        `);

        const s = getSettings();
        $('#hamham-toggle-icon').prop('checked', s.iconVisible);
        $('#hamham-toggle-autobond').prop('checked', s.autoBond);
        $('#hamham-debug-log').text(debugLog.slice(-8).join('\n'));

        log('Settings UI ready');
    } catch (e) {
        log('loadSettingsUI failed: ' + e.message, true);
    }
}

function attachEventDelegation() {
    $(document).off('.hamham')
        .on('change.hamham', '#hamham-toggle-icon', function () {
            const v = $(this).prop('checked');
            getSettings().iconVisible = v;
            save();
            setFloatingIconVisible(v);
            log('Toggle icon → ' + v);
            if (!v) closePanel();
        })
        .on('change.hamham', '#hamham-toggle-autobond', function () {
            getSettings().autoBond = $(this).prop('checked');
            save();
            log('Auto-bond → ' + getSettings().autoBond);
        })
        .on('click.hamham', '#hamham-open-panel-btn', function () { log('Open panel clicked'); openPanel(); })
        .on('click.hamham', '#hamham-reset-all-btn', resetAllData)
        .on('click.hamham', '.hamham-tab', function () {
            const tab = $(this).data('tab');
            getSettings().currentTab = tab;
            save();
            $('.hamham-tab').removeClass('active');
            $(this).addClass('active');
            renderTab(tab);
        })
        .on('click.hamham', '.hamham-icon-btn[data-action="minimize"], .hamham-icon-btn[data-action="close"]', closePanel)
        .on('click.hamham', '.hamham-btn[data-action="export"]', exportData)
        .on('click.hamham', '.hamham-btn[data-action="refresh"]', refreshPanel)
        .on('click.hamham', '.hamham-btn[data-action="reset"]', function () {
            if (!confirm('Reset data for THIS character only?')) return;
            const key = getCurrentCharacterKey();
            if (key) { delete getSettings().characters[key]; save(); refreshPanel(); }
        })
        .on('click.hamham', '.hamham-mini-btn[data-action="add-loc"]', promptAddLocation)
        .on('click.hamham', '.hamham-mini-btn[data-action="add-npc"]', promptAddNpc)
        .on('click.hamham', '[data-action="add-memory"]', promptAddMemory)
        .on('click.hamham', '.hamham-mini-btn[data-action="del-loc"]', function () {
            const i = +$(this).data('idx');
            const data = getCharData(); if (!data) return;
            data.locations.splice(i, 1); save(); refreshPanel();
        })
        .on('click.hamham', '.hamham-mini-btn[data-action="del-npc"]', function () {
            const i = +$(this).data('idx');
            const data = getCharData(); if (!data) return;
            data.npcs.splice(i, 1); save(); refreshPanel();
        })
        .on('click.hamham', '.hamham-mini-btn[data-action="del-memory"]', function () {
            const i = +$(this).data('idx');
            const data = getCharData(); if (!data) return;
            data.memories.splice(i, 1); save(); refreshPanel();
        })
        .on('click.hamham', '.hamham-atmos-card', function () {
            getSettings().atmosphere.effect = $(this).data('effect');
            save(); restartAtmosphere(); renderTab('atmosphere');
        })
        .on('click.hamham', '.hamham-seg-btn', function () {
            getSettings().atmosphere.intensity = $(this).data('intensity');
            save(); restartAtmosphere(); renderTab('atmosphere');
        });
    log('Event delegation attached');
}

jQuery(async () => {
    log(`HAMHAM v${VERSION} init...`);
    try {
        getSettings();
        attachEventDelegation();
        await loadSettingsUI();
        mountFloatingIcon();
        setFloatingIconVisible(getSettings().iconVisible);
        mountPanel();

        if (eventSource && event_types) {
            try {
                if (event_types.CHAT_CHANGED) eventSource.on(event_types.CHAT_CHANGED, onChatChanged);
                if (event_types.MESSAGE_RECEIVED) eventSource.on(event_types.MESSAGE_RECEIVED, onMessageReceived);
                log('Chat events bound');
            } catch (e) { log('Event binding: ' + e.message, true); }
        }

        restartAtmosphere();
        log('Ready!');
    } catch (e) {
        log('Init failed: ' + e.message, true);
    }
});
