const BASE = '';

// --- Labels ---
export async function fetchLabels(signType: string): Promise<string[]> {
  const res = await fetch(`${BASE}/api/${signType}/labels`);
  return res.json();
}

export async function addLabel(signType: string, label: string) {
  const res = await fetch(`${BASE}/api/${signType}/labels`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ label }),
  });
  return res.json();
}

export async function renameLabel(signType: string, oldLabel: string, newLabel: string) {
  const res = await fetch(`${BASE}/api/${signType}/labels/${encodeURIComponent(oldLabel)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ newLabel }),
  });
  return res.json();
}

export async function deleteLabel(signType: string, label: string) {
  const res = await fetch(`${BASE}/api/${signType}/labels/${encodeURIComponent(label)}`, {
    method: 'DELETE',
  });
  return res.json();
}

// --- Recordings ---
export interface Recording {
  id: string;
  label: string;
  signType: string;
  videoFile: string;
  landmarkFile: string | null;
  frameCount: number;
  signerTag: string;
  handDetectionRate: number;
  quality: 'good' | 'fair' | 'poor';
  createdAt: string;
}

export async function fetchRecordings(signType: string, label?: string): Promise<Recording[]> {
  const url = label
    ? `${BASE}/api/${signType}/recordings?label=${encodeURIComponent(label)}`
    : `${BASE}/api/${signType}/recordings`;
  const res = await fetch(url);
  return res.json();
}

export async function saveRecording(
  signType: string,
  label: string,
  videoBlob: Blob,
  landmarks: object[],
  frameCount: number,
  signerTag: string = '',
  handDetectionRate: number = 0,
) {
  const formData = new FormData();
  formData.append('video', videoBlob, `recording.webm`);
  formData.append('label', label);
  formData.append('landmarks', JSON.stringify(landmarks));
  formData.append('frameCount', String(frameCount));
  formData.append('signType', signType);
  formData.append('signerTag', signerTag);
  formData.append('handDetectionRate', String(handDetectionRate));

  const res = await fetch(`${BASE}/api/${signType}/recordings`, {
    method: 'POST',
    body: formData,
  });
  return res.json();
}

export async function updateRecording(
  signType: string,
  id: string,
  updates: { newLabel?: string; newSignType?: string }
) {
  const res = await fetch(`${BASE}/api/${signType}/recordings/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  });
  return res.json();
}

export async function deleteRecording(signType: string, id: string) {
  const res = await fetch(`${BASE}/api/${signType}/recordings/${id}`, {
    method: 'DELETE',
  });
  return res.json();
}

// --- Stats ---
export async function fetchStats() {
  const res = await fetch(`${BASE}/api/stats`);
  return res.json();
}

// --- Export ---
export async function exportDataset() {
  const res = await fetch(`${BASE}/api/export`);
  return res.json();
}
