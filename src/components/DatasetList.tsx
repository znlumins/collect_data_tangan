import { useState, useEffect, useCallback } from 'react';
import { FolderOpen, Edit2, Trash2, Save, X, ChevronLeft, ChevronRight } from 'lucide-react';
import {
  fetchRecordings,
  fetchLabels,
  updateRecording,
  deleteRecording,
  type Recording,
} from '../utils/api';

const ITEMS_PER_PAGE = 20;

interface DatasetListProps {
  signType: string;
  selectedLabel: string | null;
  onToast: (msg: string, type?: 'success' | 'error') => void;
  refreshTrigger: number;
  onRefresh: () => void;
}

function QualityBadge({ quality }: { quality?: string }) {
  const map: Record<string, { bg: string; color: string; label: string }> = {
    good: { bg: '#dcfce7', color: '#16a34a', label: 'Baik' },
    fair: { bg: '#fef9c3', color: '#b45309', label: 'Cukup' },
    poor: { bg: '#fee2e2', color: '#dc2626', label: 'Buruk' },
  };
  const d = map[quality || ''];
  if (!d) return null;
  return (
    <span style={{ fontSize: '0.7rem', padding: '1px 7px', borderRadius: '10px', background: d.bg, color: d.color, fontWeight: 600, whiteSpace: 'nowrap' }}>
      {d.label}
    </span>
  );
}

