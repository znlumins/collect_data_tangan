import { useRef, useState, useEffect, useCallback } from 'react';
import { saveRecording } from '../utils/api';
import { Camera, X, Circle, Square, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';

// SIBI: gesture semi-statis → 100 frame (~3 detik)
// BISINDO: gesture dinamis → 300 frame (~10 detik)
const TARGET_FRAMES_MAP: Record<string, number> = { sibi: 100, bisindo: 300 };
const MEDIAPIPE_CDN = 'https://cdn.jsdelivr.net/npm/@mediapipe/holistic@0.5.1675471629';
const FRAME_INTERVAL_MS = 33; // ~30fps

interface WebCamRecorderProps {
  signType: string;
  selectedLabel: string | null;
  labels: string[];
  signerTag: string;
  onRecorded: () => void;
  onAutoAdvance: () => void;
  onToast: (msg: string, type?: 'success' | 'error') => void;
}

interface LandmarkPoint {
  x: number;
  y: number;
  z: number;
  visibility?: number;
}

interface LandmarkFrame {
  frame: number;
  timestamp: number;
  leftHand: LandmarkPoint[] | null;
  leftHandWorld: LandmarkPoint[] | null;
  rightHand: LandmarkPoint[] | null;
  rightHandWorld: LandmarkPoint[] | null;
  pose: LandmarkPoint[] | null;
  poseWorld: LandmarkPoint[] | null;
}

function waitForGlobal(name: string, timeout = 15000): Promise<any> {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const check = () => {
      if ((window as any)[name]) {
        resolve((window as any)[name]);
      } else if (Date.now() - start > timeout) {
        reject(new Error(`Timeout waiting for ${name}`));
      } else {
        setTimeout(check, 200);
      }
    };
    check();
  });
}

