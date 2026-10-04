// Learn more: https://docs.expo.dev/guides/customizing-metro/
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// The offline PDF surface (assets/pdf-surface/surface.html) ships as an asset file, loaded by the
// WebView from disk on native and by an iframe on web.
config.resolver.assetExts.push('html');

module.exports = config;
