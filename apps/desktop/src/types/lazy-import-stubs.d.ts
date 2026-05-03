/**
 * Stubs minimaux pour les libs chargées en lazy import (P7.4).
 *
 * Les types complets seront fournis par les vrais paquets dès que Hugo
 * fait `pnpm install`. En attendant, on déclare juste assez pour que le
 * typecheck passe dans la sandbox CI où ces deps ne sont pas installées.
 *
 * Ces déclarations sont volontairement larges — `any` est acceptable ici
 * parce que les vrais types prendront le dessus dès qu'ils sont
 * disponibles via tsc moduleResolution.
 */

declare module "mammoth" {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mammoth: any;
  export default mammoth;
}

declare module "pdfjs-dist" {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export const GlobalWorkerOptions: { workerSrc: any };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export function getDocument(args: any): { promise: Promise<any> };
}

declare module "pdfjs-dist/build/pdf.worker.min.mjs?url" {
  const src: string;
  export default src;
}
