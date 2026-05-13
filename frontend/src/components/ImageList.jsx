import { useState } from 'react'
import { imageUrl } from '../api'

const TABS = [
  { key: 'all',  label: 'All' },
  { key: 'todo', label: 'Remaining' },
  { key: 'done', label: 'Done' },
]

export default function ImageList({ images, selected, onSelect, annCounts = {} }) {
  const [activeTab, setActiveTab] = useState('all')

  const filtered = images.filter(img => {
    const count = annCounts[img] ?? 0
    if (activeTab === 'todo') return count === 0
    if (activeTab === 'done') return count > 0
    return true
  })

  const totalDone = images.filter(img => (annCounts[img] ?? 0) > 0).length
  const totalTodo = images.length - totalDone

  const tabCount = { all: images.length, todo: totalTodo, done: totalDone }

  return (
    <div style={{
      width: 220, flexShrink: 0, display: 'flex', flexDirection: 'column',
      background: '#0d1b2a', borderRight: '1px solid #1a1a2e',
    }}>
      {/* Header */}
      <div style={{
        padding: '10px 12px 0',
        fontSize: 11, color: '#a8d8ea', fontWeight: 700,
        letterSpacing: '0.08em', textTransform: 'uppercase',
      }}>
        Images
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', padding: '6px 8px 0', gap: 3 }}>
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            style={{
              flex: 1, padding: '4px 2px', fontSize: 10, fontWeight: 600,
              background: activeTab === t.key ? '#1a3a5c' : 'transparent',
              color: activeTab === t.key ? '#a8d8ea' : '#445',
              border: 'none',
              borderBottom: activeTab === t.key ? '2px solid #a8d8ea' : '2px solid transparent',
              borderRadius: '3px 3px 0 0',
              cursor: 'pointer',
            }}
          >
            {t.label}
            <span style={{
              marginLeft: 3,
              color: activeTab === t.key ? '#7bc' : '#334',
              fontWeight: 400,
            }}>
              {tabCount[t.key]}
            </span>
          </button>
        ))}
      </div>

      <div style={{ height: 1, background: '#1a2a3a', margin: '0 0 4px' }} />

      {/* List */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {filtered.length === 0 && (
          <div style={{ padding: 16, color: '#445', fontSize: 12, textAlign: 'center' }}>
            {activeTab === 'done' ? 'No images annotated yet' : 'No images found'}
          </div>
        )}
        {filtered.map(img => {
          const count   = annCounts[img] ?? 0
          const isSelected = selected === img
          return (
            <div
              key={img}
              onClick={() => onSelect(img)}
              style={{
                padding: '5px 6px',
                cursor: 'pointer',
                borderBottom: '1px solid #111a26',
                borderLeft: isSelected ? '3px solid #a8d8ea' : '3px solid transparent',
                background: isSelected ? '#0f2840' : 'transparent',
                transition: 'background 0.1s',
              }}
            >
              {/* Thumbnail with badge */}
              <div style={{ position: 'relative' }}>
                <img
                  src={imageUrl(img)}
                  alt={img}
                  loading="lazy"
                  crossOrigin="anonymous"
                  style={{
                    width: '100%', height: 66,
                    objectFit: 'cover', borderRadius: 4, display: 'block',
                    border: isSelected ? '1px solid #a8d8ea44' : '1px solid #1a2a3a',
                  }}
                />
                {count > 0 && (
                  <span style={{
                    position: 'absolute', bottom: 4, right: 4,
                    background: '#1a7a3a', color: '#7ef0a0',
                    fontSize: 9, fontWeight: 700,
                    padding: '1px 5px', borderRadius: 10,
                    border: '1px solid #2aaa5a',
                    lineHeight: 1.6,
                  }}>
                    {count}
                  </span>
                )}
                {count === 0 && (
                  <span style={{
                    position: 'absolute', bottom: 4, right: 4,
                    background: '#1a1a2e', color: '#445',
                    fontSize: 9, padding: '1px 5px', borderRadius: 10,
                    border: '1px solid #223',
                    lineHeight: 1.6,
                  }}>
                    —
                  </span>
                )}
              </div>

              {/* Filename */}
              <div style={{
                fontSize: 9.5, color: isSelected ? '#c8e8f8' : '#778',
                marginTop: 3,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                letterSpacing: '0.01em',
              }}>
                {img.replace(/\.[^.]+$/, '')}
              </div>
            </div>
          )
        })}
      </div>

      {/* Footer progress */}
      <div style={{ padding: '6px 10px', borderTop: '1px solid #1a1a2e', flexShrink: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
          <span style={{ fontSize: 10, color: '#446' }}>{totalDone} / {images.length}</span>
          <span style={{ fontSize: 10, color: '#446' }}>
            {images.length ? Math.round(totalDone / images.length * 100) : 0}%
          </span>
        </div>
        <div style={{ height: 3, background: '#111a26', borderRadius: 2 }}>
          <div style={{
            height: '100%', borderRadius: 2,
            background: 'linear-gradient(90deg, #1a7a3a, #2aaa5a)',
            width: images.length ? `${totalDone / images.length * 100}%` : '0%',
            transition: 'width 0.4s ease',
          }} />
        </div>
      </div>
    </div>
  )
}
