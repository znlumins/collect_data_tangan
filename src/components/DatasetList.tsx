import { useState, useEffect, useCallback } from 'react';
import { FolderOpen, Edit2, Trash2, Save, X } from 'lucide-react';
import {
  fetchRecordings,
  fetchLabels,
  updateRecording,
  deleteRecording,
  type Recording,
} from '../utils/api';

interface DatasetListProps {
  signType: string;
  selectedLabel: string | null;
  onToast: (msg: string, type?: 'success' | 'error') => void;
  refreshTrigger: number;
  onRefresh: () => void;
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

  const load = useCallback(async () => {
    const recs = await fetchRecordings(signType, selectedLabel || undefined);
    setRecordings(recs);

    const sibiLabels = await fetchLabels('sibi');
    const bisindoLabels = await fetchLabels('bisindo');
    setAllLabels({ sibi: sibiLabels, bisindo: bisindoLabels });
  }, [signType, selectedLabel]);

  useEffect(() => {
    load();
  }, [load, refreshTrigger]);

  const handleEdit = (rec: Recording) => {
    setEditingId(rec.id);
    setEditLabel(rec.label);
    setEditType(rec.signType);
  };

  // BUG-4 FIX: When editType changes, reset editLabel to first available label in that type
  const handleEditTypeChange = (newType: string) => {
    setEditType(newType);
    const labelsForType = allLabels[newType as 'sibi' | 'bisindo'] || [];
    // If current editLabel doesn't exist in the new type, reset to the first available
    if (!labelsForType.includes(editLabel)) {
      setEditLabel(labelsForType.length > 0 ? labelsForType[0] : '');
    }
  };

  const handleSaveEdit = async (rec: Recording) => {
    if (!editLabel) {
      onToast('Label tidak boleh kosong', 'error');
      return;
    }

    const updates: { newLabel?: string; newSignType?: string } = {};
    if (editLabel !== rec.label) updates.newLabel = editLabel;
    if (editType !== rec.signType) updates.newSignType = editType;

    if (Object.keys(updates).length === 0) {
      setEditingId(null);
      return;
    }

    const res = await updateRecording(rec.signType, rec.id, updates);
    if (res.error) {
      onToast(res.error, 'error');
    } else {
      onToast('Rekaman berhasil diperbarui', 'success');
      onRefresh();
    }
    setEditingId(null);
  };

  const handleDelete = async (rec: Recording) => {
    if (!confirm(`Hapus rekaman "${rec.label}" (${rec.id.slice(0, 8)})?`)) return;
    const res = await deleteRecording(rec.signType, rec.id);
    if (res.error) {
      onToast(res.error, 'error');
    } else {
      onToast('Rekaman dihapus', 'success');
      onRefresh();
    }
  };

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }) +
      ' ' + d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
  };

  const getVideoUrl = (rec: Recording) => {
    return `/videos/${rec.signType}/${encodeURIComponent(rec.label)}/${rec.videoFile}`;
  };

  if (recordings.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-icon" style={{ marginBottom: '16px' }}>
          <FolderOpen size={48} style={{ color: 'var(--text-muted)' }} />
        </div>
        <p>
          {selectedLabel
            ? `Belum ada rekaman untuk label "${selectedLabel}"`
            : `Belum ada rekaman di ${signType.toUpperCase()}`}
        </p>
        <p style={{ marginTop: 8, fontSize: '0.85rem' }}>
          Mulai merekam menggunakan tab Perekaman di atas.
        </p>
      </div>
    );
  }

  return (
    <div className="dataset-grid">
      {recordings.map(rec => (
        <div key={rec.id} className="recording-card">
          <video
            src={getVideoUrl(rec)}
            controls
            preload="metadata"
            style={{ transform: 'scaleX(-1)' }}
          />
          <div className="recording-card-body">
            {editingId === rec.id ? (
              <>
                <div className="form-group">
                  <label>Tipe</label>
                  {/* BUG-4 FIX: use handleEditTypeChange to sync label dropdown */}
                  <select
                    className="select"
                    value={editType}
                    onChange={e => handleEditTypeChange(e.target.value)}
                    style={{ width: '100%' }}
                  >
                    <option value="sibi">SIBI</option>
                    <option value="bisindo">BISINDO</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Label</label>
                  <select
                    className="select"
                    value={editLabel}
                    onChange={e => setEditLabel(e.target.value)}
                    style={{ width: '100%' }}
                  >
                    {(allLabels[editType as 'sibi' | 'bisindo'] || []).length === 0 ? (
                      <option value="" disabled>Tidak ada label</option>
                    ) : (
                      (allLabels[editType as 'sibi' | 'bisindo'] || []).map(l => (
                        <option key={l} value={l}>{l}</option>
                      ))
                    )}
                  </select>
                </div>
                <div className="recording-card-actions">
                  <button
                    className="btn btn-success btn-sm"
                    onClick={() => handleSaveEdit(rec)}
                    disabled={!editLabel}
                    style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                  >
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
                  <span className={`recording-card-type ${rec.signType}`}>{rec.signType}</span>
                </div>
                <div className="recording-card-info">
                  {rec.frameCount} frame · {rec.landmarkFile ? '✓ Landmark' : '✗ No landmark'} · {formatDate(rec.createdAt)}
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
  );
}