export default function DatasetList({
  signType,
  selectedLabel,
  onToast,
  refreshTrigger,
  onRefresh,
}: DatasetListProps) {
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [allLabels, setAllLabels] = useState<{ sibi: string[]; bisindo: string[] }>({ sibi: [], bisindo: [] });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState('');
  const [editType, setEditType] = useState('');
  const [qualityFilter, setQualityFilter] = useState<'all' | 'good' | 'fair' | 'poor'>('all');
  const [page, setPage] = useState(1);

  const load = useCallback(async () => {
    const recs = await fetchRecordings(signType, selectedLabel || undefined);
    setRecordings(recs);
    const sibiLabels = await fetchLabels('sibi');
    const bisindoLabels = await fetchLabels('bisindo');
    setAllLabels({ sibi: sibiLabels, bisindo: bisindoLabels });
  }, [signType, selectedLabel]);

  useEffect(() => { load(); }, [load, refreshTrigger]);
  useEffect(() => { setPage(1); }, [qualityFilter, signType, selectedLabel]);

  const filtered = qualityFilter === 'all' ? recordings : recordings.filter(r => r.quality === qualityFilter);
  const totalPages = Math.max(1, Math.ceil(filtered.length / ITEMS_PER_PAGE));
  const paginated = filtered.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE);

  // Menghapus item terakhir di halaman akhir bikin `page` melebihi totalPages → grid kosong
  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const handleEdit = (rec: Recording) => {
    setEditingId(rec.id);
    setEditLabel(rec.label);
    setEditType(rec.signType);
  };

  const handleEditTypeChange = (newType: string) => {
    setEditType(newType);
    const labelsForType = allLabels[newType as 'sibi' | 'bisindo'] || [];
    if (!labelsForType.includes(editLabel)) {
      setEditLabel(labelsForType.length > 0 ? labelsForType[0] : '');
    }
  };

  const handleSaveEdit = async (rec: Recording) => {
    if (!editLabel) { onToast('Label tidak boleh kosong', 'error'); return; }
    const updates: { newLabel?: string; newSignType?: string } = {};
    if (editLabel !== rec.label) updates.newLabel = editLabel;
    if (editType !== rec.signType) updates.newSignType = editType;
    if (Object.keys(updates).length === 0) { setEditingId(null); return; }
    const res = await updateRecording(rec.signType, rec.id, updates);
    if (res.error) { onToast(res.error, 'error'); } else { onToast('Rekaman berhasil diperbarui', 'success'); onRefresh(); }
    setEditingId(null);
  };

  const handleDelete = async (rec: Recording) => {
    if (!confirm(`Hapus rekaman "${rec.label}" (${rec.id.slice(0, 8)})?`)) return;
    const res = await deleteRecording(rec.signType, rec.id);
    if (res.error) { onToast(res.error, 'error'); } else { onToast('Rekaman dihapus', 'success'); onRefresh(); }
  };

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' }) +
      ' ' + d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
  };

  const getVideoUrl = (rec: Recording) =>
    `/videos/${rec.signType}/${encodeURIComponent(rec.label)}/${rec.videoFile}`;

  const qualityCounts = {
    good: recordings.filter(r => r.quality === 'good').length,
    fair: recordings.filter(r => r.quality === 'fair').length,
    poor: recordings.filter(r => r.quality === 'poor').length,
  };

  if (recordings.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-icon" style={{ marginBottom: '16px' }}>
          <FolderOpen size={48} style={{ color: 'var(--text-muted)' }} />
        </div>
        <p>{selectedLabel ? `Belum ada rekaman untuk label "${selectedLabel}"` : `Belum ada rekaman di ${signType.toUpperCase()}`}</p>
        <p style={{ marginTop: 8, fontSize: '0.85rem' }}>Mulai merekam menggunakan tab Perekaman di atas.</p>
      </div>
    );
  }

  return (
    <div>
      {/* Filter bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px', flexWrap: 'wrap' }}>
        <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)', fontWeight: 600 }}>Filter kualitas:</span>
        {(['all', 'good', 'fair', 'poor'] as const).map(q => {
          const label = q === 'all' ? `Semua (${recordings.length})` : q === 'good' ? `Baik (${qualityCounts.good})` : q === 'fair' ? `Cukup (${qualityCounts.fair})` : `Buruk (${qualityCounts.poor})`;
          const activeColor = q === 'good' ? '#16a34a' : q === 'fair' ? '#b45309' : q === 'poor' ? '#dc2626' : 'var(--accent)';
          return (
            <button
              key={q}
              onClick={() => setQualityFilter(q)}
              style={{
                fontSize: '0.78rem', padding: '3px 10px', borderRadius: '14px', border: '1px solid',
                borderColor: qualityFilter === q ? activeColor : 'var(--border-color)',
                background: qualityFilter === q ? (q === 'all' ? 'var(--accent-subtle)' : q === 'good' ? '#dcfce7' : q === 'fair' ? '#fef9c3' : '#fee2e2') : 'transparent',
                color: qualityFilter === q ? activeColor : 'var(--text-muted)',
                cursor: 'pointer', fontWeight: qualityFilter === q ? 700 : 400,
              }}
            >
              {label}
            </button>
          );
        })}
      </div>

      {filtered.length === 0 ? (
        <div className="empty-state">
          <p>Tidak ada rekaman dengan kualitas "{qualityFilter}"</p>
        </div>
      ) : (
        <>
          <div className="dataset-grid">
            {paginated.map(rec => (
              <div key={rec.id} className="recording-card">
                <video src={getVideoUrl(rec)} controls preload="metadata" style={{ transform: 'scaleX(-1)' }} />
                <div className="recording-card-body">
                  {editingId === rec.id ? (
                    <>
                      <div className="form-group">
                        <label>Tipe</label>
                        <select className="select" value={editType} onChange={e => handleEditTypeChange(e.target.value)} style={{ width: '100%' }}>
                          <option value="sibi">SIBI</option>
                          <option value="bisindo">BISINDO</option>
                        </select>
                      </div>
                      <div className="form-group">
                        <label>Label</label>
                        <select className="select" value={editLabel} onChange={e => setEditLabel(e.target.value)} style={{ width: '100%' }}>
                          {(allLabels[editType as 'sibi' | 'bisindo'] || []).length === 0
                            ? <option value="" disabled>Tidak ada label</option>
                            : (allLabels[editType as 'sibi' | 'bisindo'] || []).map(l => <option key={l} value={l}>{l}</option>)}
                        </select>
                      </div>
                      <div className="recording-card-actions">
                        <button className="btn btn-success btn-sm" onClick={() => handleSaveEdit(rec)} disabled={!editLabel} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <Save size={14} /> Simpan
                        </button>
                        <button className="btn btn-sm" onClick={() => setEditingId(null)} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <X size={14} /> Batal
                        </button>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="recording-card-meta">
                        <span className="recording-card-label">{rec.label}</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <QualityBadge quality={rec.quality} />
                          <span className={`recording-card-type ${rec.signType}`}>{rec.signType}</span>
                        </div>
                      </div>
                      <div className="recording-card-info">
                        {rec.frameCount} frame
                        {rec.signerTag ? ` · ${rec.signerTag}` : ''}
                        {rec.handDetectionRate > 0 ? ` · ${Math.round(rec.handDetectionRate * 100)}% tangan` : ''}
                        {rec.landmarkFile ? ' · ✓ LM' : ' · ✗ LM'}
                        {' · '}{formatDate(rec.createdAt)}
                      </div>
                      <div className="recording-card-actions">
                        <button className="btn btn-sm" onClick={() => handleEdit(rec)} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <Edit2 size={14} /> Edit
                        </button>
                        <button className="btn btn-danger btn-sm" onClick={() => handleDelete(rec)} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <Trash2 size={14} /> Hapus
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', marginTop: '20px' }}>
              <button
                className="btn btn-sm"
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                style={{ display: 'flex', alignItems: 'center', padding: '4px 8px' }}
              >
                <ChevronLeft size={16} />
              </button>
              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter(p => p === 1 || p === totalPages || Math.abs(p - page) <= 2)
                .reduce<(number | '...')[]>((acc, p, i, arr) => {
                  if (i > 0 && (p as number) - (arr[i - 1] as number) > 1) acc.push('...');
                  acc.push(p);
                  return acc;
                }, [])
                .map((p, i) => p === '...' ? (
                  <span key={`dots-${i}`} style={{ padding: '0 4px', color: 'var(--text-muted)' }}>…</span>
                ) : (
                  <button
                    key={p}
                    className={`btn btn-sm ${page === p ? 'btn-primary' : ''}`}
                    onClick={() => setPage(p as number)}
                    style={{ minWidth: '32px', padding: '4px 8px', fontWeight: page === p ? 700 : 400 }}
                  >
                    {p}
                  </button>
                ))
              }
              <button
                className="btn btn-sm"
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                style={{ display: 'flex', alignItems: 'center', padding: '4px 8px' }}
              >
                <ChevronRight size={16} />
              </button>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginLeft: '4px' }}>
                {(page - 1) * ITEMS_PER_PAGE + 1}–{Math.min(page * ITEMS_PER_PAGE, filtered.length)} dari {filtered.length}
              </span>
            </div>
          )}
        </>
      )}
    </div>
  );
}
