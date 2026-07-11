let activeStream = null;

export async function startCamera(videoElement, facingMode = 'user') {
  stopCamera();

  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error('This browser does not support camera access. Try Safari/Chrome on HTTPS.');
  }

  const constraints = {
    audio: false,
    video: {
      facingMode: { ideal: facingMode },
      width: { ideal: 1280 },
      height: { ideal: 960 }
    }
  };

  activeStream = await navigator.mediaDevices.getUserMedia(constraints);

  videoElement.srcObject = activeStream;
  videoElement.autoplay = true;
  videoElement.muted = true;
  videoElement.playsInline = true;
  videoElement.setAttribute('playsinline', 'true');
  videoElement.setAttribute('webkit-playsinline', 'true');

  await waitForVideoReady(videoElement);
  await videoElement.play();

  return activeStream;
}

function waitForVideoReady(videoElement) {
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      reject(new Error('Camera started, but the video preview is not ready yet. Try refreshing the page.'));
    }, 8000);

    const done = () => {
      window.clearTimeout(timeout);
      resolve();
    };

    if (videoElement.readyState >= 2 && videoElement.videoWidth > 0) {
      done();
      return;
    }

    videoElement.onloadedmetadata = done;
    videoElement.oncanplay = done;
  });
}

export function stopCamera() {
  if (!activeStream) return;
  activeStream.getTracks().forEach((track) => track.stop());
  activeStream = null;
}

export async function capturePhoto(videoElement, facingMode = 'user') {
  const width = videoElement.videoWidth;
  const height = videoElement.videoHeight;

  if (!width || !height) {
    throw new Error('Camera is not ready yet. Wait a second and try again.');
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext('2d');

  if (facingMode === 'user') {
    context.translate(width, 0);
    context.scale(-1, 1);
  }

  context.drawImage(videoElement, 0, 0, width, height);

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error('Could not capture the photo.'));
          return;
        }

        resolve({
          blob,
          previewUrl: URL.createObjectURL(blob),
          width,
          height
        });
      },
      'image/jpeg',
      0.92
    );
  });
}