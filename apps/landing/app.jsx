// Romanesk — Tweaks panel + light interactivity

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "palette": "papier",
  "tagline": "principal",
  "fontPair": "cormorant-source",
  "dark": false,
  "motion": true,
  "density": "regular"
}/*EDITMODE-END*/;

const PALETTES = {
  papier: {
    label: "Papier · bordeaux",
    swatches: ["#f0e6d2", "#1d1916", "#7a2a26"],
    vars: {
      "--paper":        "oklch(0.962 0.012 80)",
      "--paper-deep":   "oklch(0.928 0.018 78)",
      "--paper-shade":  "oklch(0.895 0.022 76)",
      "--ink":          "oklch(0.185 0.018 60)",
      "--ink-soft":     "oklch(0.36 0.014 60)",
      "--ink-faint":    "oklch(0.55 0.010 60)",
      "--rule":         "oklch(0.82 0.014 72)",
      "--rule-soft":    "oklch(0.88 0.012 74)",
      "--bordeaux":     "oklch(0.42 0.115 22)",
      "--bordeaux-deep":"oklch(0.32 0.105 22)",
      "--ocre":         "oklch(0.62 0.115 70)",
      "--ivy":          "oklch(0.40 0.060 145)"
    }
  },
  forest: {
    label: "Vélin · forêt",
    swatches: ["#ece6d8", "#1c2118", "#2d5538"],
    vars: {
      "--paper":        "oklch(0.952 0.014 95)",
      "--paper-deep":   "oklch(0.918 0.018 92)",
      "--paper-shade":  "oklch(0.885 0.020 90)",
      "--ink":          "oklch(0.20 0.018 145)",
      "--ink-soft":     "oklch(0.36 0.018 140)",
      "--ink-faint":    "oklch(0.55 0.012 130)",
      "--rule":         "oklch(0.82 0.014 110)",
      "--rule-soft":    "oklch(0.88 0.012 108)",
      "--bordeaux":     "oklch(0.40 0.085 150)",
      "--bordeaux-deep":"oklch(0.30 0.070 150)",
      "--ocre":         "oklch(0.60 0.110 80)",
      "--ivy":          "oklch(0.42 0.090 160)"
    }
  },
  prussian: {
    label: "Ivoire · Prusse",
    swatches: ["#f0e9d8", "#0f1c2e", "#b88a3c"],
    vars: {
      "--paper":        "oklch(0.957 0.015 90)",
      "--paper-deep":   "oklch(0.920 0.018 88)",
      "--paper-shade":  "oklch(0.890 0.022 86)",
      "--ink":          "oklch(0.20 0.05 250)",
      "--ink-soft":     "oklch(0.38 0.045 250)",
      "--ink-faint":    "oklch(0.56 0.030 245)",
      "--rule":         "oklch(0.82 0.018 240)",
      "--rule-soft":    "oklch(0.88 0.014 240)",
      "--bordeaux":     "oklch(0.34 0.110 250)",
      "--bordeaux-deep":"oklch(0.26 0.100 250)",
      "--ocre":         "oklch(0.66 0.115 78)",
      "--ivy":          "oklch(0.44 0.080 175)"
    }
  },
  bichrome: {
    label: "Bichromie",
    swatches: ["#f4f1ea", "#0f0f0e", "#666"],
    vars: {
      "--paper":        "oklch(0.965 0.005 80)",
      "--paper-deep":   "oklch(0.935 0.005 80)",
      "--paper-shade":  "oklch(0.905 0.005 80)",
      "--ink":          "oklch(0.15 0.005 60)",
      "--ink-soft":     "oklch(0.40 0.005 60)",
      "--ink-faint":    "oklch(0.62 0.005 60)",
      "--rule":         "oklch(0.85 0.005 70)",
      "--rule-soft":    "oklch(0.90 0.005 72)",
      "--bordeaux":     "oklch(0.20 0.005 60)",
      "--bordeaux-deep":"oklch(0.10 0.005 60)",
      "--ocre":         "oklch(0.50 0.005 60)",
      "--ivy":          "oklch(0.45 0.005 60)"
    }
  }
};

