import { useState, useEffect, useCallback, useRef } from 'react';
import { fetchLabels, addLabel, renameLabel, deleteLabel, fetchRecordings, type Recording } from '../utils/api';
import { Edit2, Trash2, Plus, Tag, Hash, CheckCircle2 } from 'lucide-react';

interface LabelManagerProps {
  signType: string;
  onSignTypeChange: (t: string) => void;
  selectedLabel: string | null;
  onSelectLabel: (label: string | null) => void;
  onToast: (msg: string, type?: 'success' | 'error') => void;
  refreshTrigger: number;
  onRefresh: () => void;
  signerTag: string;
}

interface LabelQuality {
  total: number;
  good: number;
  fair: number;
  poor: number;
}

// Multi-segment quality progress bar for kata labels
function QualityProgress({ q, target }: { q: LabelQuality; target: number }) {
  const complete = q.good >= target;
  const goodPct  = Math.min((q.good / target) * 100, 100);
  const fairPct  = Math.min(((q.good + q.fair) / target) * 100, 100) - goodPct;
  const poorPct  = Math.min((q.total / target) * 100, 100) - goodPct - fairPct;
  const extra    = q.fair + q.poor; // fair+poor shown as "+N"

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '2px' }}>
      <div style={{ width: '56px', height: '4px', background: 'var(--border-color, #e2e8f0)', borderRadius: '2px', overflow: 'hidden', display: 'flex' }}>
        <div style={{ width: `${goodPct}%`, height: '100%', background: complete ? 'var(--green, #2b8a3e)' : 'var(--accent, #3b5bdb)', transition: 'width 0.3s' }} />
        <div style={{ width: `${fairPct}%`, height: '100%', background: 'var(--orange, #e67700)' }} />
        <div style={{ width: `${poorPct}%`, height: '100%', background: 'var(--red, #fa5252)' }} />
      </div>
      <span style={{ fontSize: '0.72rem', fontVariantNumeric: 'tabular-nums', color: complete ? 'var(--green, #2b8a3e)' : 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '2px' }}>
        {complete && <CheckCircle2 size={9} style={{ color: 'var(--green, #2b8a3e)', flexShrink: 0 }} />}
        {q.good}/{target}
        {extra > 0 && <span style={{ color: 'var(--text-muted)', fontSize: '0.65rem' }}>+{extra}</span>}
      </span>
    </div>
  );
}

