import { useState, useEffect } from 'react'
import { browsePath } from '../api'

export default function FileExplorer({ initialPath = '/home/work', onSelect, onClose }) {
  const [currentPath, setCurrentPath] = useState(initialPath)
  const [items,       setItems]       = useState([])
  const [parent,      setParent]      = useState(null)
  const [loading,     setLoading]     = useState(false)
  const [error,       setError]       = useState('')

  const navigate = async (path, fallback = null) => {
    setLoading(true)
    setError('')
    try {
      const data = await browsePath(path)
      setCurrentPath(data.path)
      setParent(data.parent)
      setItems(data.items)
    } catch (e) {
      if (fallback && fallback !== path) {
        await navigate(fallback)
      } else {
        setError('Failed to open folder')
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { navigate(initialPath, '/') }, [])

  const parts  = currentPath.split('/').filter(Boolean)
  const crumbs = parts.map((part, i) => ({
    label: part,
    path:  '/' + parts.slice(0, i + 1).join('/'),
  }))

  return (
    <div style={overlayStyle} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={modalStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <span style={{ fontWeight: 600, color: '#a8d8ea', fontSize: 15 }}>Select Folder</span>
          <button onClick={onClose} style={btnIcon}>✕</button>
        </div>

        {/* Breadcrumb navigation */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 2, marginBottom: 10, fontSize: 12, alignItems: 'center', background: '#0a1628', padding: '6px 10px', borderRadius: 6 }}>
          <span onClick={() => navigate('/')} style={crumbStyle}>/</span>
          {crumbs.map((c, i) => (
            <span key={c.path}>
              <span style={{ color: '#444', margin: '0 2px' }}>/</span>
              <span onClick={() => navigate(c.path)}
                style={{ ...crumbStyle, color: i === crumbs.length - 1 ? '#eee' : '#a8d8ea' }}>
                {c.label}
              </span>
            </span>
          ))}
        </div>

        <div style={{ flex: 1, overflowY: 'auto', marginBottom: 12 }}>
          {loading && <div style={{ color: '#666', padding: 8, fontSize: 13 }}>Loading…</div>}
          {error   && <div style={{ color: '#f88', padding: 8, fontSize: 13 }}>{error}</div>}

          {parent && !loading && (
            <div onClick={() => navigate(parent)} style={rowStyle(false)}>
              <span style={iconStyle}>📁</span>
              <span style={{ color: '#888', fontSize: 13 }}>..</span>
            </div>
          )}

          {!loading && items.map(item => (
            <div
              key={item.path}
              onClick={() => item.is_dir && navigate(item.path)}
              onMouseEnter={e => { if (item.is_dir) e.currentTarget.style.background = '#1a2a50' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
              style={rowStyle(item.is_dir)}
            >
              <span style={iconStyle}>{item.is_dir ? '📂' : '🖼️'}</span>
              <span style={{ flex: 1, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {item.name}
              </span>
              {item.is_dir && item.img_count > 0 && (
                <span style={{ fontSize: 11, color: '#4a9', flexShrink: 0 }}>
                  {item.img_count} image{item.img_count !== 1 ? 's' : ''}
                </span>
              )}
            </div>
          ))}

          {!loading && items.length === 0 && !error && (
            <div style={{ color: '#555', padding: 8, fontSize: 13 }}>Empty folder</div>
          )}
        </div>

        <div style={{ borderTop: '1px solid #2a3a5a', paddingTop: 10 }}>
          <div style={{ fontSize: 11, color: '#666', marginBottom: 6 }}>Selected folder:</div>
          <div style={{ fontSize: 12, color: '#a8d8ea', marginBottom: 10, wordBreak: 'break-all', background: '#0a1628', padding: '6px 10px', borderRadius: 4 }}>
            {currentPath}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={onClose} style={{ ...btnBase, flex: 1, background: '#222' }}>Cancel</button>
            <button onClick={() => { onSelect(currentPath); onClose() }}
              style={{ ...btnBase, flex: 2, background: '#0f3460' }}>
              Select this folder
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

const overlayStyle = {
  position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
  display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
}
const modalStyle = {
  background: '#16213e', borderRadius: 12, padding: 20, width: 560, maxHeight: '80vh',
  display: 'flex', flexDirection: 'column', boxShadow: '0 16px 48px rgba(0,0,0,0.6)',
  border: '1px solid #2a3a5a',
}
const rowStyle = (isDir) => ({
  display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px',
  borderRadius: 4, cursor: isDir ? 'pointer' : 'default',
  color: isDir ? '#ddd' : '#666',
  background: 'transparent',
})
const iconStyle   = { fontSize: 15, flexShrink: 0, width: 20, textAlign: 'center' }
const crumbStyle  = { cursor: 'pointer', color: '#a8d8ea', padding: '0 2px', borderRadius: 3 }
const btnIcon     = { background: 'none', border: 'none', color: '#888', cursor: 'pointer', fontSize: 16, padding: '2px 6px' }
const btnBase     = { padding: '8px', border: '1px solid #333', borderRadius: 6, color: '#eee', cursor: 'pointer', fontSize: 13 }
