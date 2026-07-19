export type VoiceCapture = {
  stop: () => Promise<File>;
  hasSpeech: () => boolean;
};

export type VoiceCaptureOptions = {
  onSilence?: () => void;
  silenceMs?: number;
  speechThreshold?: number;
};

type PcmCapture = VoiceCapture & {
  context: AudioContext;
  source: MediaStreamAudioSourceNode;
  node: AudioWorkletNode;
  stream: MediaStream;
  chunks: Float32Array[];
  sampleRate: number;
};

const PCM_WORKLET = `
class IskraPcmCollector extends AudioWorkletProcessor {
  process(inputs) {
    const input = inputs[0] && inputs[0][0];
    if (input) this.port.postMessage(input.slice(0));
    return true;
  }
}
registerProcessor("iskra-pcm-collector", IskraPcmCollector);
`;

export async function createVoiceCapture(stream: MediaStream, options: VoiceCaptureOptions = {}): Promise<VoiceCapture> {
  if (typeof AudioContext === "undefined") return createMediaCapture(stream);
  const context = new AudioContext();
  if (!context.audioWorklet) {
    await context.close();
    return createMediaCapture(stream);
  }
  await context.resume();
  const moduleUrl = URL.createObjectURL(new Blob([PCM_WORKLET], { type: "application/javascript" }));
  try {
    await context.audioWorklet.addModule(moduleUrl);
  } finally {
    URL.revokeObjectURL(moduleUrl);
  }
  const source = context.createMediaStreamSource(stream);
  const node = new AudioWorkletNode(context, "iskra-pcm-collector");
  const capture: PcmCapture = {
    context,
    source,
    node,
    stream,
    chunks: [],
    sampleRate: context.sampleRate || 16_000,
    hasSpeech: () => false,
    stop: async () => new File([], "iskra-voice.wav", { type: "audio/wav" }),
  };
  let heardSpeech = false;
  let silenceTriggered = false;
  let lastSpeechAt = 0;
  const silenceMs = options.silenceMs ?? 900;
  const speechThreshold = options.speechThreshold ?? 0.012;
  node.port.onmessage = (event: MessageEvent<Float32Array>) => {
    const input = event.data;
    capture.chunks.push(new Float32Array(input));
    let energy = 0;
    for (const sample of input) energy += sample * sample;
    if (Math.sqrt(energy / Math.max(1, input.length)) > speechThreshold) {
      heardSpeech = true;
      lastSpeechAt = performance.now();
    } else if (heardSpeech && !silenceTriggered && lastSpeechAt && performance.now() - lastSpeechAt >= silenceMs) {
      silenceTriggered = true;
      options.onSilence?.();
    }
  };
  capture.hasSpeech = () => heardSpeech;
  source.connect(node);
  node.connect(context.destination);
  let stopped: Promise<File> | null = null;
  capture.stop = () => {
    if (stopped) return stopped;
    stopped = (async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 60));
      node.disconnect();
      source.disconnect();
      node.port.onmessage = null;
      await context.close();
      stream.getTracks().forEach((track) => track.stop());
      return encodeWav(capture.chunks, capture.sampleRate);
    })();
    return stopped;
  };
  return capture;
}

function createMediaCapture(stream: MediaStream): VoiceCapture {
  const mimeType = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"].find((type) => {
    try {
      return MediaRecorder.isTypeSupported(type);
    } catch {
      return false;
    }
  });
  const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
  const chunks: Blob[] = [];
  recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
  recorder.start(250);
  let stopped: Promise<File> | null = null;
  return {
    hasSpeech: () => chunks.length > 0,
    stop: () => {
      if (stopped) return stopped;
      const promise = new Promise<File>((resolve) => {
        recorder.onstop = () => {
          const type = recorder.mimeType || chunks[0]?.type || "audio/webm";
          const extension = type.includes("mp4") ? "m4a" : type.includes("ogg") ? "ogg" : "webm";
          resolve(new File([new Blob(chunks, { type })], `iskra-voice.${extension}`, { type }));
        };
        if (recorder.state === "inactive") {
          resolve(new File([], "iskra-voice.webm", { type: "audio/webm" }));
        } else recorder.stop();
      }).finally(() => stream.getTracks().forEach((track) => track.stop()));
      stopped = promise;
      return promise;
    },
  };
}

function encodeWav(chunks: Float32Array[], sampleRate: number): File {
  const length = chunks.reduce((total, chunk) => total + chunk.length, 0);
  const buffer = new ArrayBuffer(44 + length * 2);
  const view = new DataView(buffer);
  const write = (offset: number, value: string) => [...value].forEach((char, index) => view.setUint8(offset + index, char.charCodeAt(0)));
  write(0, "RIFF"); view.setUint32(4, 36 + length * 2, true); write(8, "WAVE"); write(12, "fmt ");
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true); view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true); write(36, "data"); view.setUint32(40, length * 2, true);
  let offset = 44;
  for (const chunk of chunks) for (const sample of chunk) { const value = Math.max(-1, Math.min(1, sample)); view.setInt16(offset, value < 0 ? value * 0x8000 : value * 0x7fff, true); offset += 2; }
  return new File([buffer], "iskra-voice.wav", { type: "audio/wav" });
}
