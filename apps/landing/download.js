/**
 * download.js — smart download buttons (P15.7)
 *
 * Sans build, sans framework : un petit module IIFE qui fait deux choses
 * au chargement de la page :
 *
 *   1. Détecte l'OS de l'utilisateur (navigator.userAgentData →
 *      navigator.platform → user-agent) et reformule les libellés des
 *      boutons CTA en conséquence (macOS Apple Silicon par défaut sur
 *      Mac, NSIS exe sur Windows, AppImage sur Linux).
 *
 *   2. Fetch GitHub pour récupérer la dernière release publiée et
 *      remplace les `href` génériques par les vrais assets téléchargeables.
 *      Si le fetch échoue (offline, rate limit, repo privé), on garde
 *      les `href="releases/latest"` qui amènent l'utilisateur sur la
 *      page des releases — il choisira manuellement.
 *
 * Tout est non-bloquant : le HTML statique est déjà parfaitement
 * fonctionnel sans JS, ce script ne fait qu'enjoliver.
 */

(function () {
  const OWNER = "hmorales-pro";
  const REPO = "romanesk";
  const RELEASES_PAGE = `https://github.com/${OWNER}/${REPO}/releases/latest`;

  // ── 1. OS detection ──────────────────────────────────────────────

  function detectOs() {
    // userAgentData est la moderne, mais pas supportée partout.
    const uaData = navigator.userAgentData;
    if (uaData && uaData.platform) {
      const p = uaData.platform.toLowerCase();
      if (p.includes("mac")) return guessMacArch();
      if (p.includes("win")) return "windows";
      if (p.includes("linux")) return "linux";
    }
    // Fallback user-agent classique.
    const ua = (navigator.userAgent || "").toLowerCase();
    if (ua.includes("mac")) return guessMacArch();
    if (ua.includes("windows")) return "windows";
    if (ua.includes("linux") && !ua.includes("android")) return "linux";
    return "unknown";
  }

  // Détection grossière Apple Silicon vs Intel : pas de moyen fiable
  // côté JS, on suppose ARM si le user-agent contient "arm" (rare) ou
  // si on est sur Safari + macOS post-2021. À défaut, on propose
  // Apple Silicon par défaut (la majorité des Mac vendus depuis 2021).
  function guessMacArch() {
    const ua = (navigator.userAgent || "").toLowerCase();
    if (ua.includes("intel mac os x") && !ua.includes("arm64")) {
      // Safari trimme cette info — quasi tous les Mac sont signalés
      // "Intel Mac OS X" même sur ARM. On reste sur "mac" générique.
      return "mac";
    }
    return "mac";
  }

  // ── 2. Buttons relabel ───────────────────────────────────────────

  const OS_LABELS = {
    mac: {
      primary: "Télécharger pour macOS",
      secondary: "Windows · Linux",
    },
    windows: {
      primary: "Télécharger pour Windows",
      secondary: "macOS · Linux",
    },
    linux: {
      primary: "Télécharger pour Linux",
      secondary: "macOS · Windows",
    },
    unknown: {
      primary: "Télécharger",
      secondary: "Toutes les plateformes",
    },
  };

  function relabelButtons(os) {
    const labels = OS_LABELS[os] || OS_LABELS.unknown;
    document.querySelectorAll("[data-dl-primary]").forEach((el) => {
      // On garde la flèche ↓ qui est dans un <span class="arr">.
      const arrow = el.querySelector(".arr");
      const arrowHtml = arrow ? arrow.outerHTML : "";
      el.innerHTML = `${labels.primary}&nbsp;${arrowHtml}`;
    });
    document.querySelectorAll("[data-dl-secondary]").forEach((el) => {
      el.textContent = labels.secondary;
    });
  }

  // ── 3. Fetch GitHub release + cabler les bons assets ─────────────

  // Heuristiques pour identifier les assets dans les noms tauri-action.
  // Patterns Tauri 2 par défaut :
  //   Romanesk_<ver>_x64.dmg            → macOS Intel
  //   Romanesk_<ver>_aarch64.dmg        → macOS Apple Silicon
  //   Romanesk_<ver>_x64-setup.exe      → Windows NSIS
  //   Romanesk_<ver>_x64_en-US.msi      → Windows WiX
  //   romanesk_<ver>_amd64.AppImage     → Linux AppImage
  //   romanesk_<ver>_amd64.deb          → Linux deb
  function pickAssetUrl(assets, os) {
    if (!assets || !assets.length) return null;
    const find = (re) => {
      const m = assets.find((a) => re.test(a.name));
      return m ? m.browser_download_url : null;
    };
    if (os === "mac") {
      // Préférer aarch64 (Apple Silicon majoritaire depuis 2021).
      return (
        find(/aarch64.*\.dmg$/i) || find(/\.dmg$/i) || find(/aarch64.*\.app/i)
      );
    }
    if (os === "windows") {
      return find(/setup\.exe$/i) || find(/\.msi$/i) || find(/\.exe$/i);
    }
    if (os === "linux") {
      return find(/\.AppImage$/i) || find(/\.deb$/i);
    }
    return null;
  }

  async function fetchLatest(os) {
    try {
      const res = await fetch(
        `https://api.github.com/repos/${OWNER}/${REPO}/releases/latest`,
        { headers: { Accept: "application/vnd.github+json" } },
      );
      if (!res.ok) return; // 404 si pas encore de release publique
      const data = await res.json();
      const tag = data.tag_name || data.name || "v0.6.0";
      const date = data.published_at ? formatDate(data.published_at) : null;

      // Update la petite mention de version.
      document.querySelectorAll("[data-release-line]").forEach((el) => {
        el.textContent = date
          ? `${tag} — ${date} · code consultable`
          : `${tag} · code consultable`;
      });

      // Câble le bouton primary sur l'asset OS-spécifique si trouvé.
      const url = pickAssetUrl(data.assets, os);
      if (url) {
        document.querySelectorAll("[data-dl-primary]").forEach((el) => {
          el.setAttribute("href", url);
        });
      }
    } catch {
      // Silencieux : on garde le fallback releases/latest.
    }
  }

  function formatDate(iso) {
    try {
      const d = new Date(iso);
      return d.toLocaleDateString("fr-FR", {
        day: "numeric",
        month: "long",
        year: "numeric",
      });
    } catch {
      return null;
    }
  }

  // ── 4. Run ───────────────────────────────────────────────────────

  function init() {
    const os = detectOs();
    relabelButtons(os);
    void fetchLatest(os);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
