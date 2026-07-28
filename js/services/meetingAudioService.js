function normalizePeaks(samples, targetPeak = 0.92) {
  let max = 0;

  for (let index = 0; index < samples.length; index += 1) {
    max = Math.max(max, Math.abs(samples[index]));
  }

  if (max < 0.001) {
    return samples;
  }

  const output = new Float32Array(samples.length);
  const gain = targetPeak / max;

  for (let index = 0; index < samples.length; index += 1) {
    output[index] = samples[index] * gain;
  }

  return output;
}

function resample(samples, sourceSampleRate, targetSampleRate) {
  if (sourceSampleRate === targetSampleRate) {
    return samples;
  }

  const ratio = sourceSampleRate / targetSampleRate;
  const outputLength = Math.max(1, Math.round(samples.length / ratio));
  const output = new Float32Array(outputLength);

  for (let index = 0; index < outputLength; index += 1) {
    const sourceIndex = index * ratio;
    const leftIndex = Math.floor(sourceIndex);
    const rightIndex = Math.min(leftIndex + 1, samples.length - 1);
    const fraction = sourceIndex - leftIndex;
    output[index] = samples[leftIndex] + (samples[rightIndex] - samples[leftIndex]) * fraction;
  }

  return output;
}

function prepareSpeechSamples(samples, sampleRate, targetSampleRate) {
  return normalizePeaks(resample(samples, sampleRate, targetSampleRate));
}

function extractRingBuffer(ringBuffer, writeIndex, filled) {
  const output = new Float32Array(filled);
  const startIndex = (writeIndex - filled + ringBuffer.length) % ringBuffer.length;

  for (let index = 0; index < filled; index += 1) {
    output[index] = ringBuffer[(startIndex + index) % ringBuffer.length];
  }

  return output;
}

function computeRms(samples) {
  if (samples.length === 0) {
    return 0;
  }

  let sum = 0;

  for (let index = 0; index < samples.length; index += 1) {
    sum += samples[index] * samples[index];
  }

  return Math.sqrt(sum / samples.length);
}

function encodeWav(samples, sampleRate) {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);

  const writeString = (offset, value) => {
    for (let index = 0; index < value.length; index += 1) {
      view.setUint8(offset + index, value.charCodeAt(index));
    }
  };

  writeString(0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(36, "data");
  view.setUint32(40, samples.length * 2, true);

  let offset = 44;

  for (let index = 0; index < samples.length; index += 1) {
    const sample = Math.max(-1, Math.min(1, samples[index]));
    view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
    offset += 2;
  }

  return new Blob([buffer], { type: "audio/wav" });
}

function mixInputBuffer(inputBuffer) {
  const length = inputBuffer.length;
  const mixed = new Float32Array(length);
  const channelCount = inputBuffer.numberOfChannels;

  if (channelCount === 0) {
    return mixed;
  }

  for (let channel = 0; channel < channelCount; channel += 1) {
    const channelData = inputBuffer.getChannelData(channel);

    for (let index = 0; index < length; index += 1) {
      mixed[index] += channelData[index] / channelCount;
    }
  }

  return mixed;
}

export function createContinuousMeetingCapture({
  stream,
  windowMs,
  minWindowMs = windowMs,
  hopMs,
  minRms,
  skipRmsGate = false,
  targetSampleRate = 16000,
  onChunk,
  onLevel,
  onStreamEnded,
}) {
  const audioContext = new AudioContext();
  const source = audioContext.createMediaStreamSource(stream);
  const gainNode = audioContext.createGain();
  gainNode.gain.value = 0;

  const processor = audioContext.createScriptProcessor(4096, 1, 1);
  const sampleRate = audioContext.sampleRate;
  const maxSamples = Math.ceil((windowMs / 1000) * sampleRate);
  const minSamples = Math.ceil((minWindowMs / 1000) * sampleRate);
  const hopSamples = Math.ceil((hopMs / 1000) * sampleRate);
  const ringBuffer = new Float32Array(maxSamples);

  let writeIndex = 0;
  let filled = 0;
  let samplesSinceHop = 0;
  let stopped = false;

  stream.getAudioTracks()[0]?.addEventListener("ended", () => {
    if (!stopped) {
      onStreamEnded?.();
    }
  });

  processor.onaudioprocess = (event) => {
    if (stopped) {
      return;
    }

    const mixedInput = mixInputBuffer(event.inputBuffer);
    onLevel?.(computeRms(mixedInput));

    for (let index = 0; index < mixedInput.length; index += 1) {
      ringBuffer[writeIndex] = mixedInput[index];
      writeIndex = (writeIndex + 1) % maxSamples;
      filled = Math.min(filled + 1, maxSamples);
      samplesSinceHop += 1;

      if (filled >= minSamples && samplesSinceHop >= hopSamples) {
        samplesSinceHop = 0;
        const snapshot = extractRingBuffer(ringBuffer, writeIndex, filled);
        const snapshotRms = computeRms(snapshot);

        if (skipRmsGate || snapshotRms >= minRms) {
          const prepared = prepareSpeechSamples(snapshot, sampleRate, targetSampleRate);
          onChunk?.(encodeWav(prepared, targetSampleRate));
        }
      }
    }
  };

  source.connect(processor);
  processor.connect(gainNode);
  gainNode.connect(audioContext.destination);

  return {
    async start() {
      if (audioContext.state === "suspended") {
        await audioContext.resume();
      }
    },
    stop() {
      stopped = true;
      source.disconnect();
      processor.disconnect();
      gainNode.disconnect();
      audioContext.close();
    },
  };
}

export function isMeetingAudioSupported() {
  return Boolean(navigator.mediaDevices?.getDisplayMedia && window.AudioContext);
}

export async function acquireMeetingAudioStream() {
  if (!isMeetingAudioSupported()) {
    throw new Error("Meeting audio capture is not supported in this browser.");
  }

  const stream = await navigator.mediaDevices.getDisplayMedia({
    video: true,
    audio: {
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
    },
  });

  const audioTracks = stream.getAudioTracks();

  if (audioTracks.length === 0) {
    stream.getTracks().forEach((track) => track.stop());
    throw new Error(
      "No meeting audio was shared. Choose the Microsoft Teams tab or window and enable Share audio.",
    );
  }

  stream.getVideoTracks().forEach((track) => track.stop());

  return new MediaStream(audioTracks);
}

export function releaseMeetingAudioStream(stream) {
  stream?.getTracks().forEach((track) => track.stop());
}

export function extractNewMeetingSegment(previousText, currentText, sourceLanguage = "en") {
  const previous = previousText.trim();
  const current = currentText.trim();

  if (!current) {
    return "";
  }

  if (!previous || current === previous) {
    return current === previous ? "" : current;
  }

  if (current.startsWith(previous)) {
    return current.slice(previous.length).trim();
  }

  if (sourceLanguage === "th") {
    const maxCheck = Math.min(previous.length, current.length, 48);

    for (let length = maxCheck; length >= 2; length -= 1) {
      if (previous.slice(-length) === current.slice(0, length)) {
        return current.slice(length).trim();
      }
    }

    return current;
  }

  const previousWords = previous.split(/\s+/);
  const currentWords = current.split(/\s+/);
  let maxOverlap = 0;

  for (let size = 1; size <= Math.min(previousWords.length, currentWords.length); size += 1) {
    const suffix = previousWords.slice(-size).join(" ");
    const prefix = currentWords.slice(0, size).join(" ");

    if (suffix === prefix) {
      maxOverlap = size;
    }
  }

  const delta = currentWords.slice(maxOverlap).join(" ").trim();
  return delta || current;
}
