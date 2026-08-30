/**
 * Active Liveness Detection & Temporal Motion Analyzer
 *
 * Provides randomized active liveness challenges (turn_right, turn_left, blink)
 * and temporal frame analysis over frame sequences to prevent static photo/screen spoofing.
 *
 * NOTE: This is an active liveness foundation layer, not a certified 3D biometric anti-spoofing model.
 */

export type ChallengeType = 'turn_right' | 'turn_left' | 'blink';

export interface ChallengeConfig {
  type: ChallengeType;
  title: string;
  instruction: string;
  icon: string;
}

export const CHALLENGES: Record<ChallengeType, ChallengeConfig> = {
  turn_right: {
    type: 'turn_right',
    title: 'Turn Head Right',
    instruction: 'Please turn your head slightly to the right',
    icon: '👉',
  },
  turn_left: {
    type: 'turn_left',
    title: 'Turn Head Left',
    instruction: 'Please turn your head slightly to the left',
    icon: '👈',
  },
  blink: {
    type: 'blink',
    title: 'Blink Eyes',
    instruction: 'Please blink your eyes naturally once',
    icon: '👁️',
  },
};

export function getRandomChallenge(): ChallengeConfig {
  const keys: ChallengeType[] = ['turn_right', 'turn_left', 'blink'];
  const randomIndex = Math.floor(Math.random() * keys.length);
  return CHALLENGES[keys[randomIndex]];
}

export interface FrameMetrics {
  timestamp: number;
  horizontalSkew: number; // Positive = Right shift, Negative = Left shift
  eyeLuminance: number;   // Eye-region average brightness/contrast
}

export class TemporalLivenessAnalyzer {
  private challenge: ChallengeType;
  private frames: FrameMetrics[] = [];
  private baseline: FrameMetrics | null = null;
  private state: 'neutral' | 'in_progress' | 'completed' = 'neutral';
  private startTime: number = 0;
  private timeoutMs: number = 10000; // 10 seconds timeout

  constructor(challenge: ChallengeType, timeoutMs = 10000) {
    this.challenge = challenge;
    this.timeoutMs = timeoutMs;
  }

  public start() {
    this.frames = [];
    this.baseline = null;
    this.state = 'neutral';
    this.startTime = Date.now();
  }

  public analyzeFrame(canvas: HTMLCanvasElement): {
    passed: boolean;
    failed: boolean;
    progress: number; // 0.0 to 1.0
    reason?: string;
  } {
    const now = Date.now();
    if (now - this.startTime > this.timeoutMs) {
      return {
        passed: false,
        failed: true,
        progress: 0,
        reason: 'Challenge timed out. Please ensure sufficient motion and try again.',
      };
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return { passed: false, failed: false, progress: 0 };
    }

    const width = canvas.width;
    const height = canvas.height;
    if (width === 0 || height === 0) {
      return { passed: false, failed: false, progress: 0 };
    }

    // Extract central face region & eye region metrics
    const imgData = ctx.getImageData(0, 0, width, height);
    const data = imgData.data;

    let totalWeight = 0;
    let weightedXSum = 0;
    let eyeLuminanceSum = 0;
    let eyePixelCount = 0;

    const eyeMinY = Math.floor(height * 0.25);
    const eyeMaxY = Math.floor(height * 0.45);
    const eyeMinX = Math.floor(width * 0.2);
    const eyeMaxX = Math.floor(width * 0.8);

    for (let y = 0; y < height; y += 4) {
      for (let x = 0; x < width; x += 4) {
        const idx = (y * width + x) * 4;
        const r = data[idx];
        const g = data[idx + 1];
        const b = data[idx + 2];
        const brightness = 0.299 * r + 0.587 * g + 0.114 * b;

        totalWeight += brightness;
        weightedXSum += x * brightness;

        if (y >= eyeMinY && y <= eyeMaxY && x >= eyeMinX && x <= eyeMaxX) {
          eyeLuminanceSum += brightness;
          eyePixelCount++;
        }
      }
    }

    const centerX = width / 2;
    const centerOfMassX = totalWeight > 0 ? weightedXSum / totalWeight : centerX;
    const horizontalSkew = (centerOfMassX - centerX) / width;
    const eyeLuminance = eyePixelCount > 0 ? eyeLuminanceSum / eyePixelCount : 0;

    const currentMetric: FrameMetrics = {
      timestamp: now,
      horizontalSkew,
      eyeLuminance,
    };

    this.frames.push(currentMetric);

    // Establish baseline from first 3 frames
    if (!this.baseline) {
      if (this.frames.length >= 3) {
        const avgSkew = this.frames.reduce((acc, f) => acc + f.horizontalSkew, 0) / this.frames.length;
        const avgLum = this.frames.reduce((acc, f) => acc + f.eyeLuminance, 0) / this.frames.length;
        this.baseline = { timestamp: now, horizontalSkew: avgSkew, eyeLuminance: avgLum };
      }
      return { passed: false, failed: false, progress: 0.1 };
    }

    const deltaSkew = currentMetric.horizontalSkew - this.baseline.horizontalSkew;
    const deltaLum = currentMetric.eyeLuminance - this.baseline.eyeLuminance;

    if (this.challenge === 'turn_right') {
      // Expect positive horizontal skew shift (> 0.035)
      const targetThreshold = 0.035;
      const progress = Math.min(1.0, Math.max(0.1, deltaSkew / targetThreshold));

      if (deltaSkew > targetThreshold) {
        this.state = 'completed';
        return { passed: true, failed: false, progress: 1.0 };
      }
      return { passed: false, failed: false, progress };
    }

    if (this.challenge === 'turn_left') {
      // Expect negative horizontal skew shift (< -0.035)
      const targetThreshold = -0.035;
      const progress = Math.min(1.0, Math.max(0.1, deltaSkew / targetThreshold));

      if (deltaSkew < targetThreshold) {
        this.state = 'completed';
        return { passed: true, failed: false, progress: 1.0 };
      }
      return { passed: false, failed: false, progress };
    }

    if (this.challenge === 'blink') {
      // Expect eye luminance dip followed by recovery (temporal open -> dip -> recovery)
      const minLum = Math.min(...this.frames.map((f) => f.eyeLuminance));
      const dip = this.baseline.eyeLuminance - minLum;
      const progress = Math.min(1.0, Math.max(0.1, dip / 12.0));

      if (dip > 12.0 && Math.abs(deltaLum) < 6.0) {
        this.state = 'completed';
        return { passed: true, failed: false, progress: 1.0 };
      }
      return { passed: false, failed: false, progress };
    }

    return { passed: false, failed: false, progress: 0.2 };
  }
}
