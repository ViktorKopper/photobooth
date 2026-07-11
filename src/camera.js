let activeStream = null;

export async function startCamera(videoElement, facingMode = 'user') {
  stopCamera();

  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error('This browser does not support camera access. Try Safari/Chrome on HTTPS.');
  }

  const constraints = {
    audio: false,
    video: {
      facingMode,
      width: { ideal: 1280 },
      height: { ideal: 960 }
    }
  };

  activeStream = await navigator.mediaDevices.getUserMedia(constraints);
  videoElement.srcObject = activeStream;
  videoElement.setAttribute('playsinline', 'true');
  videoElement.muted = true;
  await videoElement.play();

  return activeStream;
}

export function stopCamera() {
  if (!activeStream) return;
  activeStream.getTracks().forEach((track) => track.stop());
  activeStream = null;
}

export async function capturePhoto(videoElement, facingMode = 'user') {
  const width = videoElement.videoWidth || 1280;
  const height = videoElement.videoHeight || 960;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext('2d');

  // Mirror selfie/front camera captures to match the live preview feeling.
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
        resolve({ blob, previewUrl: URL.createObjectURL(blob), width, height });
      },
      'image/jpeg',
      0.92
    );
  });
}
