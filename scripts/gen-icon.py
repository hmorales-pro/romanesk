#!/usr/bin/env python3
"""Génère l'icône Romanesk : sigillum bordeaux centré sur squircle paper crème.
Charte § 02 + § 07.
"""

from PIL import Image, ImageDraw
from pathlib import Path

PAPER = (244, 236, 220, 255)
BORDEAUX = (122, 42, 38, 255)
LINE_FAINT = (122, 42, 38, 102)  # bordeaux à 40%

OUT_DIR = Path("/sessions/peaceful-great-keller/mnt/romanesk/apps/desktop/src-tauri/icons")
OUT_DIR.mkdir(parents=True, exist_ok=True)


def draw_sigillum(size: int) -> Image.Image:
    """Render à 4× la taille cible puis Lanczos downsample."""
    UP = 4
    s = size * UP
    img = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # Squircle paper crème (rounded rect, radius ~22% style macOS).
    r = int(s * 0.2237)
    draw.rounded_rectangle((0, 0, s - 1, s - 1), radius=r, fill=PAPER)

    cx = cy = s // 2
    sigil_r = int(s * 0.260)
    stroke = max(2, int(s * 0.0058))
    stroke_faint = max(1, int(s * 0.0029))

    # 1) Lignes faint : on les dessine sur un calque temporaire RGBA, puis
    #    on alpha_composite. Pas de mask — les lignes sont déjà cantonnées
    #    aux bornes [-sigil_r, +sigil_r] qui rentre exactement dans le cercle.
    lines_layer = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    ld = ImageDraw.Draw(lines_layer)
    # Vertical
    ld.line([(cx, cy - sigil_r), (cx, cy + sigil_r)],
            fill=LINE_FAINT, width=stroke_faint)
    # Horizontal
    ld.line([(cx - sigil_r, cy), (cx + sigil_r, cy)],
            fill=LINE_FAINT, width=stroke_faint)
    # Diagonale \\ (limitée à sigil_r * cos(45°))
    d = sigil_r * 0.707
    ld.line([(cx - d, cy - d), (cx + d, cy + d)],
            fill=LINE_FAINT, width=stroke_faint)
    # Diagonale /
    ld.line([(cx + d, cy - d), (cx - d, cy + d)],
            fill=LINE_FAINT, width=stroke_faint)
    img.alpha_composite(lines_layer)

    # 2) Grand cercle outline bordeaux
    bbox = (cx - sigil_r, cy - sigil_r, cx + sigil_r, cy + sigil_r)
    draw.ellipse(bbox, outline=BORDEAUX, width=stroke)

    # 3) Pupille pleine bordeaux (3.2/12 du sigil_r)
    pupil_r = int(sigil_r * (3.2 / 12))
    draw.ellipse(
        (cx - pupil_r, cy - pupil_r, cx + pupil_r, cy + pupil_r),
        fill=BORDEAUX,
    )

    return img.resize((size, size), Image.LANCZOS)


sizes = {
    "icon.png": 1024,
    "32x32.png": 32,
    "128x128.png": 128,
    "128x128@2x.png": 256,
}

for name, size in sizes.items():
    img = draw_sigillum(size)
    img.save(OUT_DIR / name, "PNG")
    print(f"  → {name} ({size}×{size})")

ico_img = draw_sigillum(256)
ico_img.save(
    OUT_DIR / "icon.ico", "ICO",
    sizes=[(16, 16), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)],
)
print(f"  → icon.ico (multi-res)")