export default function LabelManager({
  signType,
  onSignTypeChange,
  selectedLabel,
  onSelectLabel,
  onToast,
  refreshTrigger,
  onRefresh,
  signerTag,
}: LabelManagerProps) {
  const [labels, setLabels] = useState<string[]>([]);
  const [newLabel, setNewLabel] = useState('');
  const [editingLabel, setEditingLabel] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [quality, setQuality] = useState<Record<string, LabelQuality>>({});
  const [target, setTarget] = useState(() => Number(localStorage.getItem('labelTarget') || 30));
  const renameDoneRef = useRef(false);

  const hurufLabels = labels.filter(l => /^[a-z]$/.test(l)).sort();
  const kataLabels = labels.filter(l => !/^[a-z]$/.test(l));
  const totalRecordings = Object.values(quality).reduce((a, b) => a + b.total, 0);

  const loadLabels = useCallback(async () => {
    const data = await fetchLabels(signType);
    setLabels(data);
    const allRecs: Recording[] = await fetchRecordings(signType);
    // Filter by signer: kalau signer dipilih, tampilkan progress milik signer itu saja
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
    loadLabels();
  }, [loadLabels, refreshTrigger]);

  const handleAddAllHuruf = async () => {
    const alphabet = 'abcdefghijklmnopqrstuvwxyz'.split('');
    const missing = alphabet.filter(l => !labels.includes(l));
    if (missing.length === 0) {
      onToast('Semua huruf A-Z sudah ada', 'success');
      return;
    }
    for (const letter of missing) {
      await addLabel(signType, letter);
    }
    onToast(`${missing.length} huruf ditambahkan`, 'success');
    loadLabels();
    onRefresh();
  };

  const handleAdd = async () => {
    if (!newLabel.trim()) return;
    const res = await addLabel(signType, newLabel.trim());
    if (res.error) {
      onToast(res.error, 'error');
    } else {
      setNewLabel('');
      onToast(`Label "${newLabel.trim()}" ditambahkan`, 'success');
      loadLabels();
      onRefresh();
    }
  };

  const handleRename = async (oldLabel: string) => {
    if (renameDoneRef.current) return;
    renameDoneRef.current = true;
    if (!editValue.trim() || editValue.trim() === oldLabel) {
      setEditingLabel(null);
      return;
    }
    const res = await renameLabel(signType, oldLabel, editValue.trim());
    if (res.error) {
      onToast(res.error, 'error');
    } else {
      onToast(`Label diubah: "${oldLabel}" → "${editValue.trim()}"`, 'success');
      if (selectedLabel === oldLabel) onSelectLabel(editValue.trim().toLowerCase());
      loadLabels();
      onRefresh();
    }
    setEditingLabel(null);
  };

  const startEditing = (label: string) => {
    renameDoneRef.current = false;
    setEditingLabel(label);
    setEditValue(label);
  };

  const handleDelete = async (label: string) => {
    if (!confirm(`Hapus label "${label}" beserta semua rekamannya?`)) return;
    await deleteLabel(signType, label);
    onToast(`Label "${label}" dihapus`, 'success');
    if (selectedLabel === label) onSelectLabel(null);
    loadLabels();
    onRefresh();
  };

  const handleKeyDown = (e: React.KeyboardEvent, action: () => void) => {
    if (e.key === 'Enter') { e.preventDefault(); action(); }
    if (e.key === 'Escape') { renameDoneRef.current = true; setEditingLabel(null); }
  };

  function hurufTileStyle(label: string, isSelected: boolean) {
    const q = quality[label];
    let bg = 'var(--bg-card)', border = 'var(--border-color)', color = 'var(--text-secondary)';
    if (isSelected) {
      bg = 'var(--accent)'; border = 'var(--accent)'; color = 'white';
    } else if (q) {
      if (q.good >= target) {
        bg = 'var(--green-subtle, #ebfbee)'; border = 'var(--green, #2b8a3e)'; color = 'var(--green, #2b8a3e)';
      } else if (q.good > 0) {
        bg = 'var(--accent-subtle, #edf2ff)'; border = 'var(--accent, #3b5bdb)'; color = 'var(--accent, #3b5bdb)';
      } else if (q.fair > 0) {
        bg = 'var(--orange-subtle, #fff9db)'; border = 'var(--orange, #e67700)'; color = 'var(--orange, #e67700)';
      } else if (q.poor > 0) {
        bg = 'var(--red-subtle, #ffe3e3)'; border = 'var(--red, #fa5252)'; color = 'var(--red, #fa5252)';
      }
    }
    return {
      padding: '7px 4px 5px', border: `1px solid ${border}`, borderRadius: '7px',
      background: bg, color, cursor: 'pointer', textAlign: 'center' as const,
      display: 'flex', flexDirection: 'column' as const, alignItems: 'center', gap: '1px',
      transition: 'all 120ms ease', userSelect: 'none' as const, position: 'relative' as const,
    };
  }

  return (
    <>
      {/* Tipe Isyarat */}
      <div className="sidebar-section">
        <div className="sidebar-title">Tipe Isyarat</div>
        <div className="type-tabs">
          <button
            className={`type-tab ${signType === 'sibi' ? 'active' : ''}`}
            onClick={() => { onSignTypeChange('sibi'); onSelectLabel(null); }}
          >
            SIBI
          </button>
          <button
            className={`type-tab ${signType === 'bisindo' ? 'active' : ''}`}
            onClick={() => { onSignTypeChange('bisindo'); onSelectLabel(null); }}
          >
            BISINDO
          </button>
        </div>
      </div>

      {/* Target & Semua */}
      <div className="sidebar-section" style={{ paddingBottom: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
            <span>Target per label:</span>
            <input
              type="number" min={1} max={999} value={target}
              onChange={e => { const v = Math.max(1, Number(e.target.value) || 1); setTarget(v); localStorage.setItem('labelTarget', String(v)); }}
              style={{ width: '46px', padding: '2px 4px', fontSize: '0.78rem', border: '1px solid var(--border-color)', borderRadius: '4px', background: 'var(--bg-input, #fff)', color: 'var(--text)', textAlign: 'center' }}
            />
          </div>
        </div>
        <div
          className={`label-item ${selectedLabel === null ? 'active' : ''}`}
          onClick={() => onSelectLabel(null)}
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
            Semua Rekaman
            {signerTag && (
              <span style={{ fontSize: '0.65rem', color: 'var(--accent)', fontWeight: 600, background: 'var(--accent-subtle)', padding: '0px 5px', borderRadius: '8px' }}>
                {signerTag}
              </span>
            )}
          </span>
          <span className="label-count">{totalRecordings}</span>
        </div>
      </div>

      {/* Huruf A-Z */}
      <div className="sidebar-section" style={{ paddingBottom: '8px' }}>
        {/* Quality legend */}
        <div style={{ display: 'flex', gap: '8px', fontSize: '0.68rem', color: 'var(--text-muted)', marginBottom: '6px', flexWrap: 'wrap' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: 'var(--green-subtle)', border: '1px solid var(--green, #2b8a3e)', display: 'inline-block' }} />
            Selesai
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: 'var(--accent-subtle)', border: '1px solid var(--accent)', display: 'inline-block' }} />
            Dalam proses
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: 'var(--orange-subtle)', border: '1px solid var(--orange)', display: 'inline-block' }} />
            Kualitas cukup
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
          <div className="sidebar-title" style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: 0 }}>
            <Hash size={12} /> Huruf ({hurufLabels.length}/26)
          </div>
          {signerTag && (
            <span style={{ fontSize: '0.68rem', color: 'var(--accent)', fontWeight: 600, background: 'var(--accent-subtle)', padding: '1px 6px', borderRadius: '10px' }}>
              {signerTag}
            </span>
          )}
          {hurufLabels.length < 26 && (
            <button
              className="btn btn-sm"
              onClick={handleAddAllHuruf}
              style={{ fontSize: '0.7rem', padding: '2px 8px', lineHeight: 1.4 }}
            >
              + A-Z
            </button>
          )}
        </div>

        {hurufLabels.length === 0 ? (
          <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', textAlign: 'center', padding: '8px 0' }}>
            Belum ada label huruf.<br />Klik "+ A-Z" untuk tambah semua.
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '4px' }}>
            {hurufLabels.map(label => {
              const q = quality[label];
              const complete = q ? q.good >= target : false;
              const isSelected = selectedLabel === label;
              const goodCount = q?.good ?? 0;
              const extra = q ? q.fair + q.poor : 0;
              const tooltipParts = q
                ? [`Baik: ${q.good}`, q.fair > 0 ? `Cukup: ${q.fair}` : '', q.poor > 0 ? `Buruk: ${q.poor}` : ''].filter(Boolean).join(' · ')
                : 'Belum ada rekaman';
              const signerNote = signerTag ? ` [${signerTag}]` : '';
              return (
                <button
                  key={label}
                  onClick={() => onSelectLabel(label)}
                  style={hurufTileStyle(label, isSelected)}
                  title={`${label.toUpperCase()}${signerNote} — ${tooltipParts} (target: ${target})`}
                >
                  {complete && !isSelected && (
                    <CheckCircle2 size={8} style={{ position: 'absolute', top: 3, right: 3, color: 'var(--green, #2b8a3e)' }} />
                  )}
                  <span style={{ fontSize: '0.9rem', fontWeight: 700, lineHeight: 1 }}>
                    {label.toUpperCase()}
                  </span>
                  <span style={{ fontSize: '0.58rem', fontWeight: 500, lineHeight: 1 }}>
                    {complete ? '✓' : goodCount > 0 ? goodCount : (extra > 0 ? `~${extra}` : '0')}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Kata */}
      <div className="sidebar-section" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        <div className="sidebar-title" style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
          <Tag size={12} /> Kata ({kataLabels.length})
        </div>

        <div className="add-label-row" style={{ marginBottom: '10px' }}>
          <input
            className="input"
            placeholder="Tambah kata baru..."
            value={newLabel}
            onChange={e => setNewLabel(e.target.value)}
            onKeyDown={e => handleKeyDown(e, handleAdd)}
          />
          <button
            className="btn btn-primary btn-sm"
            onClick={handleAdd}
            disabled={!newLabel.trim()}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '10px' }}
          >
            <Plus size={16} />
          </button>
        </div>

        <div className="label-list">
          {kataLabels.length === 0 && (
            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', textAlign: 'center', padding: '8px 0' }}>
              Belum ada label kata.
            </div>
          )}
          {kataLabels.map(label => (
            <div
              key={label}
              className={`label-item ${selectedLabel === label ? 'active' : ''}`}
              onClick={() => onSelectLabel(label)}
            >
              {editingLabel === label ? (
                <input
                  className="input"
                  value={editValue}
                  onChange={e => setEditValue(e.target.value)}
                  onBlur={() => handleRename(label)}
                  onKeyDown={e => handleKeyDown(e, () => handleRename(label))}
                  autoFocus
                  onClick={e => e.stopPropagation()}
                  style={{ padding: '2px 6px', fontSize: '0.82rem' }}
                />
              ) : (
                <>
                  <span style={{ flexShrink: 0, maxWidth: '90px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {label}
                  </span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                    <QualityProgress q={quality[label] ?? { total: 0, good: 0, fair: 0, poor: 0 }} target={target} />
                    <div className="label-actions">
                      <button className="btn-icon" title="Ubah nama" onClick={e => { e.stopPropagation(); startEditing(label); }}>
                        <Edit2 size={13} />
                      </button>
                      <button className="btn-icon danger" title="Hapus" onClick={e => { e.stopPropagation(); handleDelete(label); }}>
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
