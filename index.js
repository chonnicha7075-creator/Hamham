/* ============================================
   HAMHAM ✿ Living World Memory
   v1.0.0 — SillyTavern extension
   Per-character persistent world tracking
   ============================================ */

import { extension_settings, getContext } from "../../../extensions.js";
import { saveSettingsDebounced, eventSource, event_types } from "../../../../script.js";

const extensionName = "Hamham";
const extensionFolderPath = `scripts/extensions/third-party/${extensionName}`;

const DEFAULT_SETTINGS = {
    iconVisible: true,
    autoBond: true,
    panelVisible: false,
    currentTab: 'atlas',
    iconPos: null,
    panelPos: null,
    atmosphere: {
        effect: 'none',
        intensity: 'medium'
    },
    characters: {}
};

const RELATIONSHIP_TYPES = {
    romance:  { label: 'Romance',  color: '#D4537E', lightBg: '#FBEAF0', darkText: '#4B1528' },
    ally:     { label: 'Ally',     color: '#1D9E75', lightBg: '#E1F5EE', darkText: '#04342C' },
    friend:   { label: 'Friend',   color: '#7F77DD', lightBg: '#EEEDFE', darkText: '#3C3489' },
    rival:    { label: 'Rival',    color: '#BA7517', lightBg: '#FAEEDA', darkText: '#412402' },
    enemy:    { label: 'Enemy',    color: '#E24B4A', lightBg: '#FCEBEB', darkText: '#501313' },
    neutral:  { label: 'Neutral',  color: '#888780', lightBg: '#F1EFE8', darkText: '#2C2C2A' }
};

const LOCATION_TYPES = ['forest', 'mountain', 'lake', 'castle', 'village', 'garden', 'cave', 'beach'];

const EMOTION_TYPES = ['romance', 'battle', 'mystery', 'victory', 'journey'];

const ATMOSPHERE_EFFECTS = [
    { id: 'none',      name: 'None',          desc: 'Disable effects' },
    { id: 'petals',    name: 'Sakura petals', desc: 'Soft falling flowers' },
    { id: 'rain',      name: 'Gentle rain',   desc: 'Light rain shower' },
    { id: 'snow',      name: 'Snow',          desc: 'Quiet snowfall' },
    { id: 'fireflies', name: 'Fireflies',     desc: 'Glowing night sparks' },
    { id: 'stars',     name: 'Starfall',      desc: 'Twinkling stars' },
    { id: 'dust',      name: 'Dust motes',    desc: 'Floating warm dust' }
];

/* ============================================
   SVG assets
   ============================================ */
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
   State
   ============================================ */
let atmosphereAnim = null;
let atmosphereCanvas = null;
let atmosphereParticles = [];
let lastMessageCount = 0;

/* ============================================
   Settings helpers
   ============================================ */
function getSettings() {
    if (!extension_settings[extensionName]) {
        extension_settings[extensionName] = structuredClone(DEFAULT_SETTINGS);
    } else {
        // Ensure all defaults exist (migration)
        const s = extension_settings[extensionName];
        if (s.iconVisible === undefined) s.iconVisible = true;
        if (s.autoBond === undefined) s.autoBond = true;
        if (!s.atmosphere) s.atmosphere = { effect: 'none', intensity: 'medium' };
        if (!s.characters) s.characters = {};
        if (!s.currentTab) s.currentTab = 'atlas';
    }
    return extension_settings[extensionName];
}

function save() {
    saveSettingsDebounced();
}

function getCurrentCharacterKey() {
    try {
        const context = getContext();
        if (context.groupId) return `group_${context.groupId}`;
        if (context.characterId !== undefined && context.characters && context.characters[context.characterId]) {
            return context.characters[context.characterId].avatar || null;
        }
    } catch (e) { /* ignore */ }
    return null;
}

function getCurrentCharacterName() {
    try {
        const context = getContext();
        if (context.groupId && context.groups) {
            const group = context.groups.find(g => g.id === context.groupId);
            return group ? group.name : 'Group chat';
        }
        if (context.characterId !== undefined && context.characters && context.characters[context.characterId]) {
            return context.characters[context.characterId].name || 'Unnamed';
        }
    } catch (e) { /* ignore */ }
    return null;
}

function getUserName() {
    try {
        const context = getContext();
        return context.name1 || 'You';
    } catch (e) {
        return 'You';
    }
}

function getCharacterData(key) {
    if (!key) return null;
    const settings = getSettings();
    if (!settings.characters[key]) {
        settings.characters[key] = {
            locations: [],
            npcs: [],
            memories: [],
            created: Date.now(),
            lastUpdated: Date.now()
        };
        save();
    }
    return settings.characters[key];
}

function touchCharacterData(key) {
    const data = getCharacterData(key);
    if (data) {
        data.lastUpdated = Date.now();
        save();
    }
}

