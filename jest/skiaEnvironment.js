// Jest environment with a real CanvasKit (Skia compiled to wasm) on `global.CanvasKit`, so signature
// rendering runs for real in tests. Opt in per file with `@jest-environment ./jest/skiaEnvironment.js`.
const { TestEnvironment } = require('jest-environment-node');
const CanvasKitInit = require('canvaskit-wasm/bin/full/canvaskit');

class SkiaEnvironment extends TestEnvironment {
  async setup() {
    await super.setup();
    this.global.CanvasKit = await CanvasKitInit({});
  }
}

module.exports = SkiaEnvironment;
