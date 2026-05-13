import { useState, useRef } from 'react'
import { deleteAnnotation, exportCoco } from '../api'
import StatsModal from './StatsModal'

function ActionsMenu({ highlightStyle, setHighlightStyle, config }) {
  const [open,      setOpen]      = useState(false)
  const [showStats, setShowStats] = useState(false)

  const handleExport = async () => {
    const data = await exportCoco()
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href = url; a.download = 'annotations.json'; a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div style={{ borderTop: '1px solid #1a1a2e', flexShrink: 0 }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%', padding: '9px 12px', background: 'transparent',
          color: '#778', border: 'none', cursor: 'pointer', fontSize: 12,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          fontWeight: 600,
        }}
      >
        <span>Actions</span>
        <span style={{ fontSize: 10 }}>{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div style={{ padding: '0 12px 10px', display: 'flex', flexDirection: 'column', gap: 6 }}>
          <button onClick={handleExport} style={btn(false, '#0a3520')}>
            Export COCO JSON
          </button>
          <button onClick={() => setShowStats(true)} style={btn(false, '#1a0a40')}>
            📊 Statistics
          </button>
          {setHighlightStyle && (
            <>
              <div style={{ fontSize: 10, color: '#556', marginTop: 4 }}>Highlight Style</div>
              {[['border', '◻ White border'], ['bbox', '⬜ Yellow bbox'], ['both', '◻⬜ Both']].map(([val, label]) => (
                <button key={val} onClick={() => setHighlightStyle(val)}
                  style={{ ...btn(false, highlightStyle === val ? '#1a2a4a' : '#111'), fontSize: 11,
                    border: highlightStyle === val ? '1px solid #a8d8ea' : '1px solid #333', color: highlightStyle === val ? '#a8d8ea' : '#888' }}>
                  {label}
                </button>
              ))}
            </>
          )}
        </div>
      )}
      {showStats && <StatsModal config={config} onClose={() => setShowStats(false)} />}
    </div>
  )
}

// ── CSV modu ──────────────────────────────────────────────────────────────────

