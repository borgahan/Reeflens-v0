const BASE = ''

export const getConfig  = () => fetch(`${BASE}/config`).then(r => r.json())
export const postConfig = (cfg) =>
  fetch(`${BASE}/config`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(cfg),
  }).then(r => r.json())

export const getImages  = () => fetch(`${BASE}/images`).then(r => r.json())
export const browsePath = (path) => fetch(`${BASE}/browse?path=${encodeURIComponent(path)}`).then(r => r.json())
export const getHomeDir = () => fetch(`${BASE}/home-dir`).then(r => r.json())
export const imageUrl  = (filename) => `${BASE}/image/${encodeURIComponent(filename)}`

export const predict = (image_path, points) =>
  fetch(`${BASE}/predict`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ image_path, points }),
  }).then(r => {
    if (!r.ok) return r.json().then(e => Promise.reject(e.detail))
    return r.json()
  })

export const saveAnnotation = (image_path, mask_b64, class_name) =>
  fetch(`${BASE}/save`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ image_path, mask_b64, class_name }),
  }).then(r => r.json())

export const getAnnotations  = (filename) =>
  fetch(`${BASE}/annotations/${encodeURIComponent(filename)}`).then(r => r.json())

export const deleteAnnotation = (ann_id) =>
  fetch(`${BASE}/annotation/${ann_id}`, { method: 'DELETE' }).then(r => r.json())

export const exportCoco = () => fetch(`${BASE}/export`).then(r => r.json())

export const saveCsvBatch = (image_path, class_name, items) =>
  fetch(`${BASE}/save-csv-batch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ image_path, class_name, items }),
  }).then(r => r.json())

export const getAnnotationCounts = () =>
  fetch(`${BASE}/annotation-counts`).then(r => r.json())

export const getCsvAnnotations = (filename) =>
  fetch(`${BASE}/csv-annotations/${encodeURIComponent(filename)}`).then(r => r.json())

export const autoAnnotatePoints = (image_path, class_name, points) =>
  fetch(`${BASE}/auto-annotate-points`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ image_path, class_name, points }),
  }).then(r => r.json())
