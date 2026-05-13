import { useState, useEffect, useRef } from 'react'
import { exportCoco } from '../api'

function HBar({ label, count, total, color, maxWidth }) {
  const ratio = total > 0 ? count / total : 0
  const barW  = Math.max(2, ratio * maxWidth)
  const pct   = (ratio * 100).toFixed(1)
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
      <div style={{ width: 120, textAlign: 'right', fontSize: 11, color: '#aaa',
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flexShrink: 0 }}
        title={label}>{label}</div>
      <div style={{ position: 'relative', height: 18, flex: 1 }}>
        <div style={{
          height: '100%', width: barW, maxWidth: '100%',
          background: color || '#3a6aff', borderRadius: 3,
          transition: 'width 0.3s ease',
        }} />
      </div>
      <div style={{ fontSize: 11, color: '#888', minWidth: 70, textAlign: 'right' }}>
        {count.toLocaleString()} <span style={{ color: '#445' }}>({pct}%)</span>
      </div>
    </div>
  )
}

function ClassTab({ data, config }) {
  const catMap = Object.fromEntries(data.categories.map(c => [c.id, c.name]))
  const counts = {}
  data.annotations.forEach(a => {
    const name = catMap[a.category_id] || 'unknown'
    counts[name] = (counts[name] || 0) + 1
  })
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1])
  const total  = data.annotations.length

  return (
    <div style={{ padding: '12px 0' }}>
      {sorted.map(([name, count]) => {
        const cls   = config?.classes?.find(c => c.name === name)
        const color = cls?.color || '#3a6aff'
        return <HBar key={name} label={name} count={count} total={total} color={color} />
      })}
    </div>
  )
}

function ImagesTab({ data }) {
  const imgMap = Object.fromEntries(data.images.map(i => [i.id, i.file_name]))
  const counts = {}
  data.annotations.forEach(a => {
    const name = imgMap[a.image_id] || `#${a.image_id}`
    counts[name] = (counts[name] || 0) + 1
  })
  const sorted  = Object.entries(counts).sort((a, b) => b[1] - a[1])
  const top     = sorted.slice(0, 40)
  const maxVal  = top[0]?.[1] || 1

  return (
    <div style={{ padding: '12px 0' }}>
      {top.map(([name, count]) => (
        <HBar key={name} label={name} count={count} total={maxVal} color="#3a8aaa" />
      ))}
      {sorted.length > 40 && (
        <div style={{ fontSize: 11, color: '#556', padding: '4px 0' }}>
          … and {sorted.length - 40} more images
        </div>
      )}
    </div>
  )
}

function AreaTab({ data }) {
  const areas = data.annotations.map(a => a.area).filter(a => a > 0)
  if (areas.length === 0) return <div style={{ color: '#555', padding: 16 }}>No data</div>

  const sqrtAreas = areas.map(a => Math.sqrt(a))
  const minV = Math.min(...sqrtAreas)
  const maxV = Math.max(...sqrtAreas)
  const BUCKETS = 16
  const step = (maxV - minV) / BUCKETS || 1
  const buckets = Array(BUCKETS).fill(0)
  sqrtAreas.forEach(v => {
    const idx = Math.min(BUCKETS - 1, Math.floor((v - minV) / step))
    buckets[idx]++
  })
  const maxB = Math.max(...buckets, 1)
  const H = 140, barW = Math.max(8, Math.floor(340 / BUCKETS) - 2)
  const totalW = (barW + 2) * BUCKETS

  const median = [...areas].sort((a,b)=>a-b)[Math.floor(areas.length/2)]
  const mean   = areas.reduce((s,a)=>s+a,0) / areas.length

  return (
    <div style={{ padding: '12px 0' }}>
      <div style={{ display: 'flex', gap: 20, marginBottom: 14, flexWrap: 'wrap' }}>
        {[
          ['Min', Math.min(...areas).toLocaleString()],
          ['Max', Math.max(...areas).toLocaleString()],
          ['Median', Math.round(median).toLocaleString()],
          ['Mean', Math.round(mean).toLocaleString()],
        ].map(([label, val]) => (
          <div key={label} style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 10, color: '#556' }}>{label}</div>
            <div style={{ fontSize: 13, color: '#c8e8f8', fontWeight: 600 }}>{val}</div>
          </div>
        ))}
      </div>

      <div style={{ overflowX: 'auto' }}>
        <svg width={totalW + 40} height={H + 30}>
          {buckets.map((b, i) => {
            const barH = Math.max(1, (b / maxB) * H)
            const x    = 20 + i * (barW + 2)
            return (
              <g key={i}>
                <rect x={x} y={H - barH} width={barW} height={barH}
                  fill="#3a6aff" rx={2} opacity={0.85} />
                {b > 0 && barH > 14 && (
                  <text x={x + barW / 2} y={H - barH + 12}
                    textAnchor="middle" fill="#ccc" fontSize={9}>{b}</text>
                )}
              </g>
            )
          })}
          <line x1={20} y1={H} x2={totalW + 20} y2={H} stroke="#333" strokeWidth={1} />
          {[0, Math.floor(BUCKETS/4), Math.floor(BUCKETS/2), Math.floor(BUCKETS*3/4), BUCKETS-1].map(i => {
            const label = Math.round((minV + i * step) ** 2).toLocaleString()
            return (
              <text key={i} x={20 + i * (barW + 2) + barW/2} y={H + 14}
                textAnchor="middle" fill="#556" fontSize={9}>{label}</text>
            )
          })}
        </svg>
      </div>
      <div style={{ fontSize: 10, color: '#445', marginTop: 4 }}>Area (px²)</div>
    </div>
  )
}

