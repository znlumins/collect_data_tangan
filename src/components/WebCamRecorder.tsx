import { useRef, useState, useEffect, useCallback } from 'react';
import { saveRecording } from '../utils/api';
import { Camera, X, Circle, Square, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';

const TARGET_FRAMES = 500;
const MEDIAPIPE_CDN = 'https://cdn.jsdelivr.net/npm/@mediapipe/holistic@0.5.1675471629';
const FRAME_INTERVAL_MS = 33; // ~30fps throttle for MediaPipe

interface WebCamRecorderProps {
  signType: string;
  selectedLabel: string | null;
  labels: string[];
  onRecorded: () => void;
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

// Helper: wait for a global to become available
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
  onRecorded,
  onToast,
}: WebCamRecorderProps) {
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

  const landmarksRef = useRef<LandmarkFrame[]>([]);
  const frameCountRef = useRef(0);
  const recordingRef = useRef(false);
  
  // Locks the targets so that sidebar clicks mid-recording don't mutate the save path
  const activeRecordSignTypeRef = useRef(signType);
  const activeRecordLabelRef = useRef(selectedLabel || '');

  useEffect(() => {
    onToastRef.current = onToast;
  }, [onToast]);

  useEffect(() => {
    // Only update the active label if we are NOT currently recording/counting down
    if (!recordingRef.current && countdownIntervalRef.current === null) {
      setCurrentLabel(selectedLabel || '');
      setFrameCount(0);
      frameCountRef.current = 0;
    }
  }, [selectedLabel, signType]);

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
          console.warn('Failed with ideal constraints, trying simple video constraint...', innerErr);
          stream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: false,
          });
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
          onToastRef.current('Gagal mengakses kamera. Pastikan izin kamera diberikan dan kamera tidak sedang digunakan oleh aplikasi lain.', 'error');
        }
      }
    };

    const timer = setTimeout(() => {
      initCamera();
    }, 100);

    return () => {
      active = false;
      clearTimeout(timer);
      if (stream) {
        stream.getTracks().forEach(t => t.stop());
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
        streamRef.current = null;
      }
      setCameraReady(false);
    };
  }, []);

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

          // Collect landmarks during recording — decoupled from frame counter (timer-based)
          if (recordingRef.current) {
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

    return () => {
      cancelled = true;
    };
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
    
    // Fallbacks for connections in case CDN fails to inject them into window
    const HAND_CONNECTIONS = (win.HAND_CONNECTIONS && win.HAND_CONNECTIONS.length > 0) ? win.HAND_CONNECTIONS : [[0,1],[1,2],[2,3],[3,4],[0,5],[5,6],[6,7],[7,8],[5,9],[9,10],[10,11],[11,12],[9,13],[13,14],[14,15],[15,16],[13,17],[0,17],[17,18],[18,19],[19,20]];
    const POSE_CONNECTIONS = (win.POSE_CONNECTIONS && win.POSE_CONNECTIONS.length > 0) ? win.POSE_CONNECTIONS : [[0,1],[1,2],[2,3],[3,7],[0,4],[4,5],[5,6],[6,8],[9,10],[11,12],[11,13],[13,15],[15,17],[15,19],[15,21],[17,19],[12,14],[14,16],[16,18],[16,20],[16,22],[18,20],[11,23],[12,24],[23,24],[23,25],[24,26],[25,27],[26,28],[27,29],[28,30],[29,31],[30,32],[27,31],[28,32]];

    if (!drawConnectorsFn || !drawLandmarksFn) {
      console.warn('drawConnectors or drawLandmarks not found on window');
      if (!win.__toastedMissing && mountedRef.current && typeof onToastRef.current === 'function') {
        win.__toastedMissing = true;
        onToastRef.current('Error: drawConnectors/drawLandmarks hilang dari window', 'error');
      }
      return;
    }

    if (results.poseLandmarks && POSE_CONNECTIONS) {
      drawConnectorsFn(ctx, results.poseLandmarks, POSE_CONNECTIONS, {
        color: 'rgba(79, 110, 247, 0.4)',
        lineWidth: 1,
      });
      drawLandmarksFn(ctx, results.poseLandmarks, {
        color: 'rgba(79, 110, 247, 0.6)',
        fillColor: 'rgba(79, 110, 247, 0.3)',
        radius: 2,
      });
    }

    if (results.leftHandLandmarks && HAND_CONNECTIONS) {
      drawConnectorsFn(ctx, results.leftHandLandmarks, HAND_CONNECTIONS, {
        color: '#30a46c',
        lineWidth: 2,
      });
      drawLandmarksFn(ctx, results.leftHandLandmarks, {
        color: '#30a46c',
        fillColor: '#30a46c',
        radius: 3,
      });
    }

    if (results.rightHandLandmarks && HAND_CONNECTIONS) {
      drawConnectorsFn(ctx, results.rightHandLandmarks, HAND_CONNECTIONS, {
        color: '#e5a33a',
        lineWidth: 2,
      });
      drawLandmarksFn(ctx, results.rightHandLandmarks, {
        color: '#e5a33a',
        fillColor: '#e5a33a',
        radius: 3,
      });
    }
  }, []);

  const processFrame = useCallback(async () => {
    if (!mountedRef.current) return;

    // Selalu jadwalkan frame berikutnya di awal agar loop tidak mati walau ada await yang hang
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
        console.error('[MediaPipe] Error saat mengirim frame:', err);
      } finally {
        processingRef.current = false;
      }
    }
  }, [cameraReady, mpReady]);

  useEffect(() => {
    if (cameraReady && mpReady && holisticRef.current) {
      processFrame();
    }
    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
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
        try {
          mediaRecorderRef.current.stop();
        } catch (err) {
          console.error('Failed to stop media recorder on unmount:', err);
        }
      }
    };
  }, []);

  const startCountdownAndRecord = () => {
    if (!currentLabel) {
      onToastRef.current('Pilih label terlebih dahulu', 'error');
      return;
    }

    setFrameCount(0);
    frameCountRef.current = 0;
    
    activeRecordSignTypeRef.current = signType;
    activeRecordLabelRef.current = currentLabel;

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

  const cancelCountdown = () => {
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }
    if (frameTimerRef.current) {
      clearInterval(frameTimerRef.current);
      frameTimerRef.current = null;
    }
    setCountdown(null);
    setFrameCount(0);
    frameCountRef.current = 0;
  };

  const startRecording = () => {
    if (!streamRef.current) return;

    landmarksRef.current = [];
    frameCountRef.current = 0;
    setFrameCount(0);
    chunksRef.current = [];

    let options: MediaRecorderOptions = { mimeType: 'video/webm;codecs=vp9' };
    if (typeof MediaRecorder.isTypeSupported === 'function') {
      if (!MediaRecorder.isTypeSupported(options.mimeType!)) {
        options = { mimeType: 'video/webm;codecs=vp8' };
      }
      if (!MediaRecorder.isTypeSupported(options.mimeType!)) {
        options = { mimeType: 'video/webm' };
      }
      if (!MediaRecorder.isTypeSupported(options.mimeType!)) {
        options = { mimeType: 'video/mp4' };
      }
    }

    const mr = new MediaRecorder(streamRef.current, options);
    mr.ondataavailable = e => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };
    mr.onstop = () => handleSave();
    mediaRecorderRef.current = mr;
    mr.start(100);

    recordingRef.current = true;
    setRecording(true);

    // Timer-based frame counter — independent of MediaPipe speed.
    // Counts video frames at FRAME_INTERVAL_MS (≈30fps) so recording always
    // completes in TARGET_FRAMES × FRAME_INTERVAL_MS ≈ 16.5s regardless of how
    // fast the MediaPipe model runs on the device.
    frameTimerRef.current = setInterval(() => {
      if (!mountedRef.current || !recordingRef.current) {
        if (frameTimerRef.current) clearInterval(frameTimerRef.current);
        frameTimerRef.current = null;
        return;
      }
      frameCountRef.current++;
      setFrameCount(frameCountRef.current);
      if (frameCountRef.current >= TARGET_FRAMES) {
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

      await saveRecording(saveSignType, saveLabel, videoBlob, landmarksRef.current, frameCountRef.current);
      if (!mountedRef.current) return;
      onToastRef.current(`Tersimpan! ${frameCountRef.current} frame untuk "${saveLabel}"`, 'success');
      onRecorded();
    } catch {
      if (mountedRef.current) {
        onToastRef.current('Gagal menyimpan rekaman', 'error');
      }
    }
    if (mountedRef.current) {
      setSaving(false);
    }
  };

  const progressPct = (frameCount / TARGET_FRAMES) * 100;

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
          style={{ 
            transform: 'scaleX(-1)',
            display: cameraReady ? 'block' : 'none' 
          }} 
        />
        <canvas 
          ref={canvasRef} 
          width={640}
          height={480}
          style={{ 
            transform: 'scaleX(-1)',
            display: cameraReady ? 'block' : 'none' 
          }} 
        />

        {countdown !== null && (
          <div className="recorder-overlay">
            <div className="countdown-display">{countdown}</div>
          </div>
        )}

        {recording && (
          <div className="recording-indicator">
            <span className="rec-dot" />
            REC
          </div>
        )}

        {(recording || frameCount > 0) && (
          <div className="frame-progress">
            <div className="frame-progress-bar">
              <div className="bar-fill" style={{ width: `${progressPct}%` }} />
            </div>
            <div className="frame-progress-text">{frameCount} / {TARGET_FRAMES}</div>
          </div>
        )}
      </div>

      <div className="recorder-controls">
        <div className="recorder-select-group">
          <select
            className="select"
            value={currentLabel}
            onChange={e => setCurrentLabel(e.target.value)}
            disabled={recording || countdown !== null}
          >
            <option value="">-- Pilih Label --</option>
            {labels.map(l => (
              <option key={l} value={l}>{l}</option>
            ))}
          </select>

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
          {countdown !== null ? (
            <button className="btn btn-danger" onClick={cancelCountdown} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <X size={16} /> Batal ({countdown})
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
                  <span>Rekam ({TARGET_FRAMES} frame)</span>
                </>
              )}
            </button>
          ) : (
            <button className="btn btn-danger" onClick={stopRecording} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Square size={16} fill="white" style={{ color: 'white' }} />
              <span>Stop ({frameCount}/{TARGET_FRAMES})</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
