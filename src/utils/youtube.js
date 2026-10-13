const YOUTUBE_HOSTS = new Set([
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'youtu.be',
  'www.youtube-nocookie.com'
]);

export function extractYouTubeId(value) {
  if (!value || typeof value !== 'string') {
    throw new Error('URL YouTube wajib diisi.');
  }

  let url;

  try {
    url = new URL(value.trim());
  } catch {
    throw new Error('URL YouTube tidak valid.');
  }

  const hostname = url.hostname.toLowerCase();

  if (!YOUTUBE_HOSTS.has(hostname)) {
    throw new Error('URL harus berasal dari YouTube.');
  }

  let videoId = null;

  if (hostname === 'youtu.be') {
    videoId = url.pathname.split('/').filter(Boolean)[0];
  }

  if (
    hostname === 'youtube.com' ||
    hostname === 'www.youtube.com' ||
    hostname === 'm.youtube.com'
  ) {
    if (url.pathname === '/watch') {
      videoId = url.searchParams.get('v');
    }

    if (url.pathname.startsWith('/shorts/')) {
      videoId = url.pathname.split('/')[2];
    }

    if (url.pathname.startsWith('/embed/')) {
      videoId = url.pathname.split('/')[2];
    }
  }

  if (!videoId || !/^[A-Za-z0-9_-]{11}$/.test(videoId)) {
    throw new Error('YouTube video ID tidak valid.');
  }

  return videoId;
}

export function normalizeYouTubeUrl(videoId) {
  return `https://www.youtube.com/watch?v=${videoId}`;
}

export function getYouTubeThumbnail(videoId) {
  return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
}

export function getYouTubeEmbedUrl(videoId, origin) {
  const params = new URLSearchParams({
    enablejsapi: '1',
    playsinline: '1',
    rel: '0',
    origin
  });

  return `https://www.youtube-nocookie.com/embed/${videoId}?${params.toString()}`;
}