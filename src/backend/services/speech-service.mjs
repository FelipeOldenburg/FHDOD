export const speechTextLimit = 2400;
const cache = new Map();
let synthesizerPromise;

async function createVoice() {
  const { default: createSynthesizer } = await import("@echogarden/espeak-ng-emscripten");
  const module = await createSynthesizer();
  const voice = new module.eSpeakNGWorker();
  if (voice.set_voice("", "pt-br") !== 0)
    throw new Error("Voz pt-BR indisponível.");
  voice.set_rate(175);
  return { module, voice };
}

export async function synthesizeSpeech(text) {
  const cached = cache.get(text);
  if (cached) return cached;
  synthesizerPromise ??= createVoice().catch((error) => {
    synthesizerPromise = undefined;
    throw error;
  });
  const { module, voice } = await synthesizerPromise;
  // The engine calls this synchronously. Copy each chunk before it reuses memory.
  const chunks = [];
  const sampleRate = voice.get_samplerate();
  const byteLimit = sampleRate * 2 * 85;
  let byteLength = 0;
  const onSamples = module.addFunction((pointer, sampleCount) => {
    if (!pointer || !sampleCount) return 0;
    const length = Math.min(sampleCount * 2, byteLimit - byteLength);
    chunks.push(Buffer.from(module.HEAPU8.subarray(pointer, pointer + length)));
    byteLength += length;
    return byteLength >= byteLimit ? 1 : 0;
  }, "iiii");
  try {
    voice.synth_(text, onSamples);
  } finally {
    module.removeFunction(onSamples);
  }
  if (!byteLength) throw new Error("O sintetizador não produziu áudio.");
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + byteLength, 4);
  header.write("WAVEfmt ", 8);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(byteLength, 40);
  const wave = Buffer.concat([header, ...chunks], 44 + byteLength);

  // Media players may request several byte ranges of the same utterance.
  if (cache.size >= 8) cache.delete(cache.keys().next().value);
  cache.set(text, wave);
  return wave;
}

export function sendSpeech(req, res, wave) {
  res.setHeader("Content-Type", "audio/wav");
  res.setHeader("Accept-Ranges", "bytes");
  res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
  let body = wave;
  let status = 200;
  const range = req.headers.range;
  if (range) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(range);
    if (!match || (!match[1] && !match[2])) {
      res.writeHead(416, { "Content-Range": `bytes */${wave.length}` });
      return res.end();
    }
    const last = wave.length - 1;
    const start = match[1] ? Number(match[1]) : Math.max(0, wave.length - Number(match[2]));
    const end = match[1] && match[2] ? Math.min(last, Number(match[2])) : last;
    if (start > end || start > last) {
      res.writeHead(416, { "Content-Range": `bytes */${wave.length}` });
      return res.end();
    }
    status = 206;
    body = wave.subarray(start, end + 1);
    res.setHeader("Content-Range", `bytes ${start}-${end}/${wave.length}`);
  }
  res.writeHead(status, { "Content-Length": body.length });
  return res.end(req.method === "HEAD" ? undefined : body);
}
