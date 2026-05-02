/**
 * Le vrai entry point est dans `main.tsx` (router + QueryClientProvider).
 * Ce fichier est conservé pour ne pas casser une éventuelle référence
 * `import App from "./App"` venant d'un outillage. Il ré-exporte le
 * Layout pour rester utile et pas déclencher d'avertissement.
 */
export { default } from "./components/Layout";
