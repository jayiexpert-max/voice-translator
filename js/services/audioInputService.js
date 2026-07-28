export function isAudioInputSupported() {
  return Boolean(navigator.mediaDevices?.enumerateDevices && navigator.mediaDevices?.getUserMedia);
}

export function formatAudioInputLabel(device) {
  const label = device.label?.trim();

  if (!label) {
    return `Microphone ${device.deviceId.slice(0, 8)}…`;
  }

  return label;
}

export function isUsbAudioDevice(device) {
  const label = (device.label || "").toLowerCase();
  return /usb audio device|usb audio|usb/i.test(label);
}

export function isMeetingLoopbackDevice(device) {
  const label = (device.label || "").toLowerCase();
  return /blackhole|vb-audio|virtual|cable|stereo mix|loopback|teams|aggregate|soundflower/.test(label);
}

export function isExternalAudioCaptureDevice(device) {
  return isUsbAudioDevice(device) || isMeetingLoopbackDevice(device);
}

export function findPreferredAudioInputDevice(devices) {
  if (devices.length === 0) {
    return null;
  }

  const usbAudioDevice = devices.find((device) => /usb audio device/i.test(device.label || ""));

  if (usbAudioDevice) {
    return usbAudioDevice;
  }

  const usbDevice = devices.find(isUsbAudioDevice);

  if (usbDevice) {
    return usbDevice;
  }

  return devices.find(isMeetingLoopbackDevice) || null;
}

export function sortAudioInputDevices(devices) {
  const rank = (device) => {
    const label = (device.label || "").toLowerCase();

    if (/usb audio device/.test(label)) {
      return 0;
    }

    if (isUsbAudioDevice(device)) {
      return 1;
    }

    if (isMeetingLoopbackDevice(device)) {
      return 2;
    }

    return 3;
  };

  return [...devices].sort((left, right) => {
    const rankDiff = rank(left) - rank(right);

    if (rankDiff !== 0) {
      return rankDiff;
    }

    return formatAudioInputLabel(left).localeCompare(formatAudioInputLabel(right));
  });
}

async function requestMicrophonePermission() {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  stream.getTracks().forEach((track) => track.stop());
}

export async function loadAudioInputDevices({ requestPermission = true } = {}) {
  if (!isAudioInputSupported()) {
    return [];
  }

  if (requestPermission) {
    try {
      await requestMicrophonePermission();
    } catch {
      // Labels stay hidden until the user grants access.
    }
  }

  const devices = await navigator.mediaDevices.enumerateDevices();
  return sortAudioInputDevices(devices.filter((device) => device.kind === "audioinput"));
}

function buildAudioConstraints(deviceId, devices) {
  const device = devices.find((entry) => entry.deviceId === deviceId);
  const preserveRawSignal = Boolean(deviceId && device && isExternalAudioCaptureDevice(device));

  return {
    ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
    echoCancellation: !preserveRawSignal,
    noiseSuppression: !preserveRawSignal,
    autoGainControl: !preserveRawSignal,
  };
}

export async function acquireMicrophoneStream(deviceId = "", devices = []) {
  if (!isAudioInputSupported()) {
    throw new Error("Microphone selection is not supported in this browser.");
  }

  return navigator.mediaDevices.getUserMedia({
    audio: buildAudioConstraints(deviceId, devices),
  });
}

export function releaseMicrophoneStream(stream) {
  stream?.getTracks().forEach((track) => track.stop());
}
