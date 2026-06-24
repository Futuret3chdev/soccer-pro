import * as THREE from 'three';

const CROWD_VIDEO_URL = '/assets/crowds/stadium-crowd-pexels-sd.mp4';

/** Pexels stadium crowd clip — looped texture for stand billboards. */
export function createCrowdVideoTexture(url = CROWD_VIDEO_URL) {
  const video = document.createElement('video');
  video.src = url;
  video.loop = true;
  video.muted = true;
  video.playsInline = true;
  video.setAttribute('playsinline', '');
  video.setAttribute('webkit-playsinline', '');
  video.preload = 'auto';
  video.crossOrigin = 'anonymous';

  const texture = new THREE.VideoTexture(video);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;

  const play = () => {
    const p = video.play();
    if (p?.catch) p.catch(() => {});
  };
  video.addEventListener('loadeddata', play, { once: true });
  play();

  return { texture, video };
}