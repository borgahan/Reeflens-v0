import { useState, useEffect } from 'react'
import { postConfig, getHomeDir } from '../api'
import FileExplorer from './FileExplorer'

export default function ConfigScreen({ onStart, initialConfig }) {
  const [datasetDir,   setDatasetDir]   = useState(initialConfig?.dataset_dir     || '')
  const [checkpoint,   setCheckpoint]   = useState(initialConfig?.sam3_checkpoint || 'facebook/sam3')
  const [loading,      setLoading]      = useState(false)
  const [error,        setError]        = useState('')
  const [showExplorer, setShowExplorer] = useState(false)
  const [homeDir,      setHomeDir]      = useState('/')

  useEffect(() => {
    getHomeDir().then(d => setHomeDir(d.path)).catch(() => setHomeDir('/'))
  }, [])

  const handleStart = async () => {
    if (!datasetDir.trim()) { setError('Dataset directory is required'); return }
    setError('')
    setLoading(true)
    try {
      const res = await postConfig({
        dataset_dir:     datasetDir.trim(),
        sam3_checkpoint: checkpoint.trim(),
        classes:         [],   // classes are populated from the backend config
      })
      const cfg = await fetch('/config').then(r => r.json())
      onStart(cfg)
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', background: '#1a1a2e' }}>
      <div style={{ background: '#16213e', padding: 32, borderRadius: 12, width: 480, boxShadow: '0 8px 32px rgba(0,0,0,0.5)' }}>
        <h2 style={{ margin: '0 0 24px', color: '#a8d8ea', fontSize: 22 }}>SAM3 Annotator</h2>

        <label style={labelStyle}>Dataset Directory</label>
        <div style={{ display: 'flex', gap: 6, marginBottom: 4 }}>
          <input
            value={datasetDir}
            onChange={e => setDatasetDir(e.target.value)}
            placeholder="/home/work/images"
            style={{ ...inputStyle, flex: 1, marginBottom: 0 }}
          />
          <button onClick={() => setShowExplorer(true)} style={btnBrowse} title="Browse folder" disabled={loading}>📂</button>
        </div>

        <label style={{ ...labelStyle, marginTop: 14 }}>SAM3 Checkpoint</label>
        <input value={checkpoint} onChange={e => setCheckpoint(e.target.value)}
          placeholder="facebook/sam3" style={inputStyle} />

        {error && <div style={{ marginTop: 10, color: '#f88', fontSize: 13 }}>{error}</div>}

        <button
          onClick={handleStart}
          disabled={loading || !datasetDir.trim()}
          style={{
            marginTop: 24, width: '100%', padding: 12,
            background: loading || !datasetDir.trim() ? '#333' : '#0f3460',
            color:  loading || !datasetDir.trim() ? '#666' : '#eee',
            border: 'none', borderRadius: 8,
            cursor: loading || !datasetDir.trim() ? 'not-allowed' : 'pointer', fontSize: 15,
          }}
        >
          {loading ? 'Loading… (model + classes)' : 'Start'}
        </button>
      </div>

      {showExplorer && (
        <FileExplorer
          initialPath={datasetDir || homeDir}
          onSelect={path => setDatasetDir(path)}
          onClose={() => setShowExplorer(false)}
        />
      )}
    </div>
  )
}

const labelStyle = { display: 'block', marginBottom: 6, fontSize: 12, color: '#888' }
const inputStyle = {
  width: '100%', padding: '8px 10px', background: '#0f3460',
  border: '1px solid #444', borderRadius: 6, color: '#eee', fontSize: 13,
  marginBottom: 4, outline: 'none',
}
const btnBrowse = {
  padding: '0 12px', height: 36, background: '#1a3060',
  border: '1px solid #446', borderRadius: 6, cursor: 'pointer', fontSize: 17, flexShrink: 0,
}
