'use client';

import React, { useEffect, useRef, useState, useImperativeHandle, forwardRef } from 'react';
import { Camera, CheckCircle2, Loader2, RefreshCw, ShieldAlert, Video } from 'lucide-react';
import {
  ChallengeConfig,
  getRandomChallenge,
  TemporalLivenessAnalyzer,
} from '@/lib/liveness';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/utils';

export interface AttendanceCameraRef {
  captureFrame: () => Promise<Blob | null>;
  startCamera: () => Promise<void>;
  stopCamera: () => void;
  resetLiveness: () => void;
}

interface AttendanceCameraProps {
  onCapture?: (blob: Blob) => void;
  isProcessing?: boolean;
  enableLiveness?: boolean;
  onLivenessPassed?: () => void;
  onLivenessFailed?: (reason: string) => void;
  captureLabel?: string;
  processingLabel?: string;
}

export const AttendanceCamera = forwardRef<AttendanceCameraRef, AttendanceCameraProps>(
  (
    {
      onCapture,
      isProcessing = false,
      enableLiveness = true,
      onLivenessPassed,
      onLivenessFailed,
      captureLabel = 'Verify Attendance',
      processingLabel = 'Recognizing face...',
    },
    ref
  ) => {
    const videoRef = useRef<HTMLVideoElement | null>(null);
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const streamRef = useRef<MediaStream | null>(null);

    const [cameraState, setCameraState] = useState<'idle' | 'starting' | 'active' | 'denied' | 'error'>('idle');
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const startingRef = useRef(false);
    const mountedRef = useRef(true);

    const [activeChallenge, setActiveChallenge] = useState<ChallengeConfig | null>(null);
    const [livenessStatus, setLivenessStatus] = useState<
      'idle' | 'in_progress' | 'passed' | 'failed'
    >('idle');
    const [livenessProgress, setLivenessProgress] = useState<number>(0);
    const [livenessReason, setLivenessReason] = useState<string | null>(null);

    const analyzerRef = useRef<TemporalLivenessAnalyzer | null>(null);
    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const stopCamera = () => {
      console.info('[AttendanceCamera] stopCamera called');
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
      if (mountedRef.current) {
        setCameraState('idle');
        setLivenessStatus('idle');
        setErrorMessage(null);
        setLivenessProgress(0);
        setLivenessReason(null);
      }
    };

    const resetLiveness = () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }

      if (!enableLiveness) {
        setLivenessStatus('passed');
        return;
      }

      const newChallenge = getRandomChallenge();
      setActiveChallenge(newChallenge);
      setLivenessStatus('in_progress');
      setLivenessProgress(0);
      setLivenessReason(null);

      const analyzer = new TemporalLivenessAnalyzer(newChallenge.type, 10000);
      analyzer.start();
      analyzerRef.current = analyzer;

      timerRef.current = setInterval(() => {
        const video = videoRef.current;
        const canvas = canvasRef.current;
        if (!video || !canvas || !analyzerRef.current) return;

        if (video.videoWidth > 0 && video.videoHeight > 0 && !video.paused) {
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            const res = analyzerRef.current.analyzeFrame(canvas);

            setLivenessProgress(res.progress);

            if (res.passed) {
              if (timerRef.current) clearInterval(timerRef.current);
              setLivenessStatus('passed');
              if (onLivenessPassed) onLivenessPassed();
            } else if (res.failed) {
              if (timerRef.current) clearInterval(timerRef.current);
              setLivenessStatus('failed');
              const reason = res.reason || 'Liveness verification failed. Static image detected.';
              setLivenessReason(reason);
              if (onLivenessFailed) onLivenessFailed(reason);
            }
          }
        }
      }, 80);
    };

    const describeCameraError = (err: unknown): { state: 'denied' | 'error'; message: string } => {
      const name = err instanceof DOMException ? err.name : err instanceof Error ? err.name : '';
      if (name === 'NotAllowedError' || name === 'PermissionDeniedError' || name === 'SecurityError') {
        return {
          state: 'denied',
          message:
            'Camera permission was denied or blocked. Allow camera access for this site, then try again.',
        };
      }
      if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
        return { state: 'error', message: 'No camera was found. Connect a camera and try again.' };
      }
      if (name === 'NotReadableError' || name === 'TrackStartError') {
        return {
          state: 'error',
          message: 'The camera is already in use or cannot be read. Close other camera apps and try again.',
        };
      }
      if (name === 'OverconstrainedError') {
        return {
          state: 'error',
          message: 'The camera does not support the requested settings. Try another camera or browser.',
        };
      }
      if (typeof navigator !== 'undefined' && !window.isSecureContext) {
        return {
          state: 'error',
          message: 'Camera access requires HTTPS or localhost. Open the app from a secure local address.',
        };
      }
      return {
        state: 'error',
        message: err instanceof Error ? err.message : 'Unable to access the camera device.',
      };
    };

    const startCamera = async () => {
      console.info('[AttendanceCamera] Start Camera clicked', {
        cameraState,
        starting: startingRef.current,
        hasStream: Boolean(streamRef.current),
      });
      if (startingRef.current || streamRef.current) {
        console.info('[AttendanceCamera] Start Camera ignored because initialization is already active');
        return;
      }
      console.info('[AttendanceCamera] runtime security context', {
        isSecureContext: typeof window !== 'undefined' ? window.isSecureContext : false,
        origin: typeof window !== 'undefined' ? window.location.origin : 'server',
        mediaDevices: typeof navigator !== 'undefined' ? navigator.mediaDevices : undefined,
        getUserMedia:
          typeof navigator !== 'undefined' && navigator.mediaDevices
            ? typeof navigator.mediaDevices.getUserMedia
            : 'unavailable',
      });
      if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
        console.error('[AttendanceCamera] navigator.mediaDevices.getUserMedia is unavailable');
        setCameraState('error');
        setErrorMessage('This browser does not support camera access. Use a current browser over HTTPS or localhost.');
        return;
      }

      stopCamera();
      startingRef.current = true;
      setCameraState('starting');
      try {
        setErrorMessage(null);
        console.info('[AttendanceCamera] getUserMedia called', {
          constraints: {
            video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
            audio: false,
          },
        });
        console.info('[AttendanceCamera] permission request started');
        const mediaStream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: 'user',
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        });
        console.info('[AttendanceCamera] getUserMedia resolved', mediaStream);

        if (!mountedRef.current) {
          mediaStream.getTracks().forEach((track) => track.stop());
          return;
        }

        streamRef.current = mediaStream;
        console.info('[AttendanceCamera] stream received', {
          tracks: mediaStream.getTracks().map((track) => ({ kind: track.kind, readyState: track.readyState })),
        });
        const video = videoRef.current;
        console.info('[AttendanceCamera] video ref check', { present: Boolean(video) });
        if (!video) {
          mediaStream.getTracks().forEach((track) => track.stop());
          streamRef.current = null;
          throw new Error('Camera preview is not available. Please retry.');
        }
        video.srcObject = mediaStream;
        console.info('[AttendanceCamera] video.srcObject assigned', { srcObject: video.srcObject });
        console.info('[AttendanceCamera] video.play() called');
        await video.play();
        console.info('[AttendanceCamera] video.play() resolved');
        setCameraState('active');
        console.info('[AttendanceCamera] camera state changed to active');

        if (enableLiveness) {
          resetLiveness();
        } else {
          setLivenessStatus('passed');
        }
      } catch (err: unknown) {
        console.error('[AttendanceCamera] complete camera error:', err, {
          name: err instanceof Error ? err.name : undefined,
          message: err instanceof Error ? err.message : String(err),
          stack: err instanceof Error ? err.stack : undefined,
        });
        streamRef.current?.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        if (mountedRef.current) {
          const cameraError = describeCameraError(err);
          setCameraState(cameraError.state);
          setErrorMessage(cameraError.message);
        }
      } finally {
        startingRef.current = false;
      }
    };

    const captureFrame = (): Promise<Blob | null> => {
      return new Promise((resolve) => {
        const video = videoRef.current;
        const canvas = canvasRef.current;

        if (!video || !canvas || cameraState !== 'active') {
          resolve(null);
          return;
        }

        if (video.videoWidth === 0 || video.videoHeight === 0 || video.paused || video.ended) {
          resolve(null);
          return;
        }

        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(null);
          return;
        }

        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        canvas.toBlob(
          (blob) => {
            resolve(blob);
          },
          'image/jpeg',
          0.92
        );
      });
    };

    useImperativeHandle(ref, () => ({
      startCamera,
      stopCamera,
      captureFrame,
      resetLiveness,
    }));

    useEffect(() => {
      mountedRef.current = true;
      console.info('[AttendanceCamera] component mounted');
      return () => {
        console.info('[AttendanceCamera] component unmounted');
        mountedRef.current = false;
        stopCamera();
      };
    }, []);

    const stepState = (step: 'camera' | 'liveness' | 'recognition') => {
      if (step === 'camera') {
        if (cameraState === 'active') return 'done';
        return 'current';
      }
      if (step === 'liveness') {
        if (!enableLiveness || livenessStatus === 'passed') return 'done';
        if (cameraState === 'active' && livenessStatus === 'in_progress') return 'current';
        if (livenessStatus === 'failed') return 'error';
        return 'todo';
      }
      if (isProcessing) return 'current';
      if (livenessStatus === 'passed' && cameraState === 'active') return 'current';
      return 'todo';
    };

    return (
      <div className="overflow-hidden rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--bg-elevated)] shadow-[var(--shadow-md)]">
        <canvas ref={canvasRef} className="hidden" />

        <div className="relative aspect-[4/3] w-full bg-[var(--camera-bg)] sm:aspect-video">
          <video
            ref={videoRef}
            playsInline
            muted
            className={cn(
              'pointer-events-none h-full w-full object-cover transition-opacity duration-300',
              cameraState === 'active' ? 'opacity-100' : 'absolute opacity-0'
            )}
            aria-label="Live camera preview"
          />

          {(cameraState === 'idle' || cameraState === 'starting') && (
            <div className="flex h-full flex-col items-center justify-center gap-4 p-6 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-white/5 text-slate-300 ring-1 ring-white/10">
                <Video className="h-7 w-7" />
              </div>
              <div>
                <p className="font-display text-base font-semibold text-white">
                  {cameraState === 'starting' ? 'Starting camera…' : 'Camera ready'}
                </p>
                <p className="mt-1 text-sm text-slate-400">
                  Position your face inside the frame when prompted
                </p>
              </div>
              <Button onClick={startCamera} disabled={cameraState === 'starting'} aria-label="Start camera">
                <Camera className="h-4 w-4" />
                {cameraState === 'starting' ? 'Requesting permission…' : 'Start Camera'}
              </Button>
            </div>
          )}

          {(cameraState === 'denied' || cameraState === 'error') && (
            <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-rose-500/15 text-rose-300 ring-1 ring-rose-500/30">
                <ShieldAlert className="h-6 w-6" />
              </div>
              <p className="max-w-md text-sm text-rose-200">{errorMessage}</p>
              <Button variant="secondary" onClick={startCamera}>
                <RefreshCw className="h-4 w-4" />
                Retry Camera
              </Button>
            </div>
          )}

          {cameraState === 'active' && (
            <div className="pointer-events-none absolute inset-0 flex flex-col justify-between p-4">
              <div className="flex items-start justify-between gap-2">
                <span className="inline-flex items-center gap-2 rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-semibold text-emerald-300 ring-1 ring-emerald-500/30 backdrop-blur-md">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 pulse-border" />
                  Live
                </span>
                {enableLiveness && livenessStatus === 'passed' && (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-semibold text-emerald-300 ring-1 ring-emerald-500/30 backdrop-blur-md">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Liveness verified
                  </span>
                )}
                {isProcessing && (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-500/20 px-3 py-1 text-xs font-semibold text-blue-200 ring-1 ring-blue-400/30 backdrop-blur-md">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Processing
                  </span>
                )}
              </div>

              <div className="relative mx-auto flex h-52 w-40 items-center justify-center sm:h-56 sm:w-44">
                <div
                  className={cn(
                    'absolute inset-0 rounded-[28px] border-2 border-dashed',
                    livenessStatus === 'passed'
                      ? 'border-emerald-400/70'
                      : livenessStatus === 'failed'
                      ? 'border-rose-400/70'
                      : 'border-sky-300/60 pulse-border'
                  )}
                />
                {(livenessStatus === 'in_progress' || isProcessing) && (
                  <div className="scan-line top-0" />
                )}
                <span className="rounded-md bg-black/45 px-2 py-1 text-[11px] font-medium text-slate-200 backdrop-blur-sm">
                  {livenessStatus === 'in_progress'
                    ? 'Complete liveness'
                    : 'Position your face inside the frame'}
                </span>
              </div>

              {enableLiveness && livenessStatus === 'in_progress' && activeChallenge && (
                <div className="pointer-events-auto mx-auto w-full max-w-sm rounded-[var(--radius-lg)] border border-amber-400/30 bg-black/70 p-4 text-center shadow-[var(--shadow-lg)] backdrop-blur-md">
                  <p className="text-xs font-semibold uppercase tracking-wide text-amber-300">
                    Face Verification
                  </p>
                  <p className="mt-2 font-display text-base font-semibold text-white">
                    {activeChallenge.instruction}
                  </p>
                  <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10">
                    <div
                      className="h-full rounded-full bg-amber-400 transition-all duration-150"
                      style={{ width: `${Math.round(livenessProgress * 100)}%` }}
                      role="progressbar"
                      aria-valuenow={Math.round(livenessProgress * 100)}
                      aria-valuemin={0}
                      aria-valuemax={100}
                    />
                  </div>
                </div>
              )}

              {enableLiveness && livenessStatus === 'failed' && (
                <div className="pointer-events-auto mx-auto w-full max-w-sm rounded-[var(--radius-lg)] border border-rose-400/30 bg-black/75 p-4 text-center backdrop-blur-md">
                  <p className="font-semibold text-rose-200">Liveness failed</p>
                  <p className="mt-1 text-xs text-slate-300">{livenessReason}</p>
                  <Button
                    className="mt-3"
                    size="sm"
                    variant="secondary"
                    onClick={resetLiveness}
                  >
                    Retry Challenge
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="space-y-4 border-t border-[var(--border)] bg-[var(--bg-muted)]/40 p-4">
          <ol className="grid grid-cols-3 gap-2 text-xs" aria-label="Verification steps">
            {[
              { key: 'camera' as const, label: 'Camera' },
              { key: 'liveness' as const, label: 'Liveness' },
              { key: 'recognition' as const, label: 'Recognition' },
            ].map((step, idx) => {
              const state = stepState(step.key);
              return (
                <li
                  key={step.key}
                  className={cn(
                    'flex items-center gap-2 rounded-[var(--radius-sm)] px-2.5 py-2',
                    state === 'done' && 'bg-[var(--success-soft)] text-[var(--success)]',
                    state === 'current' && 'bg-[var(--primary-soft)] text-[var(--primary)]',
                    state === 'error' && 'bg-[var(--danger-soft)] text-[var(--danger)]',
                    state === 'todo' && 'bg-[var(--bg-elevated)] text-[var(--text-muted)]'
                  )}
                >
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-current/10 text-[10px] font-bold">
                    {state === 'done' ? '✓' : idx + 1}
                  </span>
                  {step.label}
                </li>
              );
            })}
          </ol>

          {cameraState === 'active' && (
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button
                variant="outline"
                onClick={stopCamera}
                disabled={isProcessing}
                className="sm:w-auto"
              >
                Stop Camera
              </Button>
              <Button
                fullWidth
                onClick={async () => {
                  const blob = await captureFrame();
                  if (blob && onCapture) onCapture(blob);
                }}
                disabled={isProcessing || (enableLiveness && livenessStatus !== 'passed')}
                loading={isProcessing}
                aria-label={captureLabel}
              >
                {isProcessing
                  ? processingLabel
                  : enableLiveness && livenessStatus !== 'passed'
                  ? 'Complete liveness first'
                  : captureLabel}
              </Button>
            </div>
          )}
        </div>
      </div>
    );
  }
);

AttendanceCamera.displayName = 'AttendanceCamera';
