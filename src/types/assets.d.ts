// Metro asset modules (see metro.config.js): requiring one yields an asset registry id.
declare module '*.html' {
  const asset: number;
  export default asset;
}

declare module '*.ttf' {
  const asset: number;
  export default asset;
}
