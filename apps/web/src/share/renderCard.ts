import QRCode from 'qrcode';

export const CARD_WIDTH = 1200;
export const CARD_HEIGHT = 630;

export interface CardData {
  kicker: string;
  headline: string;
  won: boolean;
  tags: string[];
  seed: number;
  challengeUrl: string;
  siteLabel: string;
}

// Mirrors the vice-city-lights palette in index.css
const COLORS = {
  bg: '#08070d',
  text: '#c9c6da',
  muted: '#85819e',
  heading: '#f4f2fc',
  accent: '#ff2e97',
  accent2: '#29d8f2',
  good: '#2ee6a8',
  bad: '#ff4d5e',
};
const DISPLAY = "'Segoe UI Semibold', 'Arial Narrow', system-ui, sans-serif";
const MONO = 'ui-monospace, Consolas, monospace';

const PAD = 72;
const QR_SIZE = 260;
const QR_X = CARD_WIDTH - PAD - QR_SIZE;
const QR_Y = CARD_HEIGHT - PAD - QR_SIZE;

function drawBackground(ctx: CanvasRenderingContext2D, won: boolean): void {
  ctx.fillStyle = COLORS.bg;
  ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);
  const glows: [number, string][] = [
    [0.12, 'rgba(255, 46, 151, 0.22)'],
    [0.88, 'rgba(41, 216, 242, 0.18)'],
  ];
  for (const [x, color] of glows) {
    const glow = ctx.createRadialGradient(CARD_WIDTH * x, -60, 0, CARD_WIDTH * x, -60, 700);
    glow.addColorStop(0, color);
    glow.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);
  }
  ctx.strokeStyle = won ? COLORS.good : COLORS.bad;
  ctx.lineWidth = 4;
  ctx.strokeRect(24, 24, CARD_WIDTH - 48, CARD_HEIGHT - 48);
}

function drawText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  font: string,
  color: string,
  glow = 0,
): void {
  ctx.font = font;
  ctx.fillStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = glow;
  ctx.fillText(text, x, y);
  ctx.shadowBlur = 0;
}

function drawQr(ctx: CanvasRenderingContext2D, text: string): void {
  const { modules } = QRCode.create(text, { errorCorrectionLevel: 'M' });
  const quiet = 16;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(QR_X, QR_Y, QR_SIZE, QR_SIZE);
  const cell = (QR_SIZE - quiet * 2) / modules.size;
  ctx.fillStyle = COLORS.bg;
  for (let row = 0; row < modules.size; row++) {
    for (let col = 0; col < modules.size; col++) {
      if (modules.get(row, col)) {
        ctx.fillRect(
          QR_X + quiet + col * cell,
          QR_Y + quiet + row * cell,
          Math.ceil(cell),
          Math.ceil(cell),
        );
      }
    }
  }
}

/** Draw the brag card and export it as PNG; null when the browser can't */
export async function renderCard(data: CardData): Promise<Blob | null> {
  const canvas = document.createElement('canvas');
  canvas.width = CARD_WIDTH;
  canvas.height = CARD_HEIGHT;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.textBaseline = 'alphabetic';
  drawBackground(ctx, data.won);
  drawText(ctx, 'Perfect ', PAD, PAD + 24, `600 34px ${DISPLAY}`, COLORS.heading);
  const brandWidth = ctx.measureText('Perfect ').width;
  drawText(ctx, 'Season', PAD + brandWidth, PAD + 24, `600 34px ${DISPLAY}`, COLORS.accent, 12);

  ctx.letterSpacing = '6px';
  drawText(
    ctx,
    data.kicker.toUpperCase(),
    PAD,
    200,
    `600 30px ${DISPLAY}`,
    data.won ? COLORS.good : COLORS.bad,
  );
  ctx.letterSpacing = '0px';
  drawText(ctx, data.headline, PAD - 6, 360, `700 170px ${DISPLAY}`, COLORS.heading, 28);
  drawText(ctx, data.tags.join(' · '), PAD, 430, `500 30px ${DISPLAY}`, COLORS.text);
  drawText(ctx, `Seed ${data.seed}`, PAD, 478, `28px ${MONO}`, COLORS.muted);
  drawText(ctx, 'Can you beat it?', PAD, 548, `700 46px ${DISPLAY}`, COLORS.accent2, 16);
  drawText(ctx, data.siteLabel, PAD, 590, `26px ${DISPLAY}`, COLORS.muted);

  drawQr(ctx, data.challengeUrl);

  return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), 'image/png'));
}
