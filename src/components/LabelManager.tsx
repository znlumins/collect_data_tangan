import { useState, useEffect, useCallback, useRef } from 'react';
import { fetchLabels, addLabel, renameLabel, deleteLabel, fetchRecordings, type Recording } from '../utils/api';
import { Edit2, Trash2, Plus, Tag } from 'lucide-react';

interface LabelManagerProps {
  signType: string;
  onSignTypeChange: (t: string) => void;
  selectedLabel: string | null;
  onSelectLabel: (label: string | null) => void;
  onToast: (msg: string, type?: 'success' | 'error') => void;
  refreshTrigger: number;
  onRefresh: () => void;
}

export default function LabelManager({
  signType,
  onSignTypeChange,
  selectedLabel,
  onSelectLabel,
  onToast,
  refreshTrigger,
  onRefresh,
}: LabelManagerProps) {
  const [labels, setLabels] = useState<string[]>([]);
  const [newLabel, setNewLabel] = useState('');
  const [editingLabel, setEditingLabel] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [counts, setCounts] = useState<Record<string, number>>({});
  const renameDoneRef = useRef(false); // BUG-10 FIX: prevent double-submit

  const loadLabels = useCallback(async () => {
    const data = await fetchLabels(signType);
    setLabels(data);
    const recs: Recording[] = await fetchRecordings(signType);
    const countMap: Record<string, number> = {};
    recs.forEach(r => {
      countMap[r.label] = (countMap[r.label] || 0) + 1;
    });
    setCounts(countMap);
  }, [signType]);

  useEffect(() => {
    loadLabels();
  }, [loadLabels, refreshTrigger]);

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

  // BUG-10 FIX: Use a ref flag to prevent double-submit from Enter + blur
  const handleRename = async (oldLabel: string) => {
    if (renameDoneRef.current) return; // Already submitted
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

  // Reset the double-submit guard when editing starts
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
    if (e.key === 'Enter') {
      e.preventDefault();
      action();
    }
    if (e.key === 'Escape') {
      renameDoneRef.current = true; // Prevent blur from triggering rename
      setEditingLabel(null);
    }
  };

  return (
    <>
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

      <div className="sidebar-section" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        <div className="sidebar-title" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Tag size={12} /> Label Kata ({labels.length})
        </div>

        <div className="add-label-row" style={{ marginBottom: '16px', marginTop: '4px' }}>
          <input
            className="input"
            placeholder="Nama label baru..."
            value={newLabel}
            onChange={e => setNewLabel(e.target.value)}
            onKeyDown={e => handleKeyDown(e, handleAdd)}
          />
          <button className="btn btn-primary btn-sm" onClick={handleAdd} disabled={!newLabel.trim()} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '10px' }}>
            <Plus size={16} />
          </button>
        </div>

        <div className="label-list">
          <div
            className={`label-item ${selectedLabel === null ? 'active' : ''}`}
            onClick={() => onSelectLabel(null)}
          >
            <span>Semua</span>
            <span className="label-count">{Object.values(counts).reduce((a, b) => a + b, 0)}</span>
          </div>

          {labels.map(label => (
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
                  <span>{label}</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span className="label-count">{counts[label] || 0}</span>
                    <div className="label-actions">
                      <button
                        className="btn-icon"
                        title="Ubah nama"
                        onClick={e => {
                          e.stopPropagation();
                          startEditing(label);
                        }}
                      >
                        <Edit2 size={13} />
                      </button>
                      <button
                        className="btn-icon danger"
                        title="Hapus"
                        onClick={e => {
                          e.stopPropagation();
                          handleDelete(label);
                        }}
                      >
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
