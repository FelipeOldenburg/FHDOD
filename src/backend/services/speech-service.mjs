import { readFile } from "node:fs/promises";

export const speechTextLimit = 2400;
const segmenter = new Intl.Segmenter("pt-BR", { granularity: "sentence" });
const decoder = new TextDecoder();
const cache = new Map();
const pending = new Map();
let synthesizerPromise;

async function createVoice() {
  const [ort, { default: createPhonemizer }, model, configSource] = await Promise.all([
    import("onnxruntime-web"),
    import("@echogarden/espeak-ng-emscripten"),
    readFile(new URL("../assets/voice/faber.onnx", import.meta.url)),
    readFile(new URL("../assets/voice/faber.json", import.meta.url), "utf8"),
  ]);
  const config = JSON.parse(configSource);
  ort.env.wasm.numThreads = 1;
  const [session, module] = await Promise.all([
    ort.InferenceSession.create(model, { executionProviders: ["wasm"] }),
    createPhonemizer(),
  ]);
  const phonemizer = new module.eSpeakNGWorker();
  if (phonemizer.set_voice("", config.espeak.voice) !== 0)
    throw new Error("Voz pt-BR indisponível.");
  return { module, phonemizer, ort, session, config };
}

function idsForText(text, { module, phonemizer, config }) {
  const { ptr } = phonemizer.text_to_phonemes(text, true);
  const end = module.HEAPU8.indexOf(0, ptr);
  const ipa = decoder.decode(module.HEAPU8.subarray(ptr, end))
    .replaceAll("_", "").replace(/\s*\|\s*/g, ", ").trim().normalize("NFD");
  const punctuation = /[.!?]$/.test(text) ? text.at(-1) : ".";
  const map = config.phoneme_id_map;
  const ids = [...map["^"], ...map["_"]];
  for (const phoneme of ipa + punctuation) {
    if (map[phoneme]) ids.push(...map[phoneme], ...map["_"]);
  }
  ids.push(...map["$"]);
  return BigInt64Array.from(ids, BigInt);
}

async function renderSpeech(text) {
  synthesizerPromise ??= createVoice().catch((error) => {
    synthesizerPromise = undefined;
    throw error;
  });
  const voice = await synthesizerPromise;
  const { ort, session, config } = voice;
  const sampleRate = config.audio.sample_rate;
  const sampleLimit = sampleRate * 85;
  const chunks = [];
  const pause = new Float32Array(Math.round(sampleRate * 0.17));
  let length = 0;
  const expanded = text.replace(/\bDra\./gi, "Doutora").replace(/\bDr\./gi, "Doutor");
  const sentences = Array.from(segmenter.segment(expanded), ({ segment }) => segment)
    .flatMap((sentence) => sentence.match(/.{1,210}(?:\s|$)|.{1,210}/gu) ?? []);

  for (const sentence of sentences) {
    const ids = idsForText(sentence.trim(), voice);
    // Disable sampling noise so byte ranges generated on separate instances agree.
    const { output } = await session.run({
      input: new ort.Tensor("int64", ids, [1, ids.length]),
      input_lengths: new ort.Tensor("int64", BigInt64Array.of(BigInt(ids.length)), [1]),
      scales: new ort.Tensor("float32", Float32Array.of(0, 1.05, 0), [3]),
    });
    const audio = output.data.subarray(0, sampleLimit - length);
    chunks.push(audio);
    length += audio.length;
    if (length + pause.length >= sampleLimit) break;
    chunks.push(pause);
    length += pause.length;
  }
  if (!length) throw new Error("O sintetizador não produziu áudio.");
  let peak = 0;
  for (const audio of chunks) {
    for (const sample of audio) peak = Math.max(peak, Math.abs(sample));
  }
  if (!Number.isFinite(peak) || peak === 0) throw new Error("O sintetizador produziu áudio inválido.");
  const gain = 0.86 * 32767 / peak;
  const byteLength = length * 2;
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
  const wave = Buffer.allocUnsafe(44 + byteLength);
  header.copy(wave);
  let offset = 44;
  for (const audio of chunks) {
    for (const sample of audio) {
      wave.writeInt16LE(Math.round(sample * gain), offset);
      offset += 2;
    }
  }
  return wave;
}

export async function synthesizeSpeech(text) {
  const cached = cache.get(text);
  if (cached) return cached;
  if (pending.has(text)) return pending.get(text);
  // Media players may request several byte ranges of the same utterance.
  const rendering = renderSpeech(text).then((wave) => {
    if (cache.size >= 8) cache.delete(cache.keys().next().value);
    cache.set(text, wave);
    return wave;
  }).finally(() => pending.delete(text));
  pending.set(text, rendering);
  return rendering;
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
