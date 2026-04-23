# 🐹 HAMHAM ✿ Living World Memory

> A cute, per-character persistent world tracker for SillyTavern.  
> Remember every NPC, every location, every relationship — across **every bot you play**.

HAMHAM floats as a tiny hamster icon in the corner of your screen. Tap it, and the whole world of whichever character you're currently chatting with appears: an interactive map, a constellation of relationships centered on **you** (`{{user}}`), a scene timeline, and optional ambient effects (sakura petals, gentle rain, fireflies, and more).

Every bot has its own private world. Switch characters → HAMHAM swaps instantly. Switch back 3 months later → everything is exactly where you left it.

## ✿ Features

### 🗺️ Atlas
An illustrated map with cute drawn terrain (forests, mountains, lakes, castles, villages, flower gardens, caves, beaches). Pin NPCs to locations; their color shows relationship type. Click a pin to see who they are.

### 🕸️ Bonds (Constellation)
A relationship web centered on **`{{user}}`** — not the character. Every NPC orbits you. Closer = stronger bond. Line color = relationship type. Line thickness = bond strength. Click a node to see full details, adjust bond levels, or change relationship types.

### 📜 Memory Palace
Save key scenes as cute cards with emotion tags (romance, battle, mystery, victory, journey). Each card holds a title, chapter marker, quote, and characters involved.

### 🌸 Mood (Atmosphere)
Full-screen ambient overlays that drift behind your chat:
- **Sakura petals** — soft pink flowers falling and rotating
- **Gentle rain** — light angled raindrops
- **Snow** — quiet drifting flakes
- **Fireflies** — warm pulsing glows
- **Starfall** — twinkling sparkles
- **Dust motes** — floating warm specks

Plus quick presets: *Romantic*, *Melancholy*, *Peaceful*, *Magical*.

### 🪄 Auto-bond tracking
When enabled, HAMHAM scans incoming AI messages and automatically:
- Increments `mentions` count for NPCs named in the message
- Bumps `bondLevel` every 3 mentions
- Captures a short quote snippet near the NPC's name

Supports both English and Thai keyword detection.

## 📥 Installation

1. Open SillyTavern
2. Go to **Extensions** (plug icon)
3. Click **Install extension**
4. Paste:
   ```
   https://github.com/chonnicha7075-creator/Hamham
   ```
5. Refresh the page

You'll see the 🐹 hamster icon appear in the bottom-right. Tap it to open HAMHAM.

## 🎮 Usage

### First time with a new character
1. Open the chat you want to track
2. Tap the hamster icon
3. Go to **Atlas** → add a few locations
4. Add NPCs and assign them to locations
5. That's it. HAMHAM remembers everything from here.

### Switching between bots
Just open a different chat. HAMHAM auto-detects and swaps to that character's world. The stats header shows which character you're currently tracking.

### Adjusting relationships
Go to **Bonds** tab → use + / − buttons to adjust bond levels, or the dropdown to change relationship type (Romance, Ally, Friend, Rival, Enemy, Neutral).

### Saving a memorable scene
Go to **Memories** tab → type a title, pick an emotion, optionally add a quote and chapter marker → hit Add.

### Customizing atmosphere
Go to **Mood** tab → pick an effect and intensity. Effects run across your entire browser window, behind everything else.

## ⚙️ Extension settings

Open **Extensions → HAMHAM ✿ Living World Memory** drawer for:

- **Show floating icon** — hide the corner hamster if you want
- **Auto-update bonds** — toggle automatic mention tracking
- **Open HAMHAM panel** — manually open the main panel
- **Reset all** — nuke everything (every character's data)
- **About** — version info and GitHub link

## 💾 Data storage

All data lives in SillyTavern's `settings.json` under `extension_settings.Hamham.characters`, keyed by character `avatar` filename. This means:

- ✓ Stable across SillyTavern sessions
- ✓ Survives renames (avatar filename doesn't change)
- ✓ Ported with your SillyTavern backup
- ✗ Not synced to cloud — use **Export** to JSON for manual backups

## 🎨 Customization

The Strawberry Victorian Dream theme lives in `style.css`. Every color, radius, and animation uses CSS variables at the top — tweak `--hamham-pink-*` stops to shift the palette.

## 📝 Data model

```js
extension_settings.Hamham = {
  iconVisible: true,
  autoBond: true,
  panelVisible: false,
  currentTab: 'atlas',
  iconPos: { right: 24, bottom: 80 },
  atmosphere: { effect: 'petals', intensity: 'medium' },
  characters: {
    'Natsume.png': {
      locations: [{ id, name, type, x, y }],
      npcs:      [{ id, name, relationship, bondLevel, locationId, firstMet, mentions, lastQuote }],
      memories:  [{ id, title, emotion, quote, chapter, characters, timestamp }],
      created, lastUpdated
    }
  }
}
```

## 🛠️ Troubleshooting

**The hamster icon isn't showing up**  
Go to Extensions → HAMHAM settings → toggle "Show floating icon" on.

**Nothing happens when I change characters**  
Make sure you actually opened a different *chat* (not just switched tabs in ST). HAMHAM listens to `CHAT_CHANGED` events.

**The atmosphere effect is too distracting**  
Drop intensity to "subtle" or switch to "None".

**Auto-bond isn't finding my NPCs**  
Keyword matching is exact-substring (case-insensitive). If your NPC is called "Reiko" but the AI writes "Rei-chan", it won't match. Manual + / − always works.

## 🗺️ Roadmap ideas

- Drag-to-reposition for map pins
- Per-NPC avatar portraits (upload PNG)
- Auto-generate memory cards from AI summaries
- Group chat support with per-member tracking
- Timeline export to scrapbook HTML
- Character sheet editor (custom stats)

## 📜 License

MIT — Do not modify, resell, or use this product commercially. 

## 🌹 Credits

Built to pair with the **ROSE ENGINE** system prompt ecosystem.  
Theme: *Strawberry Victorian Dream*.  
Author: [@chonnicha7075-creator](https://github.com/chonnicha7075-creator)

---

*A small hamster keeping track of your entire fictional world, so you don't have to.* 🐹✿
