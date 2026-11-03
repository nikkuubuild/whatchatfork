import { generateVoiceNoteWavUrl } from './audioGenerator';

// High-fidelity SVG-based data URLs for sample images so they NEVER break in any sandbox or offline
export function getSampleImageDataUrl(title: string, subtitle: string, accentColor: string = '#008069'): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600" width="800" height="600">
    <defs>
      <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#1F2C34" />
        <stop offset="100%" stop-color="#111B21" />
      </linearGradient>
      <linearGradient id="glow" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stop-color="${accentColor}" stop-opacity="0.8" />
        <stop offset="100%" stop-color="#25D366" stop-opacity="0.8" />
      </linearGradient>
    </defs>
    <rect width="800" height="600" fill="url(#bg)" />
    <!-- Grid pattern -->
    <g stroke="rgba(255,255,255,0.05)" stroke-width="1">
      <line x1="0" y1="150" x2="800" y2="150" />
      <line x1="0" y1="300" x2="800" y2="300" />
      <line x1="0" y1="450" x2="800" y2="450" />
      <line x1="200" y1="0" x2="200" y2="600" />
      <line x1="400" y1="0" x2="400" y2="600" />
      <line x1="600" y1="0" x2="600" y2="600" />
    </g>
    <!-- Geometric Badge Center -->
    <rect x="250" y="160" width="300" height="200" rx="24" fill="rgba(255,255,255,0.03)" stroke="rgba(255,255,255,0.1)" stroke-width="2" />
    <!-- Inner emblem -->
    <circle cx="400" cy="240" r="40" fill="url(#glow)" />
    <path d="M385,240 L395,250 L418,225" fill="none" stroke="#ffffff" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" />
    <text x="400" y="320" font-family="system-ui, sans-serif" font-size="16" font-weight="bold" fill="#ffffff" text-anchor="middle" letter-spacing="1">WHATSAPP VERIFIED ASSET</text>
    <!-- Labels -->
    <text x="400" y="420" font-family="system-ui, sans-serif" font-size="28" font-weight="bold" fill="#ffffff" text-anchor="middle">${title}</text>
    <text x="400" y="460" font-family="system-ui, sans-serif" font-size="16" fill="#8696A0" text-anchor="middle">${subtitle}</text>
    <rect x="330" y="500" width="140" height="32" rx="16" fill="rgba(37,211,102,0.15)" stroke="#25D366" stroke-width="1" />
    <text x="400" y="521" font-family="system-ui, sans-serif" font-size="12" font-weight="bold" fill="#25D366" text-anchor="middle">OFFICIAL DISPATCH</text>
  </svg>`;

  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

// Generate playable video blob URL using HTML5 canvas capture
export function getSampleVideoUrl(): string {
  if (typeof window === 'undefined') return '';
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 640;
    canvas.height = 360;
    const ctx = canvas.getContext('2d');
    if (!ctx || !(canvas as any).captureStream) {
      return 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4';
    }

    const stream = (canvas as any).captureStream(25);
    const recorder = new MediaRecorder(stream, { mimeType: 'video/webm' });
    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => chunks.push(e.data);

    let frame = 0;
    const draw = () => {
      ctx.fillStyle = '#0B141A';
      ctx.fillRect(0, 0, 640, 360);

      // Gradient banner
      const grad = ctx.createLinearGradient(0, 0, 640, 360);
      grad.addColorStop(0, '#008069');
      grad.addColorStop(1, '#128C7E');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.roundRect(40, 40, 560, 280, 24);
      ctx.fill();

      // Animated wave bar
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 24px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Order Dispatch Inspection Video', 320, 150);

      ctx.fillStyle = '#E7FFDB';
      ctx.font = '16px sans-serif';
      ctx.fillText(`Recorded via WhatsApp Cloud API • Frame ${frame}`, 320, 190);

      // Pulsing circle
      ctx.fillStyle = '#25D366';
      ctx.beginPath();
      ctx.arc(320, 240, 16 + 8 * Math.sin(frame * 0.1), 0, Math.PI * 2);
      ctx.fill();

      frame++;
    };

    recorder.start();
    const interval = setInterval(draw, 40);
    setTimeout(() => {
      clearInterval(interval);
      recorder.stop();
    }, 1500);

    return new Promise<string>((resolve) => {
      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: 'video/webm' });
        resolve(URL.createObjectURL(blob));
      };
    }) as any;
  } catch (e) {
    return 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4';
  }
}

export { generateVoiceNoteWavUrl };