function CsvPanel({
  config, csvAnnotations, filterCsvClass, setFilterCsvClass,
  pendingCsvAnns, setPendingCsvAnns, onRequestCsvSave,
  onRequestAutoAnnotate, autoAnnotating, autoResult, autoProgress,
  highlightStyle, setHighlightStyle,
}) {
  const classCounts = (csvAnnotations || []).reduce((acc, ann) => {
    acc[ann.label_name] = (acc[ann.label_name] || 0) + 1
    return acc
  }, {})
  const sortedClasses = Object.entries(classCounts).sort((a, b) => b[1] - a[1])

  const annKey = a => a.label_name + '|' + a.points[0] + ',' + a.points[1]

  const filtered  = filterCsvClass ? (csvAnnotations || []).filter(a => a.label_name === filterCsvClass) : []
  const pendingKeys = new Set((pendingCsvAnns || []).map(annKey))
  const unselected  = filtered.filter(a => !pendingKeys.has(annKey(a)))

  const filteredPoints = filterCsvClass
    ? (csvAnnotations || []).filter(a => a.label_name === filterCsvClass && a.shape_name === 'Point')
    : []

  return (
    <div style={panelStyle}>
      <section style={sectionStyle}>
        <div style={sectionTitle}>
          Biigle Classes
          {filterCsvClass && (
            <button onClick={() => setFilterCsvClass(null)}
              style={{ marginLeft: 6, fontSize: 10, padding: '1px 6px', background: '#2a1a1a', color: '#f88', border: '1px solid #6a2a2a', borderRadius: 3, cursor: 'pointer' }}>
              ✕ clear filter
            </button>
          )}
        </div>
      </section>

      {filterCsvClass && (
        <section style={{ ...sectionStyle, padding: '6px 12px' }}>
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              onClick={() => setPendingCsvAnns(prev => {
                const ex = new Set(prev.map(annKey))
                return [...prev, ...filtered.filter(a => !ex.has(annKey(a)))]
              })}
              disabled={unselected.length === 0}
              style={{ ...btn(unselected.length === 0, '#0a3a28'), flex: 1, fontSize: 11 }}>
              Select All ({unselected.length})
            </button>
            <button
              onClick={() => {
                const fk = new Set(filtered.map(annKey))
                setPendingCsvAnns(prev => prev.filter(a => !fk.has(annKey(a))))
              }}
              style={{ ...btn(false, '#2a1a1a'), flex: 1, fontSize: 11, color: '#f88' }}>
              Deselect
            </button>
          </div>
        </section>
      )}

      <section style={{ ...sectionStyle, flex: 1, overflowY: 'auto', padding: '6px 0' }}>
        {sortedClasses.length === 0 && (
          <div style={{ padding: '12px', color: '#555', fontSize: 12 }}>No CSV annotations for this image</div>
        )}
        {sortedClasses.map(([name, count]) => {
          const cls = config.classes?.find(c => c.name === name)
          const color = cls?.color || '#ffdd00'
          const isActive = filterCsvClass === name
          return (
            <div key={name} onClick={() => setFilterCsvClass(isActive ? null : name)}
              style={{
                display: 'flex', alignItems: 'center', gap: 7,
                padding: '5px 12px', cursor: 'pointer',
                background: isActive ? '#0f2840' : 'transparent',
                borderLeft: isActive ? '3px solid #a8d8ea' : '3px solid transparent',
              }}>
              <span style={{ width: 10, height: 10, borderRadius: 2, background: color, flexShrink: 0 }} />
              <span style={{ flex: 1, fontSize: 11.5, color: isActive ? '#c8e8f8' : '#aaa',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
              <span style={{ fontSize: 11, color: '#666' }}>{count}</span>
            </div>
          )
        })}
      </section>

      {filteredPoints.length > 0 && (
        <section style={{ ...sectionStyle, borderTop: '1px solid #1a2a3a' }}>
          <button
            onClick={() => onRequestAutoAnnotate(filterCsvClass, filteredPoints)}
            disabled={autoAnnotating}
            style={{ ...btn(autoAnnotating, '#1a0a40'), width: '100%', fontSize: 12 }}
          >
            {autoAnnotating ? '⏳ SAM3 running…' : `⚡ Auto-annotate with SAM3 (${filteredPoints.length} points)`}
          </button>
          {autoAnnotating && autoProgress.total > 0 && (
            <div style={{ marginTop: 6 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#888', marginBottom: 3 }}>
                <span>{autoProgress.current} / {autoProgress.total}</span>
                <span>{Math.round(autoProgress.current / autoProgress.total * 100)}%</span>
              </div>
              <div style={{ height: 5, background: '#1a1a3a', borderRadius: 3, overflow: 'hidden' }}>
                <div style={{
                  height: '100%', borderRadius: 3,
                  background: 'linear-gradient(90deg, #3a6aff, #a8d8ea)',
                  width: `${autoProgress.current / autoProgress.total * 100}%`,
                  transition: 'width 0.2s ease',
                }} />
              </div>
            </div>
          )}
          {autoResult && !autoAnnotating && (
            <div style={{ marginTop: 5, fontSize: 11, color: '#7ef0a0' }}>
              ✓ {autoResult.saved} saved
              {autoResult.failed > 0 && <span style={{ color: '#f88' }}> · {autoResult.failed} failed</span>}
            </div>
          )}
        </section>
      )}

      <section style={sectionStyle}>
        <div style={{ fontSize: 12, color: '#888', marginBottom: 6 }}>
          Selected: <span style={{ color: pendingCsvAnns.length > 0 ? '#7ef0a0' : '#555', fontWeight: 600 }}>{pendingCsvAnns.length}</span>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button onClick={() => setPendingCsvAnns([])} disabled={pendingCsvAnns.length === 0}
            style={{ ...btn(pendingCsvAnns.length === 0, '#2a1a1a'), flex: 1, color: '#f88' }}>✕ Clear</button>
          <button onClick={onRequestCsvSave} disabled={pendingCsvAnns.length === 0}
            style={{ ...btn(pendingCsvAnns.length === 0, '#0a3520'), flex: 2 }}>Assign Class →</button>
        </div>
        <div style={{ marginTop: 6, fontSize: 10, color: '#445', fontStyle: 'italic' }}>
          Click to select · Alt+click to add · Ctrl+click to remove · Enter to confirm
        </div>
      </section>

      <ActionsMenu highlightStyle={highlightStyle} setHighlightStyle={setHighlightStyle} config={config} />
    </div>
  )
}

// ── SAM3 modu ─────────────────────────────────────────────────────────────────

export default function AnnotationPanel({
  config, selectedImage, annotations,
  activeMask, iouScore, points,
  onRequestSave, onDelete, onClear, predicting,
  activeTab,
  csvAnnotations,
  filterCsvClass, setFilterCsvClass,
  pendingCsvAnns, setPendingCsvAnns,
  onRequestCsvSave,
  onRequestAutoAnnotate, autoAnnotating, autoResult, autoProgress,
  selectedAnnIds = new Set(), setSelectedAnnIds,
  highlightStyle, setHighlightStyle,
}) {
  const [collapsed,    setCollapsed]    = useState(new Set())
  const lastIdx = useRef(null)

  const canSave = !!activeMask && !predicting

  if (activeTab === 'csv') {
    return (
      <CsvPanel
        config={config}
        csvAnnotations={csvAnnotations}
        filterCsvClass={filterCsvClass}
        setFilterCsvClass={setFilterCsvClass}
        pendingCsvAnns={pendingCsvAnns}
        setPendingCsvAnns={setPendingCsvAnns}
        onRequestCsvSave={onRequestCsvSave}
        onRequestAutoAnnotate={onRequestAutoAnnotate}
        autoAnnotating={autoAnnotating}
        autoResult={autoResult}
        autoProgress={autoProgress}
        highlightStyle={highlightStyle}
        setHighlightStyle={setHighlightStyle}
      />
    )
  }

  // Grupla
  const groups = annotations.reduce((acc, ann) => {
    const k = ann.class_name
    if (!acc[k]) acc[k] = []
    acc[k].push(ann)
    return acc
  }, {})
  const sortedGroups = Object.entries(groups).sort((a, b) => b[1].length - a[1].length)
  // Flat list for shift-range selection
  const flatList = sortedGroups.flatMap(([, anns]) => anns)

  const toggleCollapse = (cls) => {
    setCollapsed(prev => {
      const next = new Set(prev)
      next.has(cls) ? next.delete(cls) : next.add(cls)
      return next
    })
  }

  const handleItemClick = (ann, idx, e) => {
    if (e.shiftKey && lastIdx.current !== null) {
      const from = Math.min(lastIdx.current, idx)
      const to   = Math.max(lastIdx.current, idx)
      const range = new Set(flatList.slice(from, to + 1).map(a => a.id))
      setSelectedAnnIds(prev => new Set([...prev, ...range]))
    } else {
      setSelectedAnnIds(prev => {
        const next = new Set(prev)
        next.has(ann.id) ? next.delete(ann.id) : next.add(ann.id)
        return next
      })
      lastIdx.current = idx
    }
  }

  const handleDeleteSelected = async () => {
    for (const id of selectedAnnIds) await deleteAnnotation(id)
    setSelectedAnnIds(new Set())
    onDelete()
  }

  const handleDeleteClass = async (anns) => {
    for (const ann of anns) await deleteAnnotation(ann.id)
    setSelectedAnnIds(prev => {
      const next = new Set(prev)
      anns.forEach(a => next.delete(a.id))
      return next
    })
    onDelete()
  }

  const handleDeleteSingle = async (annId) => {
    await deleteAnnotation(annId)
    setSelectedAnnIds(prev => { const n = new Set(prev); n.delete(annId); return n })
    onDelete()
  }

  return (
    <div style={panelStyle}>
      {/* Aktif mask */}
      <section style={sectionStyle}>
        <div style={sectionTitle}>Active Mask</div>
        {activeMask ? (
          <>
            {iouScore != null && (
              <div style={{ fontSize: 12, color: '#888', marginBottom: 2 }}>
                IoU: <span style={{ color: '#eee' }}>{iouScore.toFixed(3)}</span>
              </div>
            )}
            <div style={{ fontSize: 12, color: '#888' }}>
              Points: {points.filter(p => p.label === 1).length}✚&nbsp;
              {points.filter(p => p.label === 0).length}✖
            </div>
            <div style={{ marginTop: 4, fontSize: 11, color: '#556', fontStyle: 'italic' }}>
              Enter → pick class & save
            </div>
          </>
        ) : (
          <div style={{ fontSize: 12, color: '#444' }}>—</div>
        )}
      </section>

      {/* Kaydet / Temizle */}
      <section style={sectionStyle}>
        <button onClick={onRequestSave} disabled={!canSave} style={btn(!canSave, '#0f3460')}>
          Save (Enter)
        </button>
        <button onClick={onClear} style={{ ...btn(false, '#2a2a4a'), marginTop: 6 }}>
          Clear
        </button>
      </section>

      {/* Annotation listesi — gruplu */}
      <section style={{ ...sectionStyle, flex: 1, overflowY: 'auto', padding: 0 }}>
        <div style={{ padding: '8px 12px 4px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ ...sectionTitle, margin: 0 }}>Annotations ({annotations.length})</span>
          {selectedAnnIds.size > 0 && (
            <button onClick={handleDeleteSelected}
              style={{ fontSize: 10, padding: '2px 8px', background: '#3a0a0a', color: '#f88', border: '1px solid #6a1a1a', borderRadius: 3, cursor: 'pointer' }}>
              Delete ({selectedAnnIds.size})
            </button>
          )}
        </div>

        {annotations.length === 0 && (
          <div style={{ padding: '8px 12px', color: '#555', fontSize: 12 }}>No annotations yet</div>
        )}

        {sortedGroups.map(([cls, anns]) => {
          const clsObj  = config.classes?.find(c => c.name === cls)
          const color   = clsObj?.color || '#888'
          const isOpen  = !collapsed.has(cls)
          const selCount = anns.filter(a => selectedAnnIds.has(a.id)).length

          return (
            <div key={cls}>
              {/* Group header */}
              <div style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '5px 10px 5px 8px',
                background: '#0d1b2e', borderBottom: '1px solid #1a2a3a',
                cursor: 'pointer', userSelect: 'none',
              }}>
                <span onClick={() => toggleCollapse(cls)} style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 10, color: '#556', width: 10 }}>{isOpen ? '▼' : '▶'}</span>
                  <span style={{ width: 9, height: 9, borderRadius: 2, background: color, flexShrink: 0 }} />
                  <span style={{ fontSize: 12, color: '#c8e8f8', fontWeight: 600, flex: 1,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {cls}
                  </span>
                  <span style={{ fontSize: 10, color: '#556' }}>
                    {selCount > 0 ? `${selCount}/` : ''}{anns.length}
                  </span>
                </span>
                {/* Select / delete entire class */}
                <button
                  onClick={(e) => { e.stopPropagation(); setSelectedAnnIds(prev => { const n = new Set(prev); anns.forEach(a => n.add(a.id)); return n }) }}
                  title="Select all"
                  style={iconBtn}>☑</button>
                <button
                  onClick={(e) => { e.stopPropagation(); handleDeleteClass(anns) }}
                  title="Delete class"
                  style={{ ...iconBtn, color: '#f88' }}>🗑</button>
              </div>

              {/* Annotation rows */}
              {isOpen && anns.map((ann) => {
                const idx = flatList.indexOf(ann)
                const sel = selectedAnnIds.has(ann.id)
                return (
                  <div
                    key={ann.id}
                    onClick={(e) => handleItemClick(ann, idx, e)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 6,
                      padding: '3px 10px 3px 26px',
                      background: sel ? '#0f2840' : 'transparent',
                      borderLeft: sel ? '2px solid #a8d8ea' : '2px solid transparent',
                      cursor: 'pointer', borderBottom: '1px solid #111a26',
                    }}
                  >
                    <span style={{ fontSize: 10, color: sel ? '#a8d8ea' : '#445', width: 10 }}>
                      {sel ? '■' : '□'}
                    </span>
                    <span style={{ flex: 1, fontSize: 11, color: sel ? '#ddd' : '#667' }}>
                      #{ann.id}
                    </span>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDeleteSingle(ann.id) }}
                      style={btnDelete}>✕</button>
                  </div>
                )
              })}
            </div>
          )
        })}
      </section>

      {/* Selection hint */}
      {annotations.length > 0 && (
        <div style={{ padding: '4px 12px', fontSize: 10, color: '#334', fontStyle: 'italic', flexShrink: 0 }}>
          Click to select · Shift+click for range · ☑ in header selects all
        </div>
      )}

      <ActionsMenu config={config} />
    </div>
  )
}

const panelStyle = {
  width: 250, flexShrink: 0, display: 'flex', flexDirection: 'column',
  background: '#16213e', borderLeft: '1px solid #1a1a2e',
}
const sectionStyle  = { padding: '10px 12px', borderBottom: '1px solid #1a1a2e' }
const sectionTitle  = { fontSize: 12, color: '#a8d8ea', fontWeight: 600, marginBottom: 6, display: 'flex', alignItems: 'center' }
const btn = (disabled, bg) => ({
  width: '100%', padding: '8px', background: disabled ? '#222' : bg,
  color: disabled ? '#555' : '#eee', border: '1px solid #333',
  borderRadius: 4, cursor: disabled ? 'not-allowed' : 'pointer', fontSize: 13,
})
const iconBtn = {
  padding: '1px 5px', background: 'transparent', color: '#778',
  border: 'none', cursor: 'pointer', fontSize: 12, borderRadius: 3,
}
const btnDelete = {
  padding: '1px 5px', background: '#3a0a0a', color: '#f88',
  border: '1px solid #6a1a1a', borderRadius: 3, cursor: 'pointer', fontSize: 10,
}
