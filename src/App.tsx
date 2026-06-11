import { useState, useEffect, useCallback } from 'react';
import './App.css';
import LabelManager from './components/LabelManager';
import WebCamRecorder from './components/WebCamRecorder';
import DatasetList from './components/DatasetList';
import { fetchStats, fetchLabels, exportDataset, downloadZip } from './utils/api';
import { Download, Video, Database, User, UserPlus, Trash2, Archive } from 'lucide-react';

interface Stats {
  sibi: { labels: number; recordings: number };
  bisindo: { labels: number; recordings: number };
  totalRecordings: number;
}

type ViewTab = 'record' | 'dataset';

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

  useEffect(() => {
    loadStats();
    loadLabels();
  }, [loadStats, loadLabels, refreshTrigger]);

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
    const id = Date.now();
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
    if (idx < labels.length - 1) {
      setSelectedLabel(labels[idx + 1]);
      showToast(`Auto-lanjut → "${labels[idx + 1]}"`, 'success');
    } else {
      showToast('Semua label sudah selesai!', 'success');
    }
  }, [selectedLabel, labels]);

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

          {activeView === 'record' ? (
            <WebCamRecorder
              signType={signType}
              selectedLabel={selectedLabel}
              labels={labels}
              signerTag={signerTag}
              onRecorded={refresh}
              onAutoAdvance={handleAutoAdvance}
              onToast={showToast}
            />
          ) : (
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
