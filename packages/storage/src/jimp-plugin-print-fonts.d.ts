// @jimp/plugin-print ships a "./fonts" subpath export (its package.json's
// exports map) that tsc's "node" moduleResolution can't see — it works
// fine at runtime (Node resolves it directly), this just satisfies tsc
// without switching the whole repo to "node16"/"bundler" resolution.
declare module "@jimp/plugin-print/fonts" {
  export const SANS_16_WHITE: string;
  export const SANS_32_WHITE: string;
}