function uid() {
    return 'h' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

/* ============================================
   Toast helper
   ============================================ */
function toast(msg, type = 'info') {
    if (typeof toastr !== 'undefined') {
        toastr[type](msg, 'HAMHAM');
    } else {
        console.log(`[HAMHAM] ${msg}`);
    }
}

/* ============================================
   Floating icon
   ============================================ */
function buildFloatingIcon() {
    return `<div id="hamham-floating" class="hamham-floating">
        <span class="hamham-pulse"></span>
        <div class="hamham-floating-inner">${HAMSTER_SVG}</div>
    </div>`;
}

function mountFloatingIcon() {
    if ($('#hamham-floating').length) return;
    $('body').append(buildFloatingIcon());
    const $icon = $('#hamham-floating');

    const settings = getSettings();
    if (settings.iconPos && typeof settings.iconPos.right === 'number' && typeof settings.iconPos.bottom === 'number') {
        $icon.css({ right: settings.iconPos.right + 'px', bottom: settings.iconPos.bottom + 'px' });
    }

    let dragStartX, dragStartY, dragStartRight, dragStartBottom, isDragging = false, didDrag = false;

    $icon.on('mousedown touchstart', function (e) {
        const ev = e.originalEvent.touches ? e.originalEvent.touches[0] : e;
        dragStartX = ev.clientX;
        dragStartY = ev.clientY;
        const rect = $icon[0].getBoundingClientRect();
        dragStartRight = window.innerWidth - rect.right;
        dragStartBottom = window.innerHeight - rect.bottom;
        isDragging = true;
        didDrag = false;
        $icon.addClass('dragging');
        e.preventDefault();
    });

    $(document).on('mousemove.hamham touchmove.hamham', function (e) {
        if (!isDragging) return;
        const ev = e.originalEvent.touches ? e.originalEvent.touches[0] : e;
        const dx = ev.clientX - dragStartX;
        const dy = ev.clientY - dragStartY;
        if (Math.abs(dx) > 4 || Math.abs(dy) > 4) didDrag = true;
        const newRight = Math.max(8, Math.min(window.innerWidth - 60, dragStartRight - dx));
        const newBottom = Math.max(8, Math.min(window.innerHeight - 60, dragStartBottom - dy));
        $icon.css({ right: newRight + 'px', bottom: newBottom + 'px' });
    });

    $(document).on('mouseup.hamham touchend.hamham', function () {
        if (!isDragging) return;
        isDragging = false;
        $icon.removeClass('dragging');
        if (didDrag) {
            const rect = $icon[0].getBoundingClientRect();
            const settings = getSettings();
            settings.iconPos = {
                right: Math.round(window.innerWidth - rect.right),
                bottom: Math.round(window.innerHeight - rect.bottom)
            };
            save();
        }
    });

    $icon.on('click', function () {
        if (didDrag) { didDrag = false; return; }
        togglePanel();
    });
}

function setFloatingIconVisible(visible) {
    const $icon = $('#hamham-floating');
    if (visible) {
        $icon.removeClass('hamham-hidden');
    } else {
        $icon.addClass('hamham-hidden');
    }
}

/* ============================================
   Main panel
   ============================================ */
function buildPanelHTML() {
    return `<div id="hamham-panel" class="hamham-panel hamham-hidden">
        <div class="hamham-header" id="hamham-header">
            <div class="hamham-title">
                <div class="hamham-logo">${HAMSTER_SVG}</div>
                <div>
                    <div class="hamham-brand">HAMHAM</div>
                    <div class="hamham-tagline">Per-character world memory</div>
                </div>
            </div>
            <div class="hamham-header-right">
                <div class="hamham-char-badge">
                    <span class="hamham-dot empty"></span>
                    <span class="hamham-char-name">—</span>
                </div>
                <button class="hamham-icon-btn" data-action="minimize" title="Minimize">
                    <svg width="14" height="14" viewBox="0 0 14 14"><line x1="3" y1="11" x2="11" y2="11" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
                </button>
                <button class="hamham-icon-btn" data-action="close" title="Close">
                    <svg width="14" height="14" viewBox="0 0 14 14"><path d="M3 3 L11 11 M11 3 L3 11" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" fill="none"/></svg>
                </button>
            </div>
        </div>

        <div class="hamham-stats" id="hamham-stats"></div>

        <div class="hamham-tabs">
            <button class="hamham-tab active" data-tab="atlas">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M3 6l6-3 6 3 6-3v15l-6 3-6-3-6 3z"/><path d="M9 3v15M15 6v15"/></svg>
                Atlas
            </button>
            <button class="hamham-tab" data-tab="constellation">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="12" cy="12" r="3"/><circle cx="5" cy="5" r="2"/><circle cx="19" cy="5" r="2"/><circle cx="5" cy="19" r="2"/><circle cx="19" cy="19" r="2"/><line x1="7" y1="7" x2="10" y2="10"/><line x1="17" y1="7" x2="14" y2="10"/><line x1="7" y1="17" x2="10" y2="14"/><line x1="17" y1="17" x2="14" y2="14"/></svg>
                Bonds
            </button>
            <button class="hamham-tab" data-tab="memory">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M4 4h16v16H4z"/><path d="M4 8h16M8 4v16M16 4v16"/></svg>
                Memories
            </button>
            <button class="hamham-tab" data-tab="atmosphere">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M4 8c0-2 2-4 5-4s5 2 5 4-2 4-5 4"/><circle cx="16" cy="10" r="1.5"/><line x1="8" y1="16" x2="6" y2="20" stroke-linecap="round"/><line x1="12" y1="16" x2="10" y2="20" stroke-linecap="round"/><line x1="16" y1="16" x2="14" y2="20" stroke-linecap="round"/></svg>
                Mood
            </button>
        </div>

        <div class="hamham-content" id="hamham-content"></div>

        <div class="hamham-footer">
            <div class="hamham-footer-left">
                <button class="hamham-btn small" data-action="export">Export</button>
                <button class="hamham-btn small" data-action="import">Import</button>
                <button class="hamham-btn small" data-action="refresh">Refresh</button>
            </div>
            <button class="hamham-btn small danger" data-action="reset">Reset</button>
        </div>
    </div>`;
}

function mountPanel() {
    if ($('#hamham-panel').length) return;
    $('body').append(buildPanelHTML());

    const settings = getSettings();
    const $panel = $('#hamham-panel');

    if (settings.panelPos && typeof settings.panelPos.right === 'number') {
        $panel.css({
            right: settings.panelPos.right + 'px',
            bottom: settings.panelPos.bottom + 'px'
        });
    }

    // Make panel draggable via header
    let pDragging = false, pStartX, pStartY, pStartRight, pStartBottom;
    $('#hamham-header').on('mousedown', function (e) {
        if ($(e.target).closest('button').length) return;
        pDragging = true;
        pStartX = e.clientX;
        pStartY = e.clientY;
        const rect = $panel[0].getBoundingClientRect();
        pStartRight = window.innerWidth - rect.right;
        pStartBottom = window.innerHeight - rect.bottom;
        e.preventDefault();
    });
    $(document).on('mousemove.hamhampanel', function (e) {
        if (!pDragging) return;
        const newRight = Math.max(8, Math.min(window.innerWidth - 120, pStartRight - (e.clientX - pStartX)));
        const newBottom = Math.max(8, Math.min(window.innerHeight - 120, pStartBottom - (e.clientY - pStartY)));
        $panel.css({ right: newRight + 'px', bottom: newBottom + 'px' });
    });
    $(document).on('mouseup.hamhampanel', function () {
        if (!pDragging) return;
        pDragging = false;
        const rect = $panel[0].getBoundingClientRect();
        const s = getSettings();
        s.panelPos = {
            right: Math.round(window.innerWidth - rect.right),
            bottom: Math.round(window.innerHeight - rect.bottom)
        };
        save();
    });

    // Header button actions
    $panel.on('click', '.hamham-icon-btn', function () {
        const action = $(this).data('action');
        if (action === 'minimize' || action === 'close') {
            closePanel();
        }
    });

    // Tab switching
    $panel.on('click', '.hamham-tab', function () {
        const tab = $(this).data('tab');
        switchTab(tab);
    });

    // Footer actions
    $panel.on('click', '.hamham-footer [data-action]', function () {
        const action = $(this).data('action');
        if (action === 'export') exportData();
        else if (action === 'import') importData();
        else if (action === 'refresh') refreshPanel();
        else if (action === 'reset') resetCurrentCharacter();
    });
}

function togglePanel() {
    const s = getSettings();
    if (s.panelVisible) closePanel();
    else openPanel();
}

function openPanel() {
    mountPanel();
    $('#hamham-panel').removeClass('hamham-hidden');
    getSettings().panelVisible = true;
    save();
    refreshPanel();
}

function closePanel() {
    $('#hamham-panel').addClass('hamham-hidden');
    getSettings().panelVisible = false;
    save();
}

function switchTab(tab) {
    const s = getSettings();
    s.currentTab = tab;
    save();
    $('.hamham-tab').removeClass('active');
    $(`.hamham-tab[data-tab="${tab}"]`).addClass('active');
    renderCurrentTab();
}

function refreshPanel() {
    updateHeaderBadge();
    updateStats();
    renderCurrentTab();
}

function updateHeaderBadge() {
    const name = getCurrentCharacterName();
    const $badge = $('.hamham-char-badge');
    if (name) {
        $badge.find('.hamham-char-name').text(name);
        $badge.find('.hamham-dot').removeClass('empty');
    } else {
        $badge.find('.hamham-char-name').text('No chat open');
        $badge.find('.hamham-dot').addClass('empty');
    }
}

function updateStats() {
    const key = getCurrentCharacterKey();
    const data = key ? getCharacterData(key) : null;
    const locs = data ? data.locations.length : 0;
    const npcs = data ? data.npcs.length : 0;
    const mems = data ? data.memories.length : 0;
    const bonds = data ? data.npcs.reduce((sum, n) => sum + (n.bondLevel || 0), 0) : 0;

    $('#hamham-stats').html(`
        <div class="hamham-stat"><p class="hamham-stat-label">Locations</p><p class="hamham-stat-value">${locs}</p></div>
        <div class="hamham-stat"><p class="hamham-stat-label">NPCs</p><p class="hamham-stat-value">${npcs}</p></div>
        <div class="hamham-stat"><p class="hamham-stat-label">Memories</p><p class="hamham-stat-value">${mems}</p></div>
        <div class="hamham-stat"><p class="hamham-stat-label">Bonds</p><p class="hamham-stat-value">${bonds}</p></div>
    `);
}

function renderCurrentTab() {
    const s = getSettings();
    const key = getCurrentCharacterKey();

    if (!key) {
        $('#hamham-content').html(`
            <div class="hamham-empty">
                <span class="icon">✿</span>
                <div class="title">No chat open</div>
                <div>Open any character or group chat to start building their world</div>
            </div>
        `);
        return;
    }

    switch (s.currentTab) {
        case 'atlas': return renderAtlas();
        case 'constellation': return renderConstellation();
        case 'memory': return renderMemory();
        case 'atmosphere': return renderAtmosphere();
    }
}

/* ============================================
   Atlas tab (map + locations + npcs)
   ============================================ */
function terrainSVG(loc) {
    const { type, x, y } = loc;
    const cx = x * 5, cy = y * 3; // scale to viewBox (x: 0-100 → 0-500, y: 0-100 → 0-300)
    switch (type) {
        case 'forest':
            return `<g class="hamham-terrain" transform="translate(${cx}, ${cy})">
                <ellipse cx="0" cy="8" rx="28" ry="10" fill="#1D9E75" opacity="0.18"/>
                <g transform="translate(-14, -6)"><polygon points="0,10 -6,-2 6,-2" fill="#1D9E75" opacity="0.8"/><rect x="-1" y="6" width="2" height="6" fill="#633806"/></g>
                <g transform="translate(0, -10)"><polygon points="0,12 -7,-2 7,-2" fill="#0F6E56" opacity="0.85"/><rect x="-1" y="8" width="2" height="6" fill="#633806"/></g>
                <g transform="translate(14, -4)"><polygon points="0,10 -6,-2 6,-2" fill="#1D9E75" opacity="0.8"/><rect x="-1" y="6" width="2" height="6" fill="#633806"/></g>
            </g>`;
        case 'mountain':
            return `<g class="hamham-terrain" transform="translate(${cx}, ${cy})">
                <polygon points="0,-18 -22,12 22,12" fill="#888780" opacity="0.85"/>
                <polygon points="0,-18 -8,0 0,4 8,0" fill="#F1EFE8" opacity="0.9"/>
                <polygon points="-14,0 -22,12 -6,12" fill="#5F5E5A" opacity="0.3"/>
            </g>`;
        case 'lake':
            return `<g class="hamham-terrain" transform="translate(${cx}, ${cy})">
                <ellipse cx="0" cy="0" rx="30" ry="14" fill="#B5D4F4" opacity="0.9"/>
                <ellipse cx="0" cy="0" rx="30" ry="14" fill="none" stroke="#378ADD" stroke-width="0.8" opacity="0.5"/>
                <path d="M -18 -3 Q -14 -5, -10 -3" fill="none" stroke="white" stroke-width="1" opacity="0.7"/>
                <path d="M 6 2 Q 10 0, 14 2" fill="none" stroke="white" stroke-width="1" opacity="0.7"/>
            </g>`;
        case 'castle':
            return `<g class="hamham-terrain" transform="translate(${cx}, ${cy})">
                <rect x="-14" y="-8" width="28" height="18" fill="#B4B2A9" opacity="0.9"/>
                <rect x="-14" y="-14" width="6" height="6" fill="#888780"/>
                <rect x="-3" y="-18" width="6" height="10" fill="#888780"/>
                <rect x="8" y="-14" width="6" height="6" fill="#888780"/>
                <polygon points="-14,-14 -11,-20 -8,-14" fill="#D4537E"/>
                <polygon points="-3,-18 0,-24 3,-18" fill="#D4537E"/>
                <polygon points="8,-14 11,-20 14,-14" fill="#D4537E"/>
                <rect x="-2" y="-2" width="4" height="12" fill="#633806" opacity="0.7"/>
            </g>`;
        case 'village':
            return `<g class="hamham-terrain" transform="translate(${cx}, ${cy})">
                <g transform="translate(-12, 2)"><polygon points="-7,2 -7,-4 0,-10 7,-4 7,2" fill="#F4C0D1" opacity="0.9"/><polygon points="-8,-4 0,-11 8,-4" fill="#993556" opacity="0.9"/><rect x="-2" y="-3" width="4" height="5" fill="#633806" opacity="0.6"/></g>
                <g transform="translate(6, -2)"><polygon points="-6,2 -6,-3 0,-9 6,-3 6,2" fill="#F4C0D1" opacity="0.9"/><polygon points="-7,-3 0,-10 7,-3" fill="#993556" opacity="0.9"/></g>
                <g transform="translate(14, 4)"><polygon points="-5,2 -5,-2 0,-7 5,-2 5,2" fill="#F4C0D1" opacity="0.9"/><polygon points="-6,-2 0,-8 6,-2" fill="#993556" opacity="0.9"/></g>
            </g>`;
        case 'garden':
            return `<g class="hamham-terrain" transform="translate(${cx}, ${cy})">
                <ellipse cx="0" cy="6" rx="26" ry="8" fill="#C0DD97" opacity="0.35"/>
                ${[[-12,0,'#ED93B1'],[0,-4,'#F4C0D1'],[12,2,'#D4537E'],[-6,6,'#F4C0D1'],[8,6,'#ED93B1']].map(([fx,fy,fc]) => 
                    `<g transform="translate(${fx},${fy})"><circle cx="0" cy="-2" r="2.5" fill="${fc}"/><circle cx="-2" cy="0" r="2.5" fill="${fc}"/><circle cx="2" cy="0" r="2.5" fill="${fc}"/><circle cx="0" cy="2" r="2.5" fill="${fc}"/><circle cx="0" cy="0" r="1.5" fill="#FAC775"/></g>`
                ).join('')}
            </g>`;
        case 'cave':
            return `<g class="hamham-terrain" transform="translate(${cx}, ${cy})">
                <ellipse cx="0" cy="4" rx="24" ry="10" fill="#5F5E5A" opacity="0.55"/>
                <path d="M -14 4 Q -14 -8, 0 -8 Q 14 -8, 14 4 Z" fill="#2C2C2A" opacity="0.9"/>
                <path d="M -8 4 Q -8 -3, 0 -3 Q 8 -3, 8 4 Z" fill="#000" opacity="0.7"/>
            </g>`;
        case 'beach':
            return `<g class="hamham-terrain" transform="translate(${cx}, ${cy})">
                <ellipse cx="0" cy="0" rx="30" ry="8" fill="#FAC775" opacity="0.55"/>
                <path d="M -28 4 Q -20 2, -12 4 T 4 4 T 20 4 T 28 4" fill="none" stroke="#378ADD" stroke-width="1.2" opacity="0.6"/>
                <path d="M -28 8 Q -20 6, -12 8 T 4 8 T 20 8 T 28 8" fill="none" stroke="#378ADD" stroke-width="1" opacity="0.5"/>
            </g>`;
        default:
            return `<g class="hamham-terrain" transform="translate(${cx}, ${cy})">
                <circle cx="0" cy="0" r="10" fill="#F4C0D1" opacity="0.55"/>
                <circle cx="0" cy="0" r="5" fill="#D4537E" opacity="0.7"/>
            </g>`;
    }
}

function renderAtlas() {
    const key = getCurrentCharacterKey();
    const data = getCharacterData(key);
    const npcsByLoc = {};
    data.npcs.forEach(npc => {
        if (npc.locationId) {
            if (!npcsByLoc[npc.locationId]) npcsByLoc[npc.locationId] = [];
            npcsByLoc[npc.locationId].push(npc);
        }
    });

    const terrainSVGs = data.locations.map(loc => terrainSVG(loc)).join('');

    const locationLabels = data.locations.map(loc => 
        `<text x="${loc.x * 5}" y="${loc.y * 3 + 28}" text-anchor="middle" font-size="10" font-weight="600" fill="#72243E" style="text-shadow: 0 1px 2px white;">${escapeHtml(loc.name)}</text>`
    ).join('');

    const npcPins = data.npcs.map(npc => {
        let px, py;
        if (npc.locationId) {
            const loc = data.locations.find(l => l.id === npc.locationId);
            if (loc) {
                const siblings = npcsByLoc[npc.locationId] || [];
                const idx = siblings.indexOf(npc);
                const angle = (idx / Math.max(siblings.length, 1)) * Math.PI * 2;
                px = loc.x * 5 + Math.cos(angle) * 16;
                py = loc.y * 3 + Math.sin(angle) * 10;
            } else {
                px = (npc.x || 50) * 5;
                py = (npc.y || 50) * 3;
            }
        } else {
            px = (npc.x || 50) * 5;
            py = (npc.y || 50) * 3;
        }
        const rel = RELATIONSHIP_TYPES[npc.relationship] || RELATIONSHIP_TYPES.neutral;
        return `<g class="hamham-map-pin" data-npc-id="${npc.id}" transform="translate(${px}, ${py})">
            <circle r="8" fill="${rel.color}" opacity="0.28"/>
            <circle r="5" fill="${rel.color}" stroke="white" stroke-width="1.5"/>
        </g>`;
    }).join('');

    let mapContent;
    if (data.locations.length === 0 && data.npcs.length === 0) {
        mapContent = `<g><text x="250" y="150" text-anchor="middle" font-size="12" fill="#72243E" opacity="0.6">✿ No places yet — add one below ✿</text></g>`;
    } else {
        mapContent = terrainSVGs + locationLabels + npcPins;
    }

    const locLegend = `
        <div class="hamham-legend">
            ${Object.entries(RELATIONSHIP_TYPES).map(([k, r]) => 
                `<span class="hamham-legend-item"><span class="hamham-legend-dot" style="background:${r.color}"></span>${r.label}</span>`
            ).join('')}
        </div>
    `;

    const locationsList = data.locations.length ? `
        <div class="hamham-list">
            ${data.locations.map(loc => `
                <div class="hamham-list-item">
                    <span class="dot" style="background: ${locationTypeColor(loc.type)}"></span>
                    <span class="name">${escapeHtml(loc.name)}</span>
                    <span class="meta">${loc.type}</span>
                    <button class="remove" data-remove-loc="${loc.id}" title="Remove">×</button>
                </div>
            `).join('')}
        </div>
    ` : `<div class="hamham-empty"><div>No locations yet</div></div>`;

    const npcsList = data.npcs.length ? `
        <div class="hamham-list">
            ${data.npcs.map(npc => {
                const rel = RELATIONSHIP_TYPES[npc.relationship] || RELATIONSHIP_TYPES.neutral;
                const locName = npc.locationId ? (data.locations.find(l => l.id === npc.locationId)?.name || '') : '';
                return `<div class="hamham-list-item">
                    <span class="dot" style="background: ${rel.color}"></span>
                    <span class="name">${escapeHtml(npc.name)}</span>
                    <span class="meta">${rel.label}${locName ? ' · ' + escapeHtml(locName) : ''} · lv ${npc.bondLevel || 0}</span>
                    <button class="remove" data-remove-npc="${npc.id}" title="Remove">×</button>
                </div>`;
            }).join('')}
        </div>
    ` : `<div class="hamham-empty"><div>No NPCs yet</div></div>`;

    $('#hamham-content').html(`
        <div class="hamham-atlas-wrap">
            <div class="hamham-map">
                <svg viewBox="0 0 500 300" preserveAspectRatio="xMidYMid meet">
                    <defs>
                        <radialGradient id="mapGrad" cx="50%" cy="40%" r="80%">
                            <stop offset="0%" stop-color="#FFF8FB"/>
                            <stop offset="60%" stop-color="#FBEAF0"/>
                            <stop offset="100%" stop-color="#F4C0D1"/>
                        </radialGradient>
                    </defs>
                    <rect x="0" y="0" width="500" height="300" fill="url(#mapGrad)"/>
                    ${mapContent}
                </svg>
            </div>
            ${locLegend}

            <div class="hamham-section-title">Add location</div>
            <div class="hamham-add-row">
                <input class="hamham-input" id="hamham-new-loc-name" placeholder="Name e.g. Crystal Forest" maxlength="40"/>
                <select class="hamham-select" id="hamham-new-loc-type">
                    ${LOCATION_TYPES.map(t => `<option value="${t}">${t}</option>`).join('')}
                </select>
                <button class="hamham-btn primary" id="hamham-add-loc-btn">Add</button>
            </div>

            <div class="hamham-section-title">Locations (${data.locations.length})</div>
            ${locationsList}

            <div class="hamham-section-title">Add NPC</div>
            <div class="hamham-add-row">
                <input class="hamham-input" id="hamham-new-npc-name" placeholder="NPC name" maxlength="40"/>
                <select class="hamham-select" id="hamham-new-npc-rel">
                    ${Object.entries(RELATIONSHIP_TYPES).map(([k, r]) => `<option value="${k}">${r.label}</option>`).join('')}
                </select>
                <button class="hamham-btn primary" id="hamham-add-npc-btn">Add</button>
            </div>
            <div class="hamham-add-row" style="margin-top: 6px;">
                <select class="hamham-select" id="hamham-new-npc-loc" style="flex: 1">
                    <option value="">No location</option>
                    ${data.locations.map(l => `<option value="${l.id}">${escapeHtml(l.name)}</option>`).join('')}
                </select>
            </div>

            <div class="hamham-section-title">NPCs (${data.npcs.length})</div>
            ${npcsList}
        </div>
    `);

    // Bindings
    $('#hamham-add-loc-btn').on('click', () => {
        const name = $('#hamham-new-loc-name').val().trim();
        const type = $('#hamham-new-loc-type').val();
        if (!name) return toast('Enter a name', 'warning');
        addLocation(name, type);
    });
    $('#hamham-add-npc-btn').on('click', () => {
        const name = $('#hamham-new-npc-name').val().trim();
        const rel = $('#hamham-new-npc-rel').val();
        const locId = $('#hamham-new-npc-loc').val() || null;
        if (!name) return toast('Enter a name', 'warning');
        addNpc(name, rel, locId);
    });
    $('#hamham-content').on('click', '[data-remove-loc]', function () {
        removeLocation($(this).data('remove-loc'));
    });
    $('#hamham-content').on('click', '[data-remove-npc]', function () {
        removeNpc($(this).data('remove-npc'));
    });
    $('#hamham-content').on('click', '.hamham-map-pin', function (e) {
        const npcId = $(this).data('npc-id');
        showNpcPopup(npcId, e);
    });
}

function locationTypeColor(type) {
    const colors = {
        forest: '#1D9E75',
        mountain: '#888780',
        lake: '#378ADD',
        castle: '#993556',
        village: '#D4537E',
        garden: '#ED93B1',
        cave: '#2C2C2A',
        beach: '#FAC775'
    };
    return colors[type] || '#888780';
}

function addLocation(name, type) {
    const key = getCurrentCharacterKey();
    if (!key) return;
    const data = getCharacterData(key);
    // Auto-position: spread around the map
    const positions = [
        [25, 30], [75, 30], [50, 50], [25, 75], [75, 75],
        [15, 50], [85, 50], [50, 20], [50, 80], [40, 40], [60, 60]
    ];
    const i = data.locations.length % positions.length;
    data.locations.push({
        id: uid(),
        name, type,
        x: positions[i][0] + (Math.random() * 10 - 5),
        y: positions[i][1] + (Math.random() * 10 - 5)
    });
    touchCharacterData(key);
    refreshPanel();
    toast(`Added ${name}`, 'success');
}

function addNpc(name, relationship, locationId) {
    const key = getCurrentCharacterKey();
    if (!key) return;
    const data = getCharacterData(key);
    data.npcs.push({
        id: uid(),
        name,
        relationship: relationship || 'neutral',
        bondLevel: 1,
        locationId: locationId || null,
        firstMet: Date.now(),
        mentions: 1,
        lastQuote: ''
    });
    touchCharacterData(key);
    refreshPanel();
    toast(`Added ${name}`, 'success');
}

function removeLocation(id) {
    const key = getCurrentCharacterKey();
    if (!key) return;
    const data = getCharacterData(key);
    if (!confirm('Remove this location?')) return;
    data.locations = data.locations.filter(l => l.id !== id);
    data.npcs.forEach(n => { if (n.locationId === id) n.locationId = null; });
    touchCharacterData(key);
    refreshPanel();
}

function removeNpc(id) {
    const key = getCurrentCharacterKey();
    if (!key) return;
    const data = getCharacterData(key);
    if (!confirm('Remove this NPC?')) return;
    data.npcs = data.npcs.filter(n => n.id !== id);
    touchCharacterData(key);
    refreshPanel();
}

function showNpcPopup(npcId, event) {
    const key = getCurrentCharacterKey();
    const data = getCharacterData(key);
    const npc = data.npcs.find(n => n.id === npcId);
    if (!npc) return;
    const rel = RELATIONSHIP_TYPES[npc.relationship] || RELATIONSHIP_TYPES.neutral;
    const loc = npc.locationId ? data.locations.find(l => l.id === npc.locationId) : null;

    $('.hamham-map-popup').remove();
    const $popup = $(`<div class="hamham-map-popup">
        <div class="name">${escapeHtml(npc.name)}</div>
        <div class="rel">${rel.label} · Bond level ${npc.bondLevel || 0}</div>
        ${loc ? `<div class="quote">At ${escapeHtml(loc.name)}</div>` : ''}
        ${npc.lastQuote ? `<div class="quote">"${escapeHtml(npc.lastQuote).slice(0, 60)}"</div>` : ''}
    </div>`);

    const $map = $('.hamham-map');
    const mapRect = $map[0].getBoundingClientRect();
    const mouseX = event.clientX - mapRect.left;
    const mouseY = event.clientY - mapRect.top;

    $map.append($popup);
    const popW = $popup.outerWidth();
    const popH = $popup.outerHeight();
    let px = mouseX + 10;
    let py = mouseY - popH - 10;
    if (px + popW > mapRect.width - 10) px = mouseX - popW - 10;
    if (py < 5) py = mouseY + 15;
    $popup.css({ left: px + 'px', top: py + 'px' });

    setTimeout(() => { $popup.fadeOut(200, () => $popup.remove()); }, 3500);
}

/* ============================================
   Constellation tab (relationships to {{user}})
   ============================================ */
function renderConstellation() {
    const key = getCurrentCharacterKey();
    const data = getCharacterData(key);
    const userName = getUserName();

    if (data.npcs.length === 0) {
        $('#hamham-content').html(`
            <div class="hamham-constellation-wrap">
                <div class="hamham-constellation">
                    <div class="hamham-const-empty">
                        <div style="font-size: 26px; opacity: 0.4; margin-bottom: 8px;">✦</div>
                        <div>No NPCs yet. Add them in the Atlas tab.</div>
                    </div>
                </div>
            </div>
        `);
        return;
    }

    // Sort NPCs by bond level (strongest first)
    const npcs = [...data.npcs].sort((a, b) => (b.bondLevel || 0) - (a.bondLevel || 0));

    // Lay them out in a radial pattern around {{user}}
    const centerX = 200, centerY = 160;
    const maxRadius = 130;
    const minRadius = 55;
    const maxBond = Math.max(10, ...npcs.map(n => n.bondLevel || 0));

    const nodes = npcs.map((npc, i) => {
        // Radius inversely proportional to bond level (stronger bonds closer)
        const bond = npc.bondLevel || 1;
        const ratio = 1 - Math.min(1, bond / maxBond) * 0.75;
        const radius = minRadius + (maxRadius - minRadius) * ratio;
        // Angle: distribute evenly but offset by relationship type
        const angle = (i / npcs.length) * Math.PI * 2 - Math.PI / 2;
        const x = centerX + Math.cos(angle) * radius;
        const y = centerY + Math.sin(angle) * radius;
        return { npc, x, y, radius };
    });

    const edges = nodes.map(n => {
        const rel = RELATIONSHIP_TYPES[n.npc.relationship] || RELATIONSHIP_TYPES.neutral;
        const strength = Math.min(4, 0.8 + (n.npc.bondLevel || 0) * 0.25);
        return `<line x1="${centerX}" y1="${centerY}" x2="${n.x}" y2="${n.y}" stroke="${rel.color}" stroke-width="${strength}" opacity="0.7" stroke-linecap="round"/>`;
    }).join('');

    const nodeSvg = nodes.map(n => {
        const rel = RELATIONSHIP_TYPES[n.npc.relationship] || RELATIONSHIP_TYPES.neutral;
        const nodeSize = 12 + Math.min(10, (n.npc.bondLevel || 0));
        const initial = (n.npc.name[0] || '?').toUpperCase();
        return `<g class="hamham-const-node" data-npc-id="${n.npc.id}" transform="translate(${n.x}, ${n.y})">
            <circle r="${nodeSize + 2}" fill="${rel.color}" opacity="0.18"/>
            <circle r="${nodeSize}" fill="${rel.lightBg}" stroke="${rel.color}" stroke-width="2"/>
            <text y="${nodeSize * 0.3}" text-anchor="middle" font-size="${nodeSize * 0.9}" font-weight="600" fill="${rel.darkText}">${escapeHtml(initial)}</text>
            <text y="${nodeSize + 14}" text-anchor="middle" font-size="10" font-weight="500" fill="${rel.darkText}">${escapeHtml(n.npc.name.slice(0, 10))}</text>
        </g>`;
    }).join('');

    const userInitial = (userName[0] || 'U').toUpperCase();

    $('#hamham-content').html(`
        <div class="hamham-constellation-wrap">
            <div class="hamham-constellation">
                <svg viewBox="0 0 400 320" preserveAspectRatio="xMidYMid meet">
                    ${edges}
                    <g transform="translate(${centerX}, ${centerY})">
                        <circle r="26" fill="#FBEAF0" opacity="0.3"/>
                        <circle r="22" fill="white" stroke="#D4537E" stroke-width="2.5"/>
                        <text y="5" text-anchor="middle" font-size="14" font-weight="600" fill="#4B1528">${escapeHtml(userInitial)}</text>
                        <text y="42" text-anchor="middle" font-size="10" font-weight="600" fill="#993556">${escapeHtml(userName.slice(0, 14))}</text>
                    </g>
                    ${nodeSvg}
                </svg>
            </div>

            <div class="hamham-legend">
                ${Object.entries(RELATIONSHIP_TYPES).map(([k, r]) => 
                    `<span class="hamham-legend-item"><span class="hamham-legend-dot" style="background:${r.color}"></span>${r.label}</span>`
                ).join('')}
                <span class="hamham-legend-item" style="margin-left: auto;">Line thickness = bond</span>
            </div>

            <div class="hamham-const-detail" id="hamham-const-detail"></div>

            <div class="hamham-section-title">Adjust bond levels</div>
            <div class="hamham-list" id="hamham-bond-list">
                ${npcs.map(npc => {
                    const rel = RELATIONSHIP_TYPES[npc.relationship] || RELATIONSHIP_TYPES.neutral;
                    const bondPct = Math.min(100, (npc.bondLevel || 0) * 10);
                    return `<div class="hamham-list-item">
                        <span class="dot" style="background: ${rel.color}"></span>
                        <div style="flex: 1; min-width: 0;">
                            <div style="display: flex; justify-content: space-between; margin-bottom: 3px;">
                                <span class="name" style="font-size: 12px;">${escapeHtml(npc.name)}</span>
                                <span class="meta" style="font-size: 10px;">lv ${npc.bondLevel || 0}</span>
                            </div>
                            <div class="hamham-bond-bar"><div class="hamham-bond-fill" style="width: ${bondPct}%"></div></div>
                        </div>
                        <button class="hamham-btn small" data-bond-plus="${npc.id}" style="padding: 3px 8px; font-size: 11px;">+</button>
                        <button class="hamham-btn small" data-bond-minus="${npc.id}" style="padding: 3px 8px; font-size: 11px;">−</button>
                        <select class="hamham-select" data-rel-change="${npc.id}" style="padding: 3px 6px; font-size: 10.5px;">
                            ${Object.entries(RELATIONSHIP_TYPES).map(([k, r]) => `<option value="${k}" ${k === npc.relationship ? 'selected' : ''}>${r.label}</option>`).join('')}
                        </select>
                    </div>`;
                }).join('')}
            </div>
        </div>
    `);

    $('#hamham-content').on('click', '.hamham-const-node', function () {
        const id = $(this).data('npc-id');
        showNpcDetail(id);
    });
    $('#hamham-content').on('click', '[data-bond-plus]', function () {
        adjustBond($(this).data('bond-plus'), 1);
    });
    $('#hamham-content').on('click', '[data-bond-minus]', function () {
        adjustBond($(this).data('bond-minus'), -1);
    });
    $('#hamham-content').on('change', '[data-rel-change]', function () {
        changeRelationship($(this).data('rel-change'), $(this).val());
    });
}

function showNpcDetail(npcId) {
    const key = getCurrentCharacterKey();
    const data = getCharacterData(key);
    const npc = data.npcs.find(n => n.id === npcId);
    if (!npc) return;
    const rel = RELATIONSHIP_TYPES[npc.relationship] || RELATIONSHIP_TYPES.neutral;
    const loc = npc.locationId ? data.locations.find(l => l.id === npc.locationId) : null;
    const bondPct = Math.min(100, (npc.bondLevel || 0) * 10);
    const firstMetText = npc.firstMet ? new Date(npc.firstMet).toLocaleDateString() : '—';

    $('#hamham-const-detail').addClass('active').html(`
        <div class="top">
            <div class="avatar" style="background: ${rel.lightBg}; color: ${rel.darkText}">${escapeHtml((npc.name[0] || '?').toUpperCase())}</div>
            <div class="info">
                <div class="name">${escapeHtml(npc.name)}</div>
                <div class="sub">${rel.label}</div>
            </div>
        </div>
        <div class="rel-pill" style="background: ${rel.lightBg}; color: ${rel.darkText}">
            Bond with ${escapeHtml(getUserName())} · Level ${npc.bondLevel || 0}
        </div>
        <div class="hamham-bond-bar" style="margin-bottom: 10px;"><div class="hamham-bond-fill" style="width: ${bondPct}%; background: linear-gradient(90deg, ${rel.color}88, ${rel.color})"></div></div>
        <div class="stats"><span class="label">Mentions</span><span>${npc.mentions || 0}</span></div>
        <div class="stats"><span class="label">First met</span><span>${firstMetText}</span></div>
        <div class="stats"><span class="label">Location</span><span>${loc ? escapeHtml(loc.name) : 'Unknown'}</span></div>
        ${npc.lastQuote ? `<div style="margin-top: 8px; padding-top: 8px; border-top: 1px solid var(--hamham-border);"><div style="font-size: 10px; color: var(--hamham-gray-400); margin-bottom: 3px;">Latest</div><div style="font-size: 11px; font-style: italic; line-height: 1.45;">"${escapeHtml(npc.lastQuote.slice(0, 120))}"</div></div>` : ''}
    `);
}

function adjustBond(npcId, delta) {
    const key = getCurrentCharacterKey();
    const data = getCharacterData(key);
    const npc = data.npcs.find(n => n.id === npcId);
    if (!npc) return;
    npc.bondLevel = Math.max(0, Math.min(20, (npc.bondLevel || 0) + delta));
    touchCharacterData(key);
    renderConstellation();
    updateStats();
}

function changeRelationship(npcId, newRel) {
    const key = getCurrentCharacterKey();
    const data = getCharacterData(key);
    const npc = data.npcs.find(n => n.id === npcId);
    if (!npc) return;
    npc.relationship = newRel;
    touchCharacterData(key);
    renderConstellation();
}

/* ============================================
   Memory tab
   ============================================ */
function renderMemory() {
    const key = getCurrentCharacterKey();
    const data = getCharacterData(key);

    const memoryCards = data.memories.length ? `
        <div class="hamham-memory-grid">
            ${data.memories.map(mem => `
                <div class="hamham-memory-card" data-mem-id="${mem.id}">
                    <div class="header emo-${mem.emotion}"><span>${escapeHtml(mem.chapter || 'Scene')}</span></div>
                    <div class="body">
                        <div class="title">${escapeHtml(mem.title)}</div>
                        <div class="chars">${(mem.characters || []).slice(0, 4).map(c => `<div class="avatar">${escapeHtml((c[0]||'?').toUpperCase())}</div>`).join('')}</div>
                        <div class="quote">${mem.quote ? '"' + escapeHtml(mem.quote.slice(0, 80)) + '"' : '—'}</div>
                        <span class="tag emo-${mem.emotion}">${mem.emotion}</span>
                    </div>
                </div>
            `).join('')}
        </div>
    ` : `<div class="hamham-empty"><span class="icon">✿</span><div class="title">No memories yet</div><div>Add scene highlights as they happen</div></div>`;

    $('#hamham-content').html(`
        <div class="hamham-memory-wrap">
            <div class="hamham-add-row">
                <input class="hamham-input" id="hamham-new-mem-title" placeholder="Scene title" maxlength="60"/>
                <select class="hamham-select" id="hamham-new-mem-emotion">
                    ${EMOTION_TYPES.map(e => `<option value="${e}">${e}</option>`).join('')}
                </select>
                <button class="hamham-btn primary" id="hamham-add-mem-btn">Add</button>
            </div>
            <div class="hamham-add-row" style="margin-top: 6px;">
                <input class="hamham-input" id="hamham-new-mem-quote" placeholder="Key quote (optional)" maxlength="200"/>
                <input class="hamham-input" id="hamham-new-mem-chapter" placeholder="e.g. Ch 3" maxlength="20" style="flex: 0 0 90px;"/>
            </div>

            <div class="hamham-section-title">Scenes (${data.memories.length})</div>
            ${memoryCards}
        </div>
    `);

    $('#hamham-add-mem-btn').on('click', () => {
        const title = $('#hamham-new-mem-title').val().trim();
        const emotion = $('#hamham-new-mem-emotion').val();
        const quote = $('#hamham-new-mem-quote').val().trim();
        const chapter = $('#hamham-new-mem-chapter').val().trim();
        if (!title) return toast('Enter a title', 'warning');
        addMemory(title, emotion, quote, chapter);
    });
    $('#hamham-content').on('click', '.hamham-memory-card', function () {
        const id = $(this).data('mem-id');
        const mem = getCharacterData(key).memories.find(m => m.id === id);
        if (mem && confirm(`Delete memory "${mem.title}"?`)) {
            const d = getCharacterData(key);
            d.memories = d.memories.filter(m => m.id !== id);
            touchCharacterData(key);
            refreshPanel();
        }
    });
}

function addMemory(title, emotion, quote, chapter) {
    const key = getCurrentCharacterKey();
    const data = getCharacterData(key);
    const userName = getUserName();
    // Auto-detect characters mentioned in title
    const mentionedChars = [userName[0]];
    data.npcs.forEach(npc => {
        if (title.toLowerCase().includes(npc.name.toLowerCase())) mentionedChars.push(npc.name[0]);
    });
    data.memories.unshift({
        id: uid(),
        title,
        emotion: emotion || 'journey',
        quote: quote || '',
        chapter: chapter || '',
        characters: mentionedChars,
        timestamp: Date.now()
    });
    touchCharacterData(key);
    refreshPanel();
    toast(`Saved scene: ${title}`, 'success');
}

/* ============================================
   Atmosphere tab
   ============================================ */
function renderAtmosphere() {
    const s = getSettings();
    const current = s.atmosphere.effect || 'none';
    const intensity = s.atmosphere.intensity || 'medium';

    const cards = ATMOSPHERE_EFFECTS.map(e => `
        <div class="hamham-atmo-card ${current === e.id ? 'active' : ''}" data-effect="${e.id}">
            <div class="hamham-atmo-icon">${atmoIconSVG(e.id)}</div>
            <div class="hamham-atmo-info">
                <div class="name">${e.name}</div>
                <div class="desc">${e.desc}</div>
            </div>
        </div>
    `).join('');

    const intensityVal = intensity === 'subtle' ? 1 : intensity === 'dramatic' ? 3 : 2;

    $('#hamham-content').html(`
        <div class="hamham-atmosphere-wrap">
            <div class="hamham-section-title">Ambient effect</div>
            <div class="hamham-atmo-grid">${cards}</div>

            <div class="hamham-section-title">Intensity</div>
            <div class="hamham-slider-row">
                <label>${intensity}</label>
                <input type="range" class="hamham-slider" id="hamham-intensity" min="1" max="3" step="1" value="${intensityVal}"/>
            </div>

            <div class="hamham-section-title">Quick moods</div>
            <div class="hamham-atmo-grid">
                <div class="hamham-atmo-card" data-preset="romantic">
                    <div class="hamham-atmo-icon" style="background: var(--hamham-pink-50);">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="#D4537E"><path d="M12 21s-7-4.5-9-9c-1.5-3.5 1-7 4.5-7 2 0 3.5 1 4.5 2.5C13 6 14.5 5 16.5 5 20 5 22.5 8.5 21 12c-2 4.5-9 9-9 9z"/></svg>
                    </div>
                    <div class="hamham-atmo-info">
                        <div class="name">Romantic</div>
                        <div class="desc">Petals · dramatic</div>
                    </div>
                </div>
                <div class="hamham-atmo-card" data-preset="melancholy">
                    <div class="hamham-atmo-icon" style="background: #E6F1FB;">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="#378ADD"><path d="M12 2l3 6h-2v8h-2V8H9z"/><circle cx="6" cy="18" r="1.5"/><circle cx="12" cy="20" r="1.5"/><circle cx="18" cy="18" r="1.5"/></svg>
                    </div>
                    <div class="hamham-atmo-info">
                        <div class="name">Melancholy</div>
                        <div class="desc">Rain · medium</div>
                    </div>
                </div>
                <div class="hamham-atmo-card" data-preset="peaceful">
                    <div class="hamham-atmo-icon" style="background: var(--hamham-teal-50);">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#1D9E75" stroke-width="2"><circle cx="12" cy="12" r="8"/><path d="M8 12h8M12 8v8"/></svg>
                    </div>
                    <div class="hamham-atmo-info">
                        <div class="name">Peaceful</div>
                        <div class="desc">Dust · subtle</div>
                    </div>
                </div>
                <div class="hamham-atmo-card" data-preset="magical">
                    <div class="hamham-atmo-icon" style="background: var(--hamham-purple-50);">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="#7F77DD"><path d="M12 2l2 6 6 2-6 2-2 6-2-6-6-2 6-2z"/></svg>
                    </div>
                    <div class="hamham-atmo-info">
                        <div class="name">Magical</div>
                        <div class="desc">Fireflies · medium</div>
                    </div>
                </div>
            </div>

            <div class="hamham-section-title">About</div>
            <div style="font-size: 11.5px; color: var(--hamham-text-soft); line-height: 1.5; padding: 0 4px;">
                Ambient effects drift across the whole screen behind your chat. Choose a subtle setting for long sessions — or turn it up for dramatic moments.
            </div>
        </div>
    `);

    $('#hamham-content').on('click', '.hamham-atmo-card[data-effect]', function () {
        const effect = $(this).data('effect');
        setAtmosphere(effect);
    });
    $('#hamham-content').on('click', '.hamham-atmo-card[data-preset]', function () {
        const preset = $(this).data('preset');
        applyPreset(preset);
    });
    $('#hamham-content').on('input', '#hamham-intensity', function () {
        const v = parseInt($(this).val());
        const intensity = v === 1 ? 'subtle' : v === 3 ? 'dramatic' : 'medium';
        getSettings().atmosphere.intensity = intensity;
        save();
        $(this).prev('label').text(intensity);
        restartAtmosphere();
    });
}

function atmoIconSVG(id) {
    const icons = {
        none:      `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#888780" stroke-width="2"><circle cx="12" cy="12" r="9"/><line x1="5" y1="5" x2="19" y2="19"/></svg>`,
        petals:    `<svg width="20" height="20" viewBox="0 0 24 24" fill="#ED93B1"><circle cx="12" cy="9" r="3"/><circle cx="8" cy="13" r="3"/><circle cx="16" cy="13" r="3"/><circle cx="12" cy="17" r="3"/><circle cx="12" cy="13" r="1.5" fill="#FAC775"/></svg>`,
        rain:      `<svg width="20" height="20" viewBox="0 0 24 24" fill="#85B7EB"><path d="M6 4l2 6h-3zM12 4l2 6h-3zM18 4l2 6h-3zM6 14l2 6h-3zM13 14l2 6h-3z"/></svg>`,
        snow:      `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#B5D4F4" stroke-width="1.8"><path d="M12 2v20M2 12h20M5 5l14 14M19 5L5 19"/></svg>`,
        fireflies: `<svg width="20" height="20" viewBox="0 0 24 24" fill="#EF9F27"><circle cx="6" cy="8" r="2"/><circle cx="15" cy="6" r="1.5"/><circle cx="18" cy="14" r="2.5"/><circle cx="9" cy="16" r="1.5"/></svg>`,
        stars:     `<svg width="20" height="20" viewBox="0 0 24 24" fill="#7F77DD"><path d="M12 2l2 7 7 1-5 4 1 7-5-3-5 3 1-7-5-4 7-1z"/></svg>`,
        dust:      `<svg width="20" height="20" viewBox="0 0 24 24" fill="#FAC775"><circle cx="5" cy="6" r="1.5"/><circle cx="10" cy="10" r="1"/><circle cx="16" cy="7" r="1.8"/><circle cx="19" cy="13" r="1"/><circle cx="7" cy="15" r="1.2"/><circle cx="14" cy="17" r="1"/></svg>`
    };
    return icons[id] || icons.none;
}

function setAtmosphere(effect) {
    const s = getSettings();
    s.atmosphere.effect = effect;
    save();
    $('.hamham-atmo-card[data-effect]').removeClass('active');
    $(`.hamham-atmo-card[data-effect="${effect}"]`).addClass('active');
    restartAtmosphere();
}

function applyPreset(preset) {
    const presets = {
        romantic:   { effect: 'petals',    intensity: 'dramatic' },
        melancholy: { effect: 'rain',      intensity: 'medium' },
        peaceful:   { effect: 'dust',      intensity: 'subtle' },
        magical:    { effect: 'fireflies', intensity: 'medium' }
    };
    const p = presets[preset];
    if (!p) return;
    const s = getSettings();
    s.atmosphere = { ...s.atmosphere, ...p };
    save();
    renderAtmosphere();
    restartAtmosphere();
    toast(`Mood: ${preset}`, 'success');
}

/* ============================================
   Atmosphere canvas engine
   ============================================ */
function ensureAtmosphereCanvas() {
    if (atmosphereCanvas) return atmosphereCanvas;
    const canvas = document.createElement('canvas');
    canvas.id = 'hamham-atmo-canvas';
    document.body.appendChild(canvas);
    atmosphereCanvas = canvas;
    const resize = () => {
        canvas.width = window.innerWidth * (window.devicePixelRatio || 1);
        canvas.height = window.innerHeight * (window.devicePixelRatio || 1);
        canvas.style.width = window.innerWidth + 'px';
        canvas.style.height = window.innerHeight + 'px';
        const ctx = canvas.getContext('2d');
        ctx.setTransform(window.devicePixelRatio || 1, 0, 0, window.devicePixelRatio || 1, 0, 0);
    };
    resize();
    window.addEventListener('resize', resize);
    return canvas;
}

function restartAtmosphere() {
    stopAtmosphere();
    const s = getSettings();
    const effect = s.atmosphere.effect;
    if (!effect || effect === 'none') return;
    startAtmosphere(effect, s.atmosphere.intensity);
}

function stopAtmosphere() {
    if (atmosphereAnim) {
        cancelAnimationFrame(atmosphereAnim);
        atmosphereAnim = null;
    }
    atmosphereParticles = [];
    if (atmosphereCanvas) {
        const ctx = atmosphereCanvas.getContext('2d');
        ctx.clearRect(0, 0, atmosphereCanvas.width, atmosphereCanvas.height);
    }
}

function startAtmosphere(effect, intensity) {
    const canvas = ensureAtmosphereCanvas();
    const ctx = canvas.getContext('2d');
    const w = () => window.innerWidth;
    const h = () => window.innerHeight;

    const densityMap = { subtle: 0.5, medium: 1, dramatic: 1.8 };
    const density = densityMap[intensity] || 1;

    // Initialize particle pool
    atmosphereParticles = [];
    const counts = {
        petals: Math.floor(30 * density),
        rain: Math.floor(80 * density),
        snow: Math.floor(50 * density),
        fireflies: Math.floor(20 * density),
        stars: Math.floor(40 * density),
        dust: Math.floor(35 * density)
    };
    const count = counts[effect] || 30;
    for (let i = 0; i < count; i++) atmosphereParticles.push(createParticle(effect, w(), h(), true));

    function frame() {
        ctx.clearRect(0, 0, w(), h());
        atmosphereParticles.forEach(p => updateParticle(p, effect, w(), h(), ctx));
        atmosphereAnim = requestAnimationFrame(frame);
    }
    frame();
}

function createParticle(effect, w, h, initial) {
    const p = {
        x: Math.random() * w,
        y: initial ? Math.random() * h : -10,
        vx: 0, vy: 0,
        size: 0,
        rot: Math.random() * Math.PI * 2,
        vr: 0,
        life: 1,
        maxLife: 1,
        phase: Math.random() * Math.PI * 2
    };
    switch (effect) {
        case 'petals':
            p.size = 6 + Math.random() * 6;
            p.vy = 0.3 + Math.random() * 0.7;
            p.vx = (Math.random() - 0.5) * 0.5;
            p.vr = (Math.random() - 0.5) * 0.04;
            p.color = ['#F4C0D1', '#ED93B1', '#FBEAF0', '#D4537E'][Math.floor(Math.random() * 4)];
            break;
        case 'rain':
            p.size = 1 + Math.random() * 1.5;
            p.length = 10 + Math.random() * 10;
            p.vy = 8 + Math.random() * 5;
            p.vx = 1 + Math.random() * 1;
            break;
        case 'snow':
            p.size = 1.5 + Math.random() * 3;
            p.vy = 0.5 + Math.random() * 1.2;
            p.vx = (Math.random() - 0.5) * 0.5;
            break;
        case 'fireflies':
            p.x = Math.random() * w;
            p.y = Math.random() * h;
            p.size = 2 + Math.random() * 2;
            p.vx = (Math.random() - 0.5) * 0.4;
            p.vy = (Math.random() - 0.5) * 0.4;
            p.maxLife = 200 + Math.random() * 200;
            p.life = p.maxLife;
            break;
        case 'stars':
            p.x = Math.random() * w;
            p.y = Math.random() * h;
            p.size = 1 + Math.random() * 2;
            p.maxLife = 80 + Math.random() * 120;
            p.life = Math.random() * p.maxLife;
            break;
        case 'dust':
            p.x = Math.random() * w;
            p.y = Math.random() * h;
            p.size = 1 + Math.random() * 2;
            p.vx = (Math.random() - 0.5) * 0.3;
            p.vy = (Math.random() - 0.5) * 0.15 - 0.1;
            break;
    }
    return p;
}

function updateParticle(p, effect, w, h, ctx) {
    p.phase += 0.02;
    switch (effect) {
        case 'petals': {
            p.x += p.vx + Math.sin(p.phase) * 0.8;
            p.y += p.vy;
            p.rot += p.vr;
            if (p.y > h + 20) Object.assign(p, createParticle('petals', w, h, false));
            ctx.save();
            ctx.translate(p.x, p.y);
            ctx.rotate(p.rot);
            ctx.fillStyle = p.color;
            ctx.globalAlpha = 0.75;
            ctx.beginPath();
            ctx.ellipse(0, 0, p.size, p.size * 0.5, 0, 0, Math.PI * 2);
            ctx.ellipse(0, 0, p.size * 0.5, p.size, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
            ctx.globalAlpha = 1;
            break;
        }
        case 'rain': {
            p.x += p.vx;
            p.y += p.vy;
            if (p.y > h) { p.y = -p.length; p.x = Math.random() * w; }
            ctx.strokeStyle = 'rgba(149, 183, 235, 0.55)';
            ctx.lineWidth = p.size;
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(p.x - p.vx, p.y - p.length);
            ctx.stroke();
            break;
        }
        case 'snow': {
            p.x += p.vx + Math.sin(p.phase) * 0.5;
            p.y += p.vy;
            if (p.y > h + 5) Object.assign(p, createParticle('snow', w, h, false));
            ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            ctx.fill();
            break;
        }
        case 'fireflies': {
            p.x += p.vx;
            p.y += p.vy;
            p.life -= 1;
            if (p.life <= 0 || p.x < -10 || p.x > w + 10 || p.y < -10 || p.y > h + 10) {
                Object.assign(p, createParticle('fireflies', w, h, true));
            }
            const glow = (Math.sin(p.phase * 3) + 1) / 2;
            ctx.fillStyle = `rgba(239, 159, 39, ${0.3 + glow * 0.6})`;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size * (1 + glow * 0.5), 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = `rgba(250, 199, 117, ${0.15 + glow * 0.3})`;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size * (2 + glow), 0, Math.PI * 2);
            ctx.fill();
            break;
        }
        case 'stars': {
            p.life += 1;
            const phase = (p.life / p.maxLife) * Math.PI;
            const alpha = Math.sin(phase) * 0.9;
            if (p.life > p.maxLife) {
                p.x = Math.random() * w;
                p.y = Math.random() * h;
                p.life = 0;
            }
            ctx.fillStyle = `rgba(175, 169, 236, ${alpha})`;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = `rgba(175, 169, 236, ${alpha * 0.6})`;
            ctx.lineWidth = 0.5;
            ctx.beginPath();
            ctx.moveTo(p.x - p.size * 3, p.y);
            ctx.lineTo(p.x + p.size * 3, p.y);
            ctx.moveTo(p.x, p.y - p.size * 3);
            ctx.lineTo(p.x, p.y + p.size * 3);
            ctx.stroke();
            break;
        }
        case 'dust': {
            p.x += p.vx + Math.sin(p.phase * 0.5) * 0.2;
            p.y += p.vy;
            if (p.y < -5) Object.assign(p, createParticle('dust', w, h, false), { y: h + 5 });
            if (p.x < -5 || p.x > w + 5) Object.assign(p, createParticle('dust', w, h, false));
            ctx.fillStyle = `rgba(250, 199, 117, ${0.35 + Math.sin(p.phase) * 0.15})`;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            ctx.fill();
            break;
        }
    }
}

/* ============================================
   Auto bond analysis (simple keyword-based)
   ============================================ */
const KEYWORD_HINTS = {
    romance: ['love', 'kiss', 'heart', 'blush', 'คิดถึง', 'รัก', 'จูบ', 'หัวใจ', 'embrace'],
    enemy:   ['hate', 'fight', 'attack', 'kill', 'เกลียด', 'สู้', 'ฆ่า', 'โกรธ'],
    ally:    ['help', 'save', 'together', 'trust', 'ช่วย', 'เพื่อน', 'ร่วมมือ'],
    rival:   ['rival', 'compete', 'challenge', 'คู่แข่ง', 'แข่งขัน']
};

function analyzeMessageForBonds(messageText) {
    if (!messageText) return;
    const s = getSettings();
    if (!s.autoBond) return;
    const key = getCurrentCharacterKey();
    if (!key) return;
    const data = getCharacterData(key);
    if (!data.npcs.length) return;

    const text = messageText.toLowerCase();
    let changed = false;
    data.npcs.forEach(npc => {
        const nameLower = npc.name.toLowerCase();
        if (text.includes(nameLower)) {
            npc.mentions = (npc.mentions || 0) + 1;
            if (npc.mentions % 3 === 0) {
                npc.bondLevel = Math.min(20, (npc.bondLevel || 0) + 1);
            }
            // Extract a short quote near the NPC name
            const idx = text.indexOf(nameLower);
            const start = Math.max(0, idx - 20);
            const end = Math.min(messageText.length, idx + 80);
            const snippet = messageText.slice(start, end).trim();
            if (snippet.length > 5) npc.lastQuote = snippet;
            changed = true;
        }
    });

    if (changed) {
        touchCharacterData(key);
        if (getSettings().panelVisible) {
            updateStats();
            if (getSettings().currentTab === 'constellation' || getSettings().currentTab === 'atlas') {
                renderCurrentTab();
            }
        }
    }
}

/* ============================================
   Export / Import / Reset
   ============================================ */
function exportData() {
    const s = getSettings();
    const key = getCurrentCharacterKey();
    const payload = {
        app: 'HAMHAM',
        version: '1.0.0',
        exportedAt: new Date().toISOString(),
        scope: key ? 'character' : 'all',
        currentCharacter: key,
        characterName: getCurrentCharacterName(),
        data: key ? { [key]: s.characters[key] } : s.characters
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `hamham-${key ? getCurrentCharacterName().replace(/[^a-z0-9]/gi, '_') : 'all'}-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast('Exported', 'success');
}

function importData() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json';
    input.onchange = e => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = ev => {
            try {
                const parsed = JSON.parse(ev.target.result);
                if (!parsed || !parsed.data) throw new Error('Invalid file');
                if (!confirm('Import this data? Existing entries with the same character key will be overwritten.')) return;
                const s = getSettings();
                Object.assign(s.characters, parsed.data);
                save();
                refreshPanel();
                toast('Imported', 'success');
            } catch (err) {
                toast('Invalid file', 'error');
                console.error(err);
            }
        };
        reader.readAsText(file);
    };
    input.click();
}

function resetCurrentCharacter() {
    const key = getCurrentCharacterKey();
    if (!key) { toast('No character open', 'warning'); return; }
    const name = getCurrentCharacterName();
    if (!confirm(`Reset all HAMHAM data for "${name}"? This cannot be undone.`)) return;
    const s = getSettings();
    delete s.characters[key];
    save();
    refreshPanel();
    toast(`Reset ${name}`, 'success');
}

function resetAllData() {
    if (!confirm('Reset ALL HAMHAM data for every character? This cannot be undone.')) return;
    const s = getSettings();
    s.characters = {};
    save();
    refreshPanel();
    toast('All data cleared', 'success');
}

/* ============================================
   Utilities
   ============================================ */
function escapeHtml(str) {
    if (str == null) return '';
    return String(str).replace(/[&<>"']/g, c => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[c]);
}

/* ============================================
   Event handlers
   ============================================ */
function onChatChanged() {
    lastMessageCount = 0;
    refreshPanel();
}

function onMessageReceived() {
    try {
        const ctx = getContext();
        if (!ctx || !ctx.chat || !ctx.chat.length) return;
        const lastMsg = ctx.chat[ctx.chat.length - 1];
        if (lastMsg && !lastMsg.is_user && lastMsg.mes) {
            analyzeMessageForBonds(lastMsg.mes);
        }
    } catch (e) { /* ignore */ }
}

/* ============================================
   Initialization
   ============================================ */
async function loadSettingsUI() {
    try {
        const settingsHtml = await $.get(`${extensionFolderPath}/settings.html`);
        $("#extensions_settings2").append(settingsHtml);

        const s = getSettings();
        $('#hamham-toggle-icon').prop('checked', s.iconVisible);
        $('#hamham-toggle-autobond').prop('checked', s.autoBond);

        $('#hamham-toggle-icon').on('change', function () {
            const v = $(this).prop('checked');
            getSettings().iconVisible = v;
            save();
            setFloatingIconVisible(v);
            if (!v) closePanel();
        });
        $('#hamham-toggle-autobond').on('change', function () {
            getSettings().autoBond = $(this).prop('checked');
            save();
        });
        $('#hamham-open-panel-btn').on('click', openPanel);
        $('#hamham-reset-all-btn').on('click', resetAllData);
    } catch (error) {
        console.error(`[${extensionName}] Failed to load settings UI`, error);
    }
}

jQuery(async () => {
    console.log(`[${extensionName}] Loading v1.0.0...`);

    try {
        getSettings();

        await loadSettingsUI();

        mountFloatingIcon();
        const s = getSettings();
        setFloatingIconVisible(s.iconVisible);

        mountPanel();
        if (s.panelVisible) {
            $('#hamham-panel').removeClass('hamham-hidden');
            refreshPanel();
        }

        restartAtmosphere();

        if (eventSource && event_types) {
            if (event_types.CHAT_CHANGED) eventSource.on(event_types.CHAT_CHANGED, onChatChanged);
            if (event_types.MESSAGE_RECEIVED) eventSource.on(event_types.MESSAGE_RECEIVED, onMessageReceived);
            if (event_types.CHARACTER_MESSAGE_RENDERED) eventSource.on(event_types.CHARACTER_MESSAGE_RENDERED, onMessageReceived);
        }

        console.log(`[${extensionName}] ✿ Loaded successfully`);
    } catch (error) {
        console.error(`[${extensionName}] ❌ Failed to load:`, error);
    }
});
