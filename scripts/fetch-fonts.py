#!/usr/bin/env python3
"""
Romanesk — fetch-fonts.py (P8.1)

Télécharge les trois familles de la charte (Cormorant Garamond,
Source Serif 4, JetBrains Mono) depuis Google Fonts et les dépose
dans `apps/desktop/public/fonts/` pour self-hosting.

Pourquoi self-host ?
  - Romanesk est local-first : l'app doit s'afficher correctement
    même hors ligne.
  - Pas de requête à fonts.gstatic.com → zéro trace réseau au boot.
  - Le bundle Tauri embarque les .woff2.

Usage :
  python3 scripts/fetch-fonts.py

Le script est idempotent — il ne re-télécharge pas un fichier
existant. Pour forcer un refresh, supprime apps/desktop/public/fonts/
avant de relancer.

On ne garde que les sous-ensembles `latin` et `latin-ext` (FR).
On déduplique les fichiers que Google Fonts sert plusieurs fois
(certains italics Cormorant 400/500 pointent sur le même woff2).
"""

from __future__ import annotations

import hashlib
import os
import re
import sys
import urllib.request
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
OUT_DIR = REPO_ROOT / "apps" / "desktop" / "public" / "fonts"

GOOGLE_CSS_URL = (
    "https://fonts.googleapis.com/css2?"
    "family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;1,400;1,500"
    "&family=Source+Serif+4:ital,opsz,wght@"
    "0,8..60,300;0,8..60,400;0,8..60,500;0,8..60,600;1,8..60,400"
    "&family=JetBrains+Mono:wght@400;500"
    "&display=swap"
)

# User-Agent moderne pour que Google sert du woff2
USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/605.1.15 (KHTML, like Gecko) "
    "Version/17.0 Safari/605.1.15"
)

KEEP_SUBSETS = {"latin", "latin-ext"}


def fetch_google_css() -> str:
    req = urllib.request.Request(GOOGLE_CSS_URL, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req) as resp:
        return resp.read().decode("utf-8")


def parse_blocks(css: str) -> list[tuple[str, str]]:
    """Découpe le CSS en (subset, block) — chaque @font-face est précédé
    d'un commentaire `/* subset */`."""
    blocks = re.split(r'(?=/\*\s*[\w-]+\s*\*/\s*@font-face)', css)
    out: list[tuple[str, str]] = []
    for block in blocks:
        block = block.strip()
        if not block:
            continue
        m = re.match(r'/\*\s*([\w-]+)\s*\*/', block)
        if m:
            out.append((m.group(1), block))
    return out


def filename_for(family: str, weight: str, style: str, subset: str) -> str:
    fam_slug = family.lower().replace(" ", "-")
    return f"{fam_slug}-{weight}-{style}-{subset}.woff2"


def main() -> int:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    print(f"→ {OUT_DIR}")
    print(f"→ {GOOGLE_CSS_URL[:80]}…")

    css = fetch_google_css()
    blocks = parse_blocks(css)

    rewritten: list[str] = []
    for subset, block in blocks:
        if subset not in KEEP_SUBSETS:
            continue
        m_url = re.search(r'url\((https://[^)]+\.woff2)\)', block)
        if not m_url:
            continue
        url = m_url.group(1)

        m_fam = re.search(r"font-family:\s*'([^']+)'", block)
        family = m_fam.group(1) if m_fam else "Unknown"
        m_w = re.search(r"font-weight:\s*(\d+)", block)
        m_s = re.search(r"font-style:\s*(\w+)", block)
        weight = m_w.group(1) if m_w else "400"
        style = m_s.group(1) if m_s else "normal"

        fname = filename_for(family, weight, style, subset)
        local_path = OUT_DIR / fname
        if not local_path.exists():
            print(f"  DL {fname}")
            urllib.request.urlretrieve(url, local_path)
        rewritten.append(block.replace(url, f"/fonts/{fname}"))

    # Déduplique les .woff2 identiques (Google sert le même fichier pour
    # plusieurs poids de polices variables / quasi-identiques).
    files = sorted(p for p in OUT_DIR.iterdir() if p.suffix == ".woff2")
    hash_to_canonical: dict[str, str] = {}
    fname_to_canonical: dict[str, str] = {}
    for path in files:
        h = hashlib.md5(path.read_bytes()).hexdigest()
        if h not in hash_to_canonical:
            hash_to_canonical[h] = path.name
        fname_to_canonical[path.name] = hash_to_canonical[h]

    removed = 0
    for path in files:
        canonical = fname_to_canonical[path.name]
        if path.name != canonical:
            path.unlink()
            removed += 1

    css_out = "\n\n".join(rewritten)

    def remap(match: re.Match) -> str:
        fname = os.path.basename(match.group(1))
        canonical = fname_to_canonical.get(fname, fname)
        return f"url(/fonts/{canonical})"

    css_out = re.sub(r'url\(/fonts/([^)]+\.woff2)\)', remap, css_out)

    header = (
        "/*\n"
        " * Romanesk — fonts self-hosted (P8.1).\n"
        " * Cormorant Garamond, Source Serif 4, JetBrains Mono.\n"
        " * Variantes latin + latin-ext uniquement (FR).\n"
        " * Auto-générée — ne pas éditer à la main.\n"
        " * Régénérer via : python3 scripts/fetch-fonts.py\n"
        " */\n\n"
    )
    (OUT_DIR / "fonts.css").write_text(header + css_out + "\n", encoding="utf-8")

    remaining = sum(p.stat().st_size for p in OUT_DIR.iterdir() if p.suffix == ".woff2")
    print(f"=== {len(rewritten)} @font-face blocs · {removed} doublons supprimés ===")
    print(f"=== Total woff2 : {remaining // 1024} KB ===")
    return 0


if __name__ == "__main__":
    sys.exit(main())
