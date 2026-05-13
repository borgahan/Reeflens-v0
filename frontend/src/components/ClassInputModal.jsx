import { useState, useEffect, useRef } from 'react'

export default function ClassInputModal({ config, onSave, onClose, initialValue = '' }) {
  const [query,      setQuery]      = useState(initialValue)
  const [suggestions, setSuggestions] = useState([])
  const [activeIdx,  setActiveIdx]  = useState(0)
  const inputRef = useRef(null)
  const listRef  = useRef(null)

  const allClasses = config.classes || []

  useEffect(() => {
    const q = query.trim().toLowerCase()
    const filtered = q
      ? allClasses.filter(c => c.name.toLowerCase().includes(q))
      : allClasses
    setSuggestions(filtered)
    setActiveIdx(0)
  }, [query, allClasses])

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  useEffect(() => {
    const el = listRef.current?.children[activeIdx]
    el?.scrollIntoView({ block: 'nearest' })
  }, [activeIdx])

  const commit = (name) => {
    if (!name.trim()) return
    onSave(name.trim())
    onClose()
  }

  const handleKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIdx(i => Math.min(i + 1, suggestions.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIdx(i => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const selected = suggestions[activeIdx]
      commit(selected ? selected.name : query)
    } else if (e.key === 'Escape') {
      onClose()
    }
  }

  const activeName = suggestions[activeIdx]?.name
  const activeColor = suggestions[activeIdx]?.color || '#888'

  return (
    <div style={overlayStyle} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={modalStyle}>
        <div style={{ fontSize: 12, color: '#888', marginBottom: 8 }}>Select class (Enter to save, Esc to cancel)</div>

        <input
          ref={inputRef}
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type class name…"
          style={inputStyle}
        />

        {activeName && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, margin: '6px 0 4px', fontSize: 12, color: '#aaa' }}>
            <span style={{ width: 12, height: 12, borderRadius: 2, background: activeColor, display: 'inline-block', flexShrink: 0 }} />
            {activeName}
          </div>
        )}

        <div ref={listRef} style={listStyle}>
          {suggestions.length === 0 && query && (
            <div
              onClick={() => commit(query)}
              style={{ ...rowStyle(true), color: '#aaa', fontStyle: 'italic' }}
            >
              Save as "{query}"
            </div>
          )}
          {suggestions.map((cls, i) => (
            <div
              key={cls.name}
              onClick={() => commit(cls.name)}
              style={rowStyle(i === activeIdx)}
              onMouseEnter={() => setActiveIdx(i)}
            >
              <span style={{ width: 10, height: 10, borderRadius: 2, background: cls.color, display: 'inline-block', flexShrink: 0 }} />
              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {cls.name}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

const overlayStyle = {
  position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
  display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
}
const modalStyle = {
  background: '#16213e', borderRadius: 10, padding: 16, width: 380,
  boxShadow: '0 12px 40px rgba(0,0,0,0.6)', border: '1px solid #2a3a5a',
}
const inputStyle = {
  width: '100%', padding: '8px 10px', background: '#0a1628',
  border: '1px solid #446', borderRadius: 6, color: '#eee', fontSize: 14,
  outline: 'none', boxSizing: 'border-box',
}
const listStyle = {
  maxHeight: 240, overflowY: 'auto', marginTop: 6,
  border: '1px solid #2a3a5a', borderRadius: 6, background: '#0d1b2a',
}
const rowStyle = (active) => ({
  display: 'flex', alignItems: 'center', gap: 8,
  padding: '6px 10px', cursor: 'pointer', fontSize: 13,
  background: active ? '#1a3060' : 'transparent',
  color: active ? '#eee' : '#aaa',
})
