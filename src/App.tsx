import { useState, useEffect, useCallback, useRef } from 'react';
import './App.css';
import LabelManager from './components/LabelManager';
import WebCamRecorder from './components/WebCamRecorder';
import DatasetList from './components/DatasetList';
import { fetchStats, fetchLabels, fetchRecordings, exportDataset, downloadZip, type LabelQuality } from './utils/api';
import { Download, Video, Database, User, UserPlus, Trash2, Archive, CheckCircle2, Target } from 'lucide-react';

interface Stats {
  sibi: { labels: number; recordings: number };
  bisindo: { labels: number; recordings: number };
  totalRecordings: number;
}

type ViewTab = 'record' | 'dataset';

const EMPTY_QUALITY: LabelQuality = { total: 0, good: 0, fair: 0, poor: 0 };

interface TargetBannerProps {
  signType: string;
  selectedLabel: string | null;
  labels: string[];
  quality: Record<string, LabelQuality>;
  target: number;
  onTargetChange: (v: number) => void;
  signerTag: string;
}

// Banner progress target — sticky di atas konten supaya tidak perlu scroll sidebar
function TargetBanner({ signType, selectedLabel, labels, quality, target, onTargetChange, signerTag }: TargetBannerProps) {
  const q = selectedLabel
    ? quality[selectedLabel] ?? EMPTY_QUALITY
    : labels.reduce(
        (acc, l) => {
          const lq = quality[l] ?? EMPTY_QUALITY;
          return { total: acc.total + lq.total, good: acc.good + lq.good, fair: acc.fair + lq.fair, poor: acc.poor + lq.poor };
        },
        { ...EMPTY_QUALITY }
      );

  const goal = selectedLabel ? target : labels.length * target;
  const remaining = Math.max(0, goal - q.good);
  const complete = goal > 0 && q.good >= goal;
  const goodPct = goal > 0 ? Math.min((q.good / goal) * 100, 100) : 0;
  const fairPct = goal > 0 ? Math.min(((q.good + q.fair) / goal) * 100, 100) - goodPct : 0;
  const poorPct = goal > 0 ? Math.min((q.total / goal) * 100, 100) - goodPct - fairPct : 0;
  const doneLabels = labels.filter(l => (quality[l]?.good ?? 0) >= target).length;

  return (
    <div
      style={{
        position: 'sticky', top: 0, zIndex: 5,
        display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap',
        padding: '12px 16px', marginBottom: '20px',
        border: `1px solid ${complete ? 'var(--green)' : 'var(--border-color)'}`,
        borderRadius: 'var(--radius-lg)',
        background: complete ? 'var(--green-subtle)' : 'var(--bg-card)',
        boxShadow: '0 2px 8px rgba(0,0,0,0.05)',
      }}
    >
      {/* Judul + status */}
      <div style={{ minWidth: '190px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.95rem', fontWeight: 700, color: complete ? 'var(--green)' : 'var(--text-primary)' }}>
          {complete ? <CheckCircle2 size={15} /> : <Target size={15} />}
          {selectedLabel ? `Target "${selectedLabel}"` : `Target ${signType.toUpperCase()} (semua label)`}
        </div>
        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '2px' }}>
          {complete
            ? 'Target tercapai — boleh lanjut label berikutnya'
            : selectedLabel
              ? `Kurang ${remaining} rekaman baik lagi`
              : `${doneLabels}/${labels.length} label selesai · kurang ${remaining} rekaman baik`}
          {signerTag && ` · perekam ${signerTag}`}
        </div>
      </div>

      {/* Progress bar */}
      <div style={{ flex: 1, minWidth: '200px' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: '5px' }}>
          <span style={{ fontSize: '1.15rem', fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: complete ? 'var(--green)' : 'var(--accent)' }}>
            {q.good}
            <span style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-muted)' }}> / {goal} baik</span>
          </span>
          <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
            {q.fair > 0 && `${q.fair} cukup`}
            {q.fair > 0 && q.poor > 0 && ' · '}
            {q.poor > 0 && `${q.poor} buruk`}
            {(q.fair > 0 || q.poor > 0) && ' (belum dihitung)'}
          </span>
        </div>
        <div style={{ height: '8px', borderRadius: '4px', background: 'var(--border-color)', overflow: 'hidden', display: 'flex' }}>
          <div style={{ width: `${goodPct}%`, background: complete ? 'var(--green)' : 'var(--accent)', transition: 'width 0.3s' }} />
          <div style={{ width: `${Math.max(0, fairPct)}%`, background: 'var(--orange)' }} />
          <div style={{ width: `${Math.max(0, poorPct)}%`, background: 'var(--red)' }} />
        </div>
      </div>

      {/* Setelan target */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
        <span>Target/label</span>
        <input
          type="number" min={1} max={999} value={target}
          onChange={e => onTargetChange(Number(e.target.value))}
          style={{ width: '58px', padding: '5px 6px', fontSize: '0.9rem', fontWeight: 600, border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)', background: 'var(--bg-input, #fff)', color: 'var(--text-primary)', textAlign: 'center' }}
        />
      </div>
    </div>
  );
}

function App() {
  const [signType, setSignType] = useState('sibi');
  const [selectedLabel, setSelectedLabel] = useState<string | null>(null);
  const [activeView, setActiveView] = useState<ViewTab>('record');
  const [stats, setStats] = useState<Stats | null>(null);
  const [labels, setLabels] = useState<string[]>([]);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [toasts, setToasts] = useState<{ id: number; msg: string; type: string }[]>([]);
  const [signers, setSigners] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem('signersList') || '[]'); }
    catch { return []; }
  });
  const [signerTag, setSignerTag] = useState(() => localStorage.getItem('signerTag') || '');
  const toastIdRef = useRef(0);
  const [quality, setQuality] = useState<Record<string, LabelQuality>>({});
  const [target, setTarget] = useState(() => Number(localStorage.getItem('labelTarget') || 30));
  const [addingNewSigner, setAddingNewSigner] = useState(false);
  const [newSignerInput, setNewSignerInput] = useState('');

  const refresh = () => setRefreshTrigger(prev => prev + 1);

  const loadStats = useCallback(async () => {
    const data = await fetchStats();
    setStats(data);
  }, []);

  const loadLabels = useCallback(async () => {
    const data = await fetchLabels(signType);
    setLabels(data);
  }, [signType]);

  // Hitung progress per label (dipakai banner di atas + sidebar)
  const loadQuality = useCallback(async () => {
    const allRecs = await fetchRecordings(signType);
    // Kalau perekam dipilih, progress dihitung untuk perekam itu saja
    const recs = signerTag ? allRecs.filter(r => r.signerTag === signerTag) : allRecs;
    const qMap: Record<string, LabelQuality> = {};
    recs.forEach(r => {
      if (!qMap[r.label]) qMap[r.label] = { total: 0, good: 0, fair: 0, poor: 0 };
      qMap[r.label].total++;
      const q = r.quality || (r.handDetectionRate >= 0.7 ? 'good' : r.handDetectionRate >= 0.4 ? 'fair' : 'poor');
      if (q === 'good') qMap[r.label].good++;
      else if (q === 'fair') qMap[r.label].fair++;
      else qMap[r.label].poor++;
    });
    setQuality(qMap);
  }, [signType, signerTag]);

  useEffect(() => {
    loadStats();
    loadLabels();
    loadQuality();
  }, [loadStats, loadLabels, loadQuality, refreshTrigger]);

  const changeTarget = (v: number) => {
    const n = Math.max(1, Math.min(999, Number(v) || 1));
    setTarget(n);
    localStorage.setItem('labelTarget', String(n));
  };

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
    // Date.now() bisa sama untuk dua toast beruntun → key React bentrok & toast hilang
    const id = ++toastIdRef.current;
    setToasts(prev => [...prev, { id, msg, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 3000);
  };

  const selectSigner = (name: string) => {
    setSignerTag(name);
    localStorage.setItem('signerTag', name);
  };

  const addSigner = () => {
    const name = newSignerInput.trim();
    if (!name) return;
    const normalized = name.charAt(0).toUpperCase() + name.slice(1);
    if (!signers.includes(normalized)) {
      const updated = [...signers, normalized];
      setSigners(updated);
      localStorage.setItem('signersList', JSON.stringify(updated));
    }
    selectSigner(normalized);
    setNewSignerInput('');
    setAddingNewSigner(false);
  };

  const removeSigner = (name: string) => {
    if (!confirm(`Hapus perekam "${name}" dari daftar?`)) return;
    const updated = signers.filter(s => s !== name);
    setSigners(updated);
    localStorage.setItem('signersList', JSON.stringify(updated));
    if (signerTag === name) selectSigner(updated[0] || '');
  };

  const handleDownloadZip = async () => {
    showToast('Menyiapkan ZIP...', 'success');
    try {
      await downloadZip();
      showToast('ZIP berhasil diunduh', 'success');
    } catch {
      showToast('Gagal mengunduh ZIP', 'error');
    }
  };

  const handleAutoAdvance = useCallback(() => {
    if (!selectedLabel || labels.length === 0) return;
    const idx = labels.indexOf(selectedLabel);
    // Lompati label yang targetnya sudah tercapai — dulu selalu ke label berikutnya
    // walau sudah penuh, jadi perekam harus pindah manual terus
    const next = labels.slice(idx + 1).find(l => (quality[l]?.good ?? 0) < target);
    if (next) {
      setSelectedLabel(next);
      showToast(`Auto-lanjut → "${next}"`, 'success');
    } else {
      showToast('Semua label berikutnya sudah mencapai target!', 'success');
    }
  }, [selectedLabel, labels, quality, target]);

  const handleExport = async () => {
    try {
      const data = await exportDataset();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `signlang-export-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      showToast('Dataset berhasil diekspor', 'success');
    } catch {
      showToast('Gagal mengekspor dataset', 'error');
    }
  };

  return (
    <div className="app-layout">
      {/* Header */}
      <header className="app-header">
        <h1>
        </h1>
        <div className="header-stats">
          {stats && (
            <>
              <div className="stat-chip">
                SIBI <span className="stat-value">{stats.sibi.recordings}</span>
              </div>
              <div className="stat-chip">
                BISINDO <span className="stat-value">{stats.bisindo.recordings}</span>
              </div>
              <div className="stat-chip">
                Total <span className="stat-value">{stats.totalRecordings}</span>
              </div>
            </>
          )}
          {/* Signer Manager */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
            <User size={14} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
            {addingNewSigner ? (
              <>
                <input
                  autoFocus
                  type="text"
                  placeholder="Nama perekam (mis: Rafif)"
                  value={newSignerInput}
                  onChange={e => setNewSignerInput(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') addSigner();
                    if (e.key === 'Escape') { setAddingNewSigner(false); setNewSignerInput(''); }
                  }}
                  style={{ fontSize: '0.8rem', padding: '4px 8px', border: '1px solid var(--border)', borderRadius: '6px', background: 'var(--bg-input, #fff)', color: 'var(--text)', width: '150px' }}
                />
                <button
                  className="btn btn-sm btn-primary"
                  onClick={addSigner}
                  disabled={!newSignerInput.trim()}
                  style={{ padding: '4px 10px', fontSize: '0.78rem' }}
                >
                  Simpan
                </button>
                <button
                  className="btn btn-sm"
                  onClick={() => { setAddingNewSigner(false); setNewSignerInput(''); }}
                  style={{ padding: '4px 8px', fontSize: '0.78rem' }}
                >
                  Batal
                </button>
              </>
            ) : (
              <>
                <select
                  value={signerTag}
                  onChange={e => selectSigner(e.target.value)}
                  style={{ fontSize: '0.8rem', padding: '4px 8px', border: '1px solid var(--border-color)', borderRadius: '6px', background: 'var(--bg-input, #fff)', color: signerTag ? 'var(--text)' : 'var(--text-muted)', minWidth: '110px', cursor: 'pointer' }}
                >
                  <option value="">-- Perekam --</option>
                  {signers.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
                <button
                  title="Tambah perekam baru"
                  onClick={() => setAddingNewSigner(true)}
                  style={{ display: 'flex', alignItems: 'center', padding: '5px 7px', border: '1px solid var(--border-color)', borderRadius: '6px', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer' }}
                >
                  <UserPlus size={13} />
                </button>
                {signerTag && (
                  <button
                    title={`Hapus "${signerTag}" dari daftar`}
                    onClick={() => removeSigner(signerTag)}
                    style={{ display: 'flex', alignItems: 'center', padding: '5px 6px', border: '1px solid var(--border-color)', borderRadius: '6px', background: 'transparent', color: 'var(--red)', cursor: 'pointer' }}
                  >
                    <Trash2 size={12} />
                  </button>
                )}
              </>
            )}
          </div>
          <button className="btn btn-sm" onClick={handleExport} title="Ekspor metadata sebagai JSON" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Download size={14} /> Ekspor JSON
          </button>
          <button className="btn btn-sm" onClick={handleDownloadZip} title="Download seluruh dataset sebagai ZIP (untuk Colab)" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Archive size={14} /> Download ZIP
          </button>
        </div>
      </header>

      <div className="app-body">
        {/* Sidebar */}
        <aside className="sidebar">
          <LabelManager
            signType={signType}
            onSignTypeChange={setSignType}
            selectedLabel={selectedLabel}
            onSelectLabel={setSelectedLabel}
            onToast={showToast}
            refreshTrigger={refreshTrigger}
            onRefresh={refresh}
            signerTag={signerTag}
            quality={quality}
            target={target}
          />
        </aside>

        {/* Main */}
        <main className="main-content">
          <div className="content-header">
            <div>
              <h2>
                {selectedLabel
                  ? `${selectedLabel}`
                  : `${signType.toUpperCase()} — Semua Rekaman`}
              </h2>
              <div className="breadcrumb">
                {signType.toUpperCase()} {selectedLabel && <> / <span>{selectedLabel}</span></>}
              </div>
            </div>
          </div>

          <TargetBanner
            signType={signType}
            selectedLabel={selectedLabel}
            labels={labels}
            quality={quality}
            target={target}
            onTargetChange={changeTarget}
            signerTag={signerTag}
          />

          {/* Tab View */}
          <div className="view-tabs">
            <button
              className={`view-tab ${activeView === 'record' ? 'active' : ''}`}
              onClick={() => setActiveView('record')}
              style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
            >
              <Video size={18} /> Perekaman
            </button>
            <button
              className={`view-tab ${activeView === 'dataset' ? 'active' : ''}`}
              onClick={() => setActiveView('dataset')}
              style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
            >
              <Database size={18} /> Dataset
            </button>
          </div>

          {/* Recorder sengaja TIDAK di-unmount saat pindah tab — kalau di-unmount,
              kamera + MediaPipe (±10 detik) harus di-load ulang tiap balik ke sini */}
          <div style={{ display: activeView === 'record' ? 'block' : 'none' }}>
            <WebCamRecorder
              signType={signType}
              selectedLabel={selectedLabel}
              labels={labels}
              signerTag={signerTag}
              active={activeView === 'record'}
              onRecorded={refresh}
              onAutoAdvance={handleAutoAdvance}
              onToast={showToast}
            />
          </div>
          {activeView === 'dataset' && (
            <DatasetList
              signType={signType}
              selectedLabel={selectedLabel}
              onToast={showToast}
              refreshTrigger={refreshTrigger}
              onRefresh={refresh}
            />
          )}
        </main>
      </div>

      {/* Toasts */}
      <div className="toast-container">
        {toasts.map(t => (
          <div key={t.id} className={`toast ${t.type}`}>
            {t.msg}
          </div>
        ))}
      </div>
    </div>
  );
}

export default App;
