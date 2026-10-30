const assert = require('node:assert/strict');
const { opus } = require('prism-media');

const encoder = new opus.Encoder({ rate: 48000, channels: 2, frameSize: 960 });

try {
  assert.equal(opus.Encoder.type, 'opusscript');
  assert.equal(typeof encoder.encoder.encode, 'function');
  console.log('Opus encoder runtime dependency check passed.');
} finally {
  encoder.destroy();
}