export default function WebCamRecorder({
  signType,
  selectedLabel,
  labels,
  signerTag,
  onRecorded,
  onAutoAdvance,
  onToast,
}: WebCamRecorderProps) {
  // --- Refs ---
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const holisticRef = useRef<any>(null);
  const animationRef = useRef<number>(0);
  const chunksRef = useRef<Blob[]>([]);
  const countdownIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastFrameTimeRef = useRef<number>(0);
  const processingRef = useRef<boolean>(false);
  const frameTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mountedRef = useRef<boolean>(true);
  const onToastRef = useRef(onToast);
  const landmarksRef = useRef<LandmarkFrame[]>([]);
  const frameCountRef = useRef(0);
  const recordingRef = useRef(false);
  const handFramesRef = useRef(0);       // frame dengan tangan terdeteksi saat recording
  const batchDoneRef = useRef(0);
  const batchTargetRef = useRef(1);
  const waitingForHandRef = useRef(false);
  const landmarkDetectedRef = useRef(false);
  const activeRecordSignTypeRef = useRef(signType);
  const activeRecordLabelRef = useRef(selectedLabel || '');

  // --- State ---
  const [cameraReady, setCameraReady] = useState(false);
  const [mpReady, setMpReady] = useState(false);
  const [mpLoading, setMpLoading] = useState(true);
  const [mpProgressLabel, setMpProgressLabel] = useState('Menginisialisasi...');
  const [recording, setRecording] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [frameCount, setFrameCount] = useState(0);
  const [currentLabel, setCurrentLabel] = useState(selectedLabel || '');
  const [saving, setSaving] = useState(false);
  const [landmarkDetected, setLandmarkDetected] = useState(false);
  const [batchTarget, setBatchTarget] = useState(1);
  const [batchDone, setBatchDone] = useState(0);
  const [waitingForHand, setWaitingForHand] = useState(false);
  const [autoAdvance, setAutoAdvance] = useState(() => localStorage.getItem('autoAdvance') === 'true');

  const targetFrames = TARGET_FRAMES_MAP[signType] ?? 100;

  // Keep refs in sync with state/props
  useEffect(() => { onToastRef.current = onToast; }, [onToast]);
  useEffect(() => { batchTargetRef.current = batchTarget; }, [batchTarget]);
  useEffect(() => { landmarkDetectedRef.current = landmarkDetected; }, [landmarkDetected]);

  useEffect(() => {
    if (!recordingRef.current && countdownIntervalRef.current === null && !waitingForHandRef.current) {
      setCurrentLabel(selectedLabel || '');
      setFrameCount(0);
      frameCountRef.current = 0;
    }
  }, [selectedLabel, signType]);

  // --- Camera Init ---
  useEffect(() => {
    let active = true;
    let stream: MediaStream | null = null;

    const initCamera = async () => {
      try {
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
            audio: false,
          });
        } catch (innerErr) {
          console.warn('Failed with ideal constraints, trying simple video...', innerErr);
          stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        }
        if (!active) {
          if (stream) stream.getTracks().forEach(t => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
          setCameraReady(true);
        }
      } catch (err) {
        if (active) {
          console.error('Camera access error:', err);
          onToastRef.current('Gagal mengakses kamera. Pastikan izin kamera diberikan dan kamera tidak sedang digunakan aplikasi lain.', 'error');
        }
      }
    };

    const timer = setTimeout(initCamera, 100);
    return () => {
      active = false;
      clearTimeout(timer);
      if (stream) stream.getTracks().forEach(t => t.stop());
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
        streamRef.current = null;
      }
      setCameraReady(false);
    };
  }, []);

  // --- MediaPipe Init ---
  useEffect(() => {
    let cancelled = false;

    const initMediaPipe = async () => {
      try {
        const HolisticClass = await waitForGlobal('Holistic', 20000);
        if (cancelled) return;

        const holistic = new HolisticClass({
          locateFile: (file: string) => {
            setMpProgressLabel(`Mengunduh ${file}...`);
            return `${MEDIAPIPE_CDN}/${file}`;
          },
        });

        holistic.setOptions({
          modelComplexity: 1,
          smoothLandmarks: true,
          enableSegmentation: false,
          smoothSegmentation: false,
          refineFaceLandmarks: false,
          minDetectionConfidence: 0.5,
          minTrackingConfidence: 0.5,
        });

        holistic.onResults((results: any) => {
          if (!mountedRef.current) return;
          try {
            drawLandmarks(results);
          } catch (e: any) {
            console.error('Error drawing landmarks:', e);
            const win = window as any;
            if (!win.__toastedError && mountedRef.current && typeof onToastRef.current === 'function') {
              win.__toastedError = true;
              onToastRef.current(`Error drawing: ${e.message}`, 'error');
            }
          } finally {
            processingRef.current = false;
          }

          const hasLandmarks = !!(
            results.leftHandLandmarks?.length ||
            results.rightHandLandmarks?.length ||
            results.poseLandmarks?.length
          );
          setLandmarkDetected(hasLandmarks);
          landmarkDetectedRef.current = hasLandmarks;

          // Warmup: jika menunggu tangan dan tangan sudah terdeteksi → mulai countdown
          const hasHand = !!(results.leftHandLandmarks?.length || results.rightHandLandmarks?.length);
          if (waitingForHandRef.current && hasHand) {
            waitingForHandRef.current = false;
            setWaitingForHand(false);
            setTimeout(() => {
              if (mountedRef.current && !recordingRef.current) doStartCountdown();
            }, 0);
          }

          // Kumpulkan landmark saat recording — frame counter terpisah dari MediaPipe
          if (recordingRef.current) {
            if (hasHand) handFramesRef.current++;
            const frame: LandmarkFrame = {
              frame: frameCountRef.current,
              timestamp: Date.now(),
              leftHand: results.leftHandLandmarks || null,
              leftHandWorld: results.leftHandWorldLandmarks || null,
              rightHand: results.rightHandLandmarks || null,
              rightHandWorld: results.rightHandWorldLandmarks || null,
              pose: results.poseLandmarks || null,
              poseWorld: results.poseWorldLandmarks || null,
            };
            landmarksRef.current.push(frame);
          }
        });

        if (!cancelled) {
          await holistic.initialize();
          holisticRef.current = holistic;
          setMpReady(true);
          setMpLoading(false);
        }
      } catch (err) {
        if (cancelled) return;
        console.error('MediaPipe init error:', err);
        onToastRef.current('MediaPipe gagal dimuat. Perekaman tanpa landmark.', 'error');
        setMpReady(true);
        setMpLoading(false);
      }
    };

    initMediaPipe();
    return () => { cancelled = true; };
  }, []);

  const drawLandmarks = useCallback((results: any) => {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const win = window as any;
    const drawConnectorsFn = win.drawConnectors;
    const drawLandmarksFn = win.drawLandmarks;

    const HAND_CONNECTIONS = (win.HAND_CONNECTIONS && win.HAND_CONNECTIONS.length > 0)
      ? win.HAND_CONNECTIONS
      : [[0,1],[1,2],[2,3],[3,4],[0,5],[5,6],[6,7],[7,8],[5,9],[9,10],[10,11],[11,12],[9,13],[13,14],[14,15],[15,16],[13,17],[0,17],[17,18],[18,19],[19,20]];
    const POSE_CONNECTIONS = (win.POSE_CONNECTIONS && win.POSE_CONNECTIONS.length > 0)
      ? win.POSE_CONNECTIONS
      : [[0,1],[1,2],[2,3],[3,7],[0,4],[4,5],[5,6],[6,8],[9,10],[11,12],[11,13],[13,15],[15,17],[15,19],[15,21],[17,19],[12,14],[14,16],[16,18],[16,20],[16,22],[18,20],[11,23],[12,24],[23,24],[23,25],[24,26],[25,27],[26,28],[27,29],[28,30],[29,31],[30,32],[27,31],[28,32]];

    if (!drawConnectorsFn || !drawLandmarksFn) {
      console.warn('drawConnectors or drawLandmarks not found on window');
      const win2 = window as any;
      if (!win2.__toastedMissing && mountedRef.current && typeof onToastRef.current === 'function') {
        win2.__toastedMissing = true;
        onToastRef.current('Error: drawConnectors/drawLandmarks hilang dari window', 'error');
      }
      return;
    }

    if (results.poseLandmarks && POSE_CONNECTIONS) {
      drawConnectorsFn(ctx, results.poseLandmarks, POSE_CONNECTIONS, { color: 'rgba(79, 110, 247, 0.4)', lineWidth: 1 });
      drawLandmarksFn(ctx, results.poseLandmarks, { color: 'rgba(79, 110, 247, 0.6)', fillColor: 'rgba(79, 110, 247, 0.3)', radius: 2 });
    }
    if (results.leftHandLandmarks && HAND_CONNECTIONS) {
      drawConnectorsFn(ctx, results.leftHandLandmarks, HAND_CONNECTIONS, { color: '#30a46c', lineWidth: 2 });
      drawLandmarksFn(ctx, results.leftHandLandmarks, { color: '#30a46c', fillColor: '#30a46c', radius: 3 });
    }
    if (results.rightHandLandmarks && HAND_CONNECTIONS) {
      drawConnectorsFn(ctx, results.rightHandLandmarks, HAND_CONNECTIONS, { color: '#e5a33a', lineWidth: 2 });
      drawLandmarksFn(ctx, results.rightHandLandmarks, { color: '#e5a33a', fillColor: '#e5a33a', radius: 3 });
    }
  }, []);

  const processFrame = useCallback(async () => {
    if (!mountedRef.current) return;
    animationRef.current = requestAnimationFrame(processFrame);

    const now = Date.now();
    const video = videoRef.current;
    if (
      video &&
      video.readyState >= 2 &&
      video.videoWidth > 0 &&
      holisticRef.current &&
      !processingRef.current &&
      now - lastFrameTimeRef.current >= FRAME_INTERVAL_MS
    ) {
      processingRef.current = true;
      lastFrameTimeRef.current = now;
      try {
        await holisticRef.current.send({ image: video });
      } catch (err) {
        console.error('[MediaPipe] Error sending frame:', err);
      } finally {
        processingRef.current = false;
      }
    }
  }, [cameraReady, mpReady]);

  useEffect(() => {
    if (cameraReady && mpReady && holisticRef.current) processFrame();
    return () => { if (animationRef.current) cancelAnimationFrame(animationRef.current); };
  }, [cameraReady, mpReady, processFrame]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
      if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
      if (frameTimerRef.current) clearInterval(frameTimerRef.current);
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.onstop = null;
        try { mediaRecorderRef.current.stop(); } catch (err) { console.error(err); }
      }
    };
  }, []);

  // --- Spacebar shortcut ---
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Space') return;
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
      e.preventDefault();
      if (recordingRef.current) {
        stopRecording();
      } else if (countdownIntervalRef.current !== null || waitingForHandRef.current) {
        cancelCountdown();
      } else if (cameraReady && currentLabel) {
        startCountdownAndRecord();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [cameraReady, currentLabel]);

  // --- Recording Logic ---

  const doStartCountdown = () => {
    setCountdown(3);
    let c = 3;
    countdownIntervalRef.current = setInterval(() => {
      c--;
      if (!mountedRef.current) {
        if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
        return;
      }
      if (c > 0) {
        setCountdown(c);
      } else {
        setCountdown(null);
        if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
        countdownIntervalRef.current = null;
        startRecording();
      }
    }, 1000);
  };

  const startCountdownAndRecord = () => {
    if (!currentLabel) {
      onToastRef.current('Pilih label terlebih dahulu', 'error');
      return;
    }

    setFrameCount(0);
    frameCountRef.current = 0;
    setBatchDone(0);
    batchDoneRef.current = 0;
    activeRecordSignTypeRef.current = signType;
    activeRecordLabelRef.current = currentLabel;

    if (!landmarkDetectedRef.current) {
      waitingForHandRef.current = true;
      setWaitingForHand(true);
      return;
    }
    doStartCountdown();
  };

  const cancelCountdown = () => {
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }
    if (frameTimerRef.current) {
      clearInterval(frameTimerRef.current);
      frameTimerRef.current = null;
    }
    waitingForHandRef.current = false;
    setWaitingForHand(false);
    setCountdown(null);
    setFrameCount(0);
    frameCountRef.current = 0;
    setBatchDone(0);
    batchDoneRef.current = 0;
  };

  const startRecording = () => {
    if (!streamRef.current) return;

    landmarksRef.current = [];
    frameCountRef.current = 0;
    handFramesRef.current = 0;
    setFrameCount(0);
    chunksRef.current = [];

    let options: MediaRecorderOptions = { mimeType: 'video/webm;codecs=vp9' };
    if (typeof MediaRecorder.isTypeSupported === 'function') {
      if (!MediaRecorder.isTypeSupported(options.mimeType!)) options = { mimeType: 'video/webm;codecs=vp8' };
      if (!MediaRecorder.isTypeSupported(options.mimeType!)) options = { mimeType: 'video/webm' };
      if (!MediaRecorder.isTypeSupported(options.mimeType!)) options = { mimeType: 'video/mp4' };
    }

    const mr = new MediaRecorder(streamRef.current, options);
    mr.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data); };
    mr.onstop = () => handleSave();
    mediaRecorderRef.current = mr;
    mr.start(100);

    recordingRef.current = true;
    setRecording(true);

    // Frame counter berbasis timer — independent dari kecepatan MediaPipe
    const capturedTargetFrames = TARGET_FRAMES_MAP[activeRecordSignTypeRef.current] ?? 100;
    frameTimerRef.current = setInterval(() => {
      if (!mountedRef.current || !recordingRef.current) {
        if (frameTimerRef.current) clearInterval(frameTimerRef.current);
        frameTimerRef.current = null;
        return;
      }
      frameCountRef.current++;
      setFrameCount(frameCountRef.current);
      if (frameCountRef.current >= capturedTargetFrames) {
        clearInterval(frameTimerRef.current!);
        frameTimerRef.current = null;
        stopRecording();
      }
    }, FRAME_INTERVAL_MS);
  };

  const stopRecording = () => {
    if (frameTimerRef.current) {
      clearInterval(frameTimerRef.current);
      frameTimerRef.current = null;
    }
    recordingRef.current = false;
    setRecording(false);
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
  };

  const handleSave = async () => {
    if (!mountedRef.current) return;
    setSaving(true);
    try {
      const videoBlob = new Blob(chunksRef.current, { type: 'video/webm' });
      if (videoBlob.size === 0) {
        if (mountedRef.current) {
          onToastRef.current('Perekaman gagal: Video kosong atau kamera terputus', 'error');
          setSaving(false);
        }
        return;
      }

      const saveSignType = activeRecordSignTypeRef.current;
      const saveLabel = activeRecordLabelRef.current;
      const capturedFrameCount = frameCountRef.current;
      const handDetectionRate = capturedFrameCount > 0
        ? Math.min(Math.round((handFramesRef.current / capturedFrameCount) * 100) / 100, 1.0)
        : 0;

      await saveRecording(
        saveSignType, saveLabel, videoBlob,
        landmarksRef.current, capturedFrameCount,
        signerTag, handDetectionRate,
      );
      if (!mountedRef.current) return;

      batchDoneRef.current++;
      setBatchDone(batchDoneRef.current);
      const currentBatchTarget = batchTargetRef.current;

      if (batchDoneRef.current < currentBatchTarget) {
        // Lanjutkan batch berikutnya setelah 2 detik
        onToastRef.current(
          `${batchDoneRef.current}/${currentBatchTarget} tersimpan — lanjut dalam 2 detik...`,
          'success'
        );
        setTimeout(() => {
          if (!mountedRef.current) return;
          setFrameCount(0);
          frameCountRef.current = 0;
          if (!landmarkDetectedRef.current) {
            waitingForHandRef.current = true;
            setWaitingForHand(true);
          } else {
            doStartCountdown();
          }
        }, 2000);
      } else {
        // Batch selesai
        const qualityLabel = handDetectionRate >= 0.7 ? 'baik' : handDetectionRate >= 0.4 ? 'cukup' : 'buruk';
        const msg = currentBatchTarget > 1
          ? `Batch selesai! ${currentBatchTarget} rekaman untuk "${saveLabel}"`
          : `Tersimpan! ${capturedFrameCount} frame — kualitas ${qualityLabel} (${Math.round(handDetectionRate * 100)}%)`;
        onToastRef.current(msg, 'success');
        setBatchDone(0);
        batchDoneRef.current = 0;
        onRecorded();
        if (autoAdvance) setTimeout(() => { if (mountedRef.current) onAutoAdvance(); }, 500);
      }
    } catch {
      if (mountedRef.current) onToastRef.current('Gagal menyimpan rekaman', 'error');
    }
    if (mountedRef.current) setSaving(false);
  };

  const progressPct = (frameCount / targetFrames) * 100;
  const isBusy = recording || countdown !== null || saving || waitingForHand;

  return (
    <div className="recorder-container">
      <div className="recorder-video-area">
        {!cameraReady && (
          <div className="camera-placeholder">
            <Camera size={48} style={{ color: 'var(--text-muted)', marginBottom: '8px' }} />
            <p style={{ fontSize: '1rem', fontWeight: 500 }}>Menunggu akses kamera...</p>
          </div>
        )}
        <video
          ref={videoRef}
          playsInline
          muted
          width={640}
          height={480}
          style={{ transform: 'scaleX(-1)', display: cameraReady ? 'block' : 'none' }}
        />
        <canvas
          ref={canvasRef}
          width={640}
          height={480}
          style={{ transform: 'scaleX(-1)', display: cameraReady ? 'block' : 'none' }}
        />

        {/* Warmup overlay */}
        {waitingForHand && (
          <div className="recorder-overlay">
            <div style={{ textAlign: 'center', color: 'white' }}>
              <AlertCircle size={48} style={{ marginBottom: '12px', color: '#f59e0b' }} />
              <div style={{ fontSize: '1.2rem', fontWeight: 600 }}>Arahkan tangan ke kamera</div>
              <div style={{ fontSize: '0.9rem', opacity: 0.8, marginTop: '6px' }}>
                Rekaman dimulai otomatis saat tangan terdeteksi
              </div>
            </div>
          </div>
        )}

        {countdown !== null && (
          <div className="recorder-overlay">
            <div className="countdown-display">{countdown}</div>
          </div>
        )}

        {recording && (
          <div className="recording-indicator">
            <span className="rec-dot" />
            REC {batchTarget > 1 && (
              <span style={{ marginLeft: '6px', fontSize: '0.85em', opacity: 0.9 }}>
                ({batchDone + 1}/{batchTarget})
              </span>
            )}
          </div>
        )}

        {(recording || frameCount > 0) && (
          <div className="frame-progress">
            <div className="frame-progress-bar">
              <div className="bar-fill" style={{ width: `${progressPct}%` }} />
            </div>
            <div className="frame-progress-text">{frameCount} / {targetFrames}</div>
          </div>
        )}
      </div>

      <div className="recorder-controls">
        <div className="recorder-select-group">
          <select
            className="select"
            value={currentLabel}
            onChange={e => setCurrentLabel(e.target.value)}
            disabled={isBusy}
          >
            <option value="">-- Pilih Label --</option>
            {labels.map(l => (
              <option key={l} value={l}>{l}</option>
            ))}
          </select>

          {/* Batch count selector */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
              Jumlah:
            </span>
            <select
              className="select"
              value={batchTarget}
              onChange={e => setBatchTarget(Number(e.target.value))}
              disabled={isBusy}
              style={{ width: 'auto', minWidth: '60px' }}
            >
              {[1, 3, 5, 10, 20, 30, 50].map(n => (
                <option key={n} value={n}>{n}×</option>
              ))}
            </select>
          </div>

          {/* Auto-advance toggle */}
          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', color: 'var(--text-muted)', cursor: 'pointer', userSelect: 'none' }}>
            <input
              type="checkbox"
              checked={autoAdvance}
              onChange={e => {
                setAutoAdvance(e.target.checked);
                localStorage.setItem('autoAdvance', String(e.target.checked));
              }}
              style={{ cursor: 'pointer' }}
            />
            Auto lanjut label
          </label>

          {/* MediaPipe status */}
          <div style={{
            fontSize: '0.9rem',
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            color: mpLoading ? 'var(--orange)' : landmarkDetected ? 'var(--green)' : 'var(--text-muted)'
          }}>
            {mpLoading ? (
              <>
                <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />
                <span>{mpProgressLabel}</span>
              </>
            ) : mpReady && holisticRef.current ? (
              landmarkDetected ? (
                <>
                  <CheckCircle2 size={16} />
                  <span>Landmark Aktif</span>
                </>
              ) : (
                <>
                  <AlertCircle size={16} />
                  <span>Tidak terdeteksi</span>
                </>
              )
            ) : (
              <>
                <AlertCircle size={16} />
                <span>MediaPipe tidak tersedia</span>
              </>
            )}
          </div>
        </div>

        <div className="recorder-btn-group">
          {(waitingForHand || countdown !== null) ? (
            <button
              className="btn btn-danger"
              onClick={cancelCountdown}
              style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              <X size={16} />
              {countdown !== null ? `Batal (${countdown})` : 'Batal'}
            </button>
          ) : !recording ? (
            <button
              className="btn btn-primary"
              onClick={startCountdownAndRecord}
              disabled={!cameraReady || !currentLabel || saving}
              style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
            >
              {saving ? (
                <>
                  <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />
                  <span>Menyimpan...</span>
                </>
              ) : (
                <>
                  <Circle size={16} fill="white" style={{ color: 'white' }} />
                  <span>
                    Rekam{batchTarget > 1 ? ` ${batchTarget}×` : ''} ({targetFrames} frame)
                    <span style={{ fontSize: '0.75em', opacity: 0.7, marginLeft: '6px' }}>[Space]</span>
                  </span>
                </>
              )}
            </button>
          ) : (
            <button
              className="btn btn-danger"
              onClick={stopRecording}
              style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
            >
              <Square size={16} fill="white" style={{ color: 'white' }} />
              <span>Stop ({frameCount}/{targetFrames})</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
