declare module '@foliojs-fork/fontkit' {
  interface Font { hasGlyphForCodePoint(cp: number): boolean }
  const fontkit: { openSync(path: string): Font };
  export default fontkit;
}