const TAGLINES = {
  principal: {
    head: ['L\u2019atelier d\u2019\u00e9criture ', { em: 'qui pense avec toi.' }],
    sub: 'Construis un univers, \u00e9cris-le sur des centaines de pages, dialogue avec une IA qui conna\u00eet ton lore \u2014 sans qu\u2019une seule ligne ne quitte ta machine.'
  },
  fiction: {
    head: ['L\u2019\u00e9criture fictionnelle, ', { em: 'augment\u00e9e et priv\u00e9e.' }],
    sub: 'Une IA qui lit ton univers et le respecte. Une base SQLite sur ton disque. Pas de cloud, pas de compte, pas de redevance.'
  },
  univers: {
    head: ['Construis un univers. ', { em: '\u00c9cris-le. Garde-le.' }],
    sub: 'Six types de fiches polymorphes, un \u00e9diteur multi-chapitres, une m\u00e9moire vivante du lore. Tout tourne sur ta machine via Ollama.'
  },
  worldbuilding: {
    head: ['Worldbuilding et roman, ', { em: 'dans un seul outil local.' }],
    sub: 'Romanesk r\u00e9unit la construction d\u2019univers et la r\u00e9daction longue dans un m\u00eame atelier \u2014 avec une IA en sparring partner, hors ligne.'
  },
  machine: {
    head: ['Ton univers. Ton manuscrit. ', { em: 'Ta machine.' }],
    sub: 'Romanesk est local-first par construction. Ton manuscrit ne finira pas dans un dataset \u2014 il restera o\u00f9 tu l\u2019as \u00e9crit.'
  }
};

const FONT_PAIRS = {
  "cormorant-source": {
    label: "Cormorant + Source Serif",
    display: '"Cormorant Garamond", "EB Garamond", Georgia, serif',
    body:    '"Source Serif 4", "Source Serif Pro", Georgia, serif'
  },
  "playfair-lora": {
    label: "Playfair + Lora",
    display: '"Playfair Display", Georgia, serif',
    body:    '"Lora", Georgia, serif'
  },
  "ebgaramond-only": {
    label: "EB Garamond seul",
    display: '"EB Garamond", Georgia, serif',
    body:    '"EB Garamond", Georgia, serif'
  },
  "spectral-spectral": {
    label: "Spectral",
    display: '"Spectral", Georgia, serif',
    body:    '"Spectral", Georgia, serif'
  }
};

// Inject the additional Google Fonts on demand
const FONT_HREFS = {
  "playfair-lora": "https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,500;0,600;1,500&family=Lora:ital,wght@0,400;0,500;1,400&display=swap",
  "ebgaramond-only": "https://fonts.googleapis.com/css2?family=EB+Garamond:ital,wght@0,400;0,500;1,400;1,500&display=swap",
  "spectral-spectral": "https://fonts.googleapis.com/css2?family=Spectral:ital,wght@0,300;0,400;0,500;1,400&display=swap"
};
const loadedFonts = new Set();
function ensureFont(key) {
  if (loadedFonts.has(key)) return;
  const href = FONT_HREFS[key];
  if (!href) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = href;
  document.head.appendChild(link);
  loadedFonts.add(key);
}

function applyPalette(key) {
  const pal = PALETTES[key] || PALETTES.papier;
  const root = document.documentElement;
  for (const [k, v] of Object.entries(pal.vars)) root.style.setProperty(k, v);
}

function applyDark(dark) {
  document.documentElement.classList.toggle('dark', !!dark);
}

function applyMotion(on) {
  document.documentElement.classList.toggle('no-motion', !on);
}

function applyDensity(d) {
  const root = document.documentElement;
  if (d === 'compact') {
    root.style.setProperty('--section-y', 'clamp(56px, 7vw, 110px)');
  } else if (d === 'comfy') {
    root.style.setProperty('--section-y', 'clamp(100px, 14vw, 200px)');
  } else {
    root.style.removeProperty('--section-y');
  }
}

function applyFontPair(key) {
  ensureFont(key);
  const pair = FONT_PAIRS[key] || FONT_PAIRS["cormorant-source"];
  document.documentElement.style.setProperty('--serif-display', pair.display);
  document.documentElement.style.setProperty('--serif-body', pair.body);
}

