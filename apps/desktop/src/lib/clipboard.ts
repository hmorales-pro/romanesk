/**
 * Helper clipboard — passe par le plugin Tauri en priorité, fallback
 * sur l'API navigator.clipboard si le plugin n'est pas dispo.
 *
 * Pourquoi : dans WKWebView Tauri (macOS), `navigator.clipboard.writeText`
 * peut échouer avec `NotAllowedError: The request is not allowed by the
 * user agent or the platform in the current context` parce que WebKit
 * considère que le contexte n'est pas suffisamment "secure" pour la
 * Clipboard API. Le plugin tauri-plugin-clipboard-manager passe par
 * les APIs natives (NSPasteboard sur macOS) et n'a pas ce souci.
 *
 * Le fallback navigator est gardé pour le cas où on lancerait l'app
 * dans un browser pur (mode dev web hors Tauri) — peu probable mais
 * pas coûteux à supporter.
 */

import { writeText as tauriWriteText } from "@tauri-apps/plugin-clipboard-manager";

export async function writeToClipboard(text: string): Promise<void> {
  try {
    await tauriWriteText(text);
  } catch (err) {
    // Si le plugin n'est pas chargé (mode web pur, dev hors Tauri),
    // on retombe sur l'API browser. Si elle échoue aussi, on relaie
    // l'erreur au caller pour qu'il l'affiche.
    if (
      typeof navigator !== "undefined" &&
      navigator.clipboard?.writeText
    ) {
      await navigator.clipboard.writeText(text);
      return;
    }
    throw err;
  }
}