export default function StatsModal({ config, onClose }) {
  const [data,    setData]    = useState(null)
  const [loading, setLoading] = useState(true)
  const [tab,     setTab]     = useState('classes')
  const overlayRef = useRef()

  useEffect(() => {
    exportCoco().then(d => { setData(d); setLoading(false) }).catch(() => setLoading(false))
  }, [])

  const totalAnns  = data?.annotations?.length || 0
  const totalCats  = data?.categories?.length  || 0
  const totalImgs  = data?.images?.filter(img =>
    data.annotations.some(a => a.image_id === img.id)
  ).length || 0
  const avgPerImg  = totalImgs > 0 ? (totalAnns / totalImgs).toFixed(1) : '—'

  return (
    <div
      ref={overlayRef}
      onClick={e => { if (e.target === overlayRef.current) onClose() }}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 1000,
      }}
    >
      <div style={{
        background: '#16213e', border: '1px solid #2a3a5e',
        borderRadius: 10, width: 560, maxHeight: '80vh',
        display: 'flex', flexDirection: 'column',
        boxShadow: '0 8px 40px rgba(0,0,0,0.6)',
      }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', padding: '14px 18px',
          borderBottom: '1px solid #1a2a3a', flexShrink: 0 }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: '#c8e8f8', flex: 1 }}>
            Annotation Statistics
          </span>
          <button onClick={onClose}
            style={{ background: 'none', border: 'none', color: '#778', cursor: 'pointer', fontSize: 18, lineHeight: 1 }}>
            ✕
          </button>
        </div>

        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#556' }}>Loading…</div>
        ) : !data ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#f88' }}>Failed to load data</div>
        ) : (
          <>
            {/* Summary cards */}
            <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid #1a2a3a', flexShrink: 0 }}>
              {[
                ['Total', totalAnns.toLocaleString()],
                ['Classes', totalCats],
                ['Images', totalImgs],
                ['Avg/image', avgPerImg],
              ].map(([label, val]) => (
                <div key={label} style={{ flex: 1, padding: '10px 0', textAlign: 'center',
                  borderRight: '1px solid #1a2a3a' }}>
                  <div style={{ fontSize: 10, color: '#556', marginBottom: 2 }}>{label}</div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: '#a8d8ea' }}>{val}</div>
                </div>
              ))}
            </div>

            {/* Tabs */}
            <div style={{ display: 'flex', borderBottom: '1px solid #1a2a3a', flexShrink: 0 }}>
              {[['classes','Classes'],['images','Images'],['area','Area']].map(([key, label]) => (
                <button key={key} onClick={() => setTab(key)} style={{
                  padding: '8px 18px', background: 'transparent', border: 'none',
                  borderBottom: tab === key ? '2px solid #a8d8ea' : '2px solid transparent',
                  color: tab === key ? '#a8d8ea' : '#556',
                  cursor: 'pointer', fontSize: 12, fontWeight: tab === key ? 600 : 400,
                }}>
                  {label}
                </button>
              ))}
            </div>

            {/* Tab content */}
            <div style={{ overflowY: 'auto', padding: '0 18px', flex: 1 }}>
              {tab === 'classes' && <ClassTab data={data} config={config} />}
              {tab === 'images'  && <ImagesTab data={data} />}
              {tab === 'area'    && <AreaTab data={data} />}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