function applyTagline(key) {
  const t = TAGLINES[key] || TAGLINES.principal;
  const h = document.getElementById('hero-tagline');
  const s = document.getElementById('hero-sub');
  if (!h || !s) return;
  h.innerHTML = '';
  for (const part of t.head) {
    if (typeof part === 'string') {
      h.appendChild(document.createTextNode(part));
    } else if (part && part.em) {
      const span = document.createElement('span');
      span.className = 'em';
      span.textContent = part.em;
      h.appendChild(span);
    }
  }
  s.textContent = t.sub;
}

function App() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);

  React.useEffect(() => { applyPalette(t.palette); }, [t.palette]);
  React.useEffect(() => { applyDark(t.dark); }, [t.dark]);
  React.useEffect(() => { applyMotion(t.motion); }, [t.motion]);
  React.useEffect(() => { applyDensity(t.density); }, [t.density]);
  React.useEffect(() => { applyFontPair(t.fontPair); }, [t.fontPair]);
  React.useEffect(() => { applyTagline(t.tagline); }, [t.tagline]);

  const paletteSwatches = Object.entries(PALETTES).map(([k, v]) => v.swatches);
  const paletteKeys = Object.keys(PALETTES);
  const currentPaletteIndex = paletteKeys.indexOf(t.palette);

  return (
    <TweaksPanel title="Tweaks">
      <TweakSection label="Direction" />
      <TweakSelect
        label="Palette"
        value={t.palette}
        options={paletteKeys.map(k => ({ value: k, label: PALETTES[k].label }))}
        onChange={(v) => setTweak('palette', v)}
      />
      <TweakSelect
        label="Pairing typo"
        value={t.fontPair}
        options={Object.keys(FONT_PAIRS).map(k => ({ value: k, label: FONT_PAIRS[k].label }))}
        onChange={(v) => setTweak('fontPair', v)}
      />
      <TweakRadio
        label="Densité"
        value={t.density}
        options={['compact', 'regular', 'comfy']}
        onChange={(v) => setTweak('density', v)}
      />
      <TweakToggle label="Mode sombre" value={t.dark} onChange={(v) => setTweak('dark', v)} />
      <TweakToggle label="Animations hero" value={t.motion} onChange={(v) => setTweak('motion', v)} />

      <TweakSection label="Tagline" />
      <TweakSelect
        label="Variante"
        value={t.tagline}
        options={[
          { value: 'principal', label: 'L\u2019atelier qui pense' },
          { value: 'fiction', label: 'Augment\u00e9e et priv\u00e9e' },
          { value: 'univers', label: 'Construis. \u00c9cris. Garde.' },
          { value: 'worldbuilding', label: 'Worldbuilding + roman' },
          { value: 'machine', label: 'Ton univers. Ta machine.' }
        ]}
        onChange={(v) => setTweak('tagline', v)}
      />
    </TweaksPanel>
  );
}

const root = ReactDOM.createRoot(document.getElementById('tweaks-root'));
root.render(<App />);

// ─────────────────────────────────────────────────────────────────────────────
// Light interactivity outside the React island

// Drop-zone visual feedback
(() => {
  const dz = document.getElementById('dropzone');
  if (!dz) return;
  const stop = (e) => { e.preventDefault(); e.stopPropagation(); };
  ['dragenter', 'dragover'].forEach(ev => dz.addEventListener(ev, (e) => {
    stop(e); dz.classList.add('is-drag');
  }));
  ['dragleave', 'drop'].forEach(ev => dz.addEventListener(ev, (e) => {
    stop(e); dz.classList.remove('is-drag');
  }));
})();

// Smooth scroll for in-page anchors
document.querySelectorAll('a[href^="#"]').forEach(a => {
  a.addEventListener('click', (e) => {
    const id = a.getAttribute('href').slice(1);
    if (!id) return;
    const target = document.getElementById(id);
    if (!target) return;
    e.preventDefault();
    window.scrollTo({ top: target.getBoundingClientRect().top + window.scrollY - 60, behavior: 'smooth' });
  });
});
