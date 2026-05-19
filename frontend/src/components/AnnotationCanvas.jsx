import { useState, useEffect, useRef, useCallback } from 'react'
import { Stage, Layer, Image as KonvaImage, Line, Circle, Rect } from 'react-konva'
import useImage from 'use-image'
import { imageUrl, predict } from '../api'
import CsvAnnotationLayer from './CsvAnnotationLayer'
import { colorToRgba } from '../colorUtils'

function colorizeBase64Mask(base64, hexColor) {
  return new Promise(resolve => {
    const img = new Image()
    img.onload = () => {
      const cv  = document.createElement('canvas')
      cv.width  = img.width
      cv.height = img.height
      const ctx = cv.getContext('2d')
      ctx.drawImage(img, 0, 0)
      const d    = ctx.getImageData(0, 0, cv.width, cv.height)
      const data = d.data
      const r    = parseInt(hexColor.slice(1, 3), 16)
      const g    = parseInt(hexColor.slice(3, 5), 16)
      const b    = parseInt(hexColor.slice(5, 7), 16)
      for (let i = 0; i < data.length; i += 4) {
        if (data[i] > 128) {
          data[i] = r; data[i + 1] = g; data[i + 2] = b; data[i + 3] = 140
        } else {
          data[i + 3] = 0
        }
      }
      ctx.putImageData(d, 0, 0)
      resolve(cv.toDataURL())
    }
    img.src = `data:image/png;base64,${base64}`
  })
}

function polygonToBase64Mask(points, width, height) {
  const cv = document.createElement('canvas')
  cv.width = width
  cv.height = height
  const ctx = cv.getContext('2d')
  ctx.fillStyle = 'black'
  ctx.fillRect(0, 0, width, height)
  
  ctx.beginPath()
  ctx.moveTo(points[0].x, points[0].y)
  for (let i = 1; i < points.length; i++) {
    ctx.lineTo(points[i].x, points[i].y)
  }
  ctx.closePath()
  ctx.fillStyle = 'white'
  ctx.fill()
  
  return cv.toDataURL('image/png').split(',')[1]
}

function MaskOverlay({ dataUrl, scaleX, scaleY, opacity }) {
  const [img] = useImage(dataUrl)
  if (!img) return null
  return <KonvaImage image={img} scaleX={scaleX} scaleY={scaleY} opacity={opacity / 100} />
}

function AnnotationOverlay({ annotations, scaleX, scaleY, config, opacity, zoom,
                              selectedAnnIds, highlightStyle, selectMode, onAnnClick }) {
  return annotations.flatMap(ann => {
    const cls        = config.classes?.find(c => c.name === ann.class_name)
    const color      = cls?.color || '#ffffff'
    const isSel      = selectedAnnIds?.has(ann.id)
    const showBorder = isSel && (highlightStyle === 'border' || highlightStyle === 'both')
    const showBbox   = isSel && (highlightStyle === 'bbox'   || highlightStyle === 'both')
    const result     = []

    ann.segmentation.forEach((poly, pi) => {
      result.push(
        <Line
          key={`${ann.id}-${pi}`}
          points={poly.map((v, i) => v * (i % 2 === 0 ? scaleX : scaleY))}
          closed
          fill={colorToRgba(color, opacity / 100 * 0.75)}
          stroke={showBorder ? '#ffffff' : color}
          strokeWidth={showBorder ? 4 / zoom : 1.5 / zoom}
          listening={!!selectMode}
          onClick={selectMode ? (e) => { e.cancelBubble = true; onAnnClick?.(ann.id, e.evt.shiftKey) } : undefined}
        />
      )
    })

    if (showBbox && ann.bbox?.length >= 4) {
      const [bx, by, bw, bh] = ann.bbox
      result.push(
        <Rect
          key={`bbox-${ann.id}`}
          x={bx * scaleX} y={by * scaleY}
          width={bw * scaleX} height={bh * scaleY}
          stroke='#ffdd00' strokeWidth={2 / zoom}
          fill='rgba(255,221,0,0.06)'
          dash={[8 / zoom, 4 / zoom]}
          listening={false}
        />
      )
    }

    return result
  })
}

export default function AnnotationCanvas({
  config, selectedImage,
  points, setPoints,
  activeMask, setActiveMask, setIouScore,
  annotations,
  predicting, setPredicting,
  onRequestSave,
  csvAnnotations = [],
  activeTab, setActiveTab,
  shiftHeld,
  filterCsvClass,
  activeCsvAnn, setActiveCsvAnn,
  pendingCsvAnns, setPendingCsvAnns,
  onRequestCsvSave,
  selectedAnnIds, highlightStyle, onAnnClick, onClearSelection,
}) {
  const containerRef = useRef(null)
  const stageRef     = useRef(null)
  const dragging     = useRef(false)
  const freehandDrawing = useRef(false)

  const [containerSize, setContainerSize] = useState({ width: 800, height: 600 })
  const [scale,         setScale]         = useState(1)
  const [imgDims,       setImgDims]       = useState({ w: 1, h: 1 })
  const [colorizedMask, setColorizedMask] = useState(null)
  const [error,         setError]         = useState('')
  const [tooltip,       setTooltip]       = useState(null)
  const [mousePos,      setMousePos]      = useState({ x: 0, y: 0 })
  const [zoom,           setZoom]           = useState(1)
  const [stagePos,       setStagePos]       = useState({ x: 0, y: 0 })
  const [annOpacity,     setAnnOpacity]     = useState(30)
  const [showAnns,       setShowAnns]       = useState(true)
  const [selectMode,     setSelectMode]     = useState(false)
  const [drawMode,       setDrawMode]       = useState(false)
  const [manualPoints,   setManualPoints]   = useState([])
  const [draftBox,       setDraftBox]       = useState(null)

  const imgSrc            = selectedImage ? imageUrl(selectedImage) : null
  const [bgImage, status] = useImage(imgSrc, 'anonymous')

  useEffect(() => {
    if (!containerRef.current) return
    const ro = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect
      setContainerSize({ width, height })
    })
    ro.observe(containerRef.current)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    if (!bgImage) return
    setImgDims({ w: bgImage.naturalWidth, h: bgImage.naturalHeight })
    setScale(Math.min(containerSize.width / bgImage.naturalWidth, containerSize.height / bgImage.naturalHeight))
  }, [bgImage, containerSize])

  useEffect(() => {
    setZoom(1)
    setStagePos({ x: 0, y: 0 })
  }, [selectedImage])

  useEffect(() => {
    if (!activeMask) { setColorizedMask(null); return }
    colorizeBase64Mask(activeMask, '#00ccff').then(setColorizedMask)
  }, [activeMask])

  useEffect(() => {
    const handler = async (e) => {
      if ((e.key === 'Delete' || e.key === 'Backspace') && !predicting) {
        if (drawMode && manualPoints.length > 0) {
          setManualPoints([])
          e.preventDefault()
          return
        }
        if (activeMask || points.length > 0 || draftBox) {
          setActiveMask(null)
          setPoints([])
          setIouScore(null)
          setDraftBox(null)
          e.preventDefault()
          return
        }
      }

      if (e.key === 'Enter' && drawMode && manualPoints.length >= 3 && !predicting) {
        const b64 = polygonToBase64Mask(manualPoints, imgDims.w, imgDims.h)
        setActiveMask(b64)
        setIouScore(null)
        setManualPoints([])
        return
      }
      if (e.key === 'Escape' && drawMode) {
        setManualPoints([])
        return
      }
      if (e.key.toLowerCase() === 'm' && !e.ctrlKey && !e.metaKey && !predicting && activeTab !== 'csv') {
        setDrawMode(v => !v)
        setSelectMode(false)
        return
      }
      if (e.key.toLowerCase() === 's' && !e.ctrlKey && !e.metaKey && !predicting && activeTab !== 'csv') {
        setSelectMode(v => !v)
        setDrawMode(false)
        return
      }
      if (e.key === 'Enter' && activeCsvAnn && !activeMask && !predicting) {
        // Enter with active CSV annotation → add to pending
        setPendingCsvAnns(prev => [...prev, activeCsvAnn])
        setActiveCsvAnn(null)
        return
      }
      if (e.key === 'Enter' && activeMask && !predicting) {
        onRequestSave()
        return
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !predicting) {
        e.preventDefault()
        if (points.length === 0) return
        const newPoints = points.slice(0, -1)
        setPoints(newPoints)
        if (newPoints.length === 0) {
          setActiveMask(null)
          setIouScore(null)
        } else {
          setPredicting(true)
          setError('')
          try {
            const result = await predict(`${config.dataset_dir}/${selectedImage}`, newPoints)
            setActiveMask(result.mask_b64)
            setIouScore(result.iou_score)
          } catch (err) {
            setError(typeof err === 'string' ? err : 'Prediction error')
          } finally {
            setPredicting(false)
          }
        }
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [activeMask, activeCsvAnn, predicting, points, selectedImage, config.dataset_dir,
      drawMode, manualPoints, imgDims, activeTab,
      onRequestSave, setPoints, setActiveMask, setIouScore, setPredicting,
      setActiveCsvAnn, setPendingCsvAnns])

  const handleWheel = useCallback((e) => {
    e.evt.preventDefault()
    const stage = stageRef.current
    if (!stage) return
    const oldZoom = stage.scaleX()
    const pointer = stage.getPointerPosition()
    const factor  = e.evt.deltaY < 0 ? 1.12 : 1 / 1.12
    const newZoom = Math.max(0.3, Math.min(15, oldZoom * factor))
    const mousePointTo = {
      x: (pointer.x - stage.x()) / oldZoom,
      y: (pointer.y - stage.y()) / oldZoom,
    }
    setZoom(newZoom)
    setStagePos({
      x: pointer.x - mousePointTo.x * newZoom,
      y: pointer.y - mousePointTo.y * newZoom,
    })
  }, [])

  const changeZoom = useCallback((factor) => {
    const stage = stageRef.current
    if (!stage) return
    const oldZoom = stage.scaleX()
    const newZoom = Math.max(0.3, Math.min(15, oldZoom * factor))
    const cx = containerSize.width  / 2
    const cy = containerSize.height / 2
    const mousePointTo = {
      x: (cx - stage.x()) / oldZoom,
      y: (cy - stage.y()) / oldZoom,
    }
    setZoom(newZoom)
    setStagePos({
      x: cx - mousePointTo.x * newZoom,
      y: cy - mousePointTo.y * newZoom,
    })
  }, [containerSize])

  const resetZoom = useCallback(() => {
    setZoom(1)
    setStagePos({ x: 0, y: 0 })
  }, [])

  const handleClick = useCallback(async (e, label) => {
    if (dragging.current || !selectedImage || !bgImage || predicting) return
    const stage = e.target.getStage()
    const ptr   = stage.getPointerPosition()
    const imgX  = Math.round((ptr.x - stage.x()) / stage.scaleX() / scale)
    const imgY  = Math.round((ptr.y - stage.y()) / stage.scaleY() / scale)
    if (imgX < 0 || imgY < 0 || imgX >= imgDims.w || imgY >= imgDims.h) return

    setError('')
    const newPoints = [...points, { x: imgX, y: imgY, label }]
    setPoints(newPoints)

    setPredicting(true)
    try {
      const result = await predict(`${config.dataset_dir}/${selectedImage}`, newPoints)
      setActiveMask(result.mask_b64)
      setIouScore(result.iou_score)
    } catch (err) {
      setError(typeof err === 'string' ? err : 'Prediction error')
    } finally {
      setPredicting(false)
    }
  }, [selectedImage, bgImage, predicting, points, scale, imgDims, config.dataset_dir,
      setPoints, setActiveMask, setIouScore, setPredicting])

  const handleStageClick  = (e) => {
    if (selectMode) { onClearSelection?.(); return }
    if (drawMode) {
      // Freehand points are handled by mousedown/mousemove
      return
    }
    if (e.evt.button === 0) handleClick(e, 1)
  }
  const handleContextMenu = (e) => {
    e.evt.preventDefault()
    if (drawMode) {
      setManualPoints(prev => prev.slice(0, -1))
      return
    }
    if (!selectMode) handleClick(e, 0)
  }

  const handleStageMouseDown = (e) => {
    if (isCsvTab || selectMode || predicting) return
    if (drawMode) {
      if (e.evt.button === 0) { // left click
        freehandDrawing.current = true
        const stage = e.target.getStage()
        const ptr = stage.getPointerPosition()
        const imgX = Math.round((ptr.x - stage.x()) / stage.scaleX() / scale)
        const imgY = Math.round((ptr.y - stage.y()) / stage.scaleY() / scale)
        setManualPoints(prev => [...prev, { x: imgX, y: imgY }])
      }
      return
    }
    if (e.evt.shiftKey) {
      const stage = e.target.getStage()
      const ptr   = stage.getPointerPosition()
      const imgX  = Math.round((ptr.x - stage.x()) / stage.scaleX() / scale)
      const imgY  = Math.round((ptr.y - stage.y()) / stage.scaleY() / scale)
      setDraftBox({ x1: imgX, y1: imgY, x2: imgX, y2: imgY })
    }
  }

  const handleStageMouseUp = async (e) => {
    if (drawMode && freehandDrawing.current) {
      freehandDrawing.current = false
      return
    }
    if (draftBox) {
      const box = draftBox
      setDraftBox(null)
      const minX = Math.min(box.x1, box.x2)
      const maxX = Math.max(box.x1, box.x2)
      const minY = Math.min(box.y1, box.y2)
      const maxY = Math.max(box.y1, box.y2)
      
      if (maxX - minX < 2 || maxY - minY < 2) return
      
      setError('')
      setPoints([])
      setPredicting(true)
      try {
        const result = await predict(`${config.dataset_dir}/${selectedImage}`, [], [minX, minY, maxX, maxY])
        setActiveMask(result.mask_b64)
        setIouScore(result.iou_score)
      } catch (err) {
        setError(typeof err === 'string' ? err : 'Prediction error')
      } finally {
        setPredicting(false)
      }
    }
  }

  const handleMouseMove = useCallback((e) => {
    const stage = e.target.getStage()
    if (!stage) return
    const pos = stage.getPointerPosition()
    if (pos) setMousePos(pos)
    
    if (drawMode && freehandDrawing.current) {
      const imgX = Math.round((pos.x - stage.x()) / stage.scaleX() / scale)
      const imgY = Math.round((pos.y - stage.y()) / stage.scaleY() / scale)
      setManualPoints(prev => {
        if (prev.length === 0) return [{ x: imgX, y: imgY }]
        const last = prev[prev.length - 1]
        // Drop a point every 5 raw pixels for smooth lasso without overloading
        const dist = Math.hypot(last.x - imgX, last.y - imgY)
        if (dist > 5) {
          return [...prev, { x: imgX, y: imgY }]
        }
        return prev
      })
      return
    }

    if (draftBox) {
      const imgX = Math.round((pos.x - stage.x()) / stage.scaleX() / scale)
      const imgY = Math.round((pos.y - stage.y()) / stage.scaleY() / scale)
      setDraftBox(prev => ({ ...prev, x2: imgX, y2: imgY }))
    }
  }, [draftBox, scale])

  const isCsvTab = activeTab === 'csv'

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#111' }}>
      {/* Tab bar */}
      {selectedImage && (
        <div style={{ display: 'flex', background: '#0a0a1e', flexShrink: 0 }}>
          {['sam3', 'csv'].map(t => (
            <button key={t} onClick={() => setActiveTab(t)} style={{
              padding: '6px 22px',
              background: activeTab === t ? '#0f3460' : '#0a0a1e',
              color: activeTab === t ? '#a8d8ea' : '#555',
              border: 'none',
              borderBottom: activeTab === t ? '2px solid #a8d8ea' : '2px solid transparent',
              cursor: 'pointer', fontSize: 13,
              fontWeight: activeTab === t ? 600 : 400,
            }}>
              {t === 'sam3' ? 'SAM3' : `Biigle CSV${csvAnnotations.length ? ` (${csvAnnotations.length})` : ''}`}
            </button>
          ))}
        </div>
      )}

      <div ref={containerRef} style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        {!selectedImage && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#444', fontSize: 15 }}>
            Select an image from the left panel
          </div>
        )}

        {selectedImage && status === 'loading' && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#666' }}>
            Loading…
          </div>
        )}

        {selectedImage && status === 'loaded' && (
          <>
            {(predicting || error) && !isCsvTab && (
              <div style={{
                position: 'absolute', top: 8, left: 8, zIndex: 10,
                background: 'rgba(0,0,0,0.75)', borderRadius: 6, padding: '4px 12px',
                fontSize: 12, color: error ? '#f88' : '#a8d8ea',
              }}>
                {error || 'Predicting…'}
              </div>
            )}

            {activeCsvAnn && !isCsvTab && (
              <div style={{
                position: 'absolute', top: 8, left: 8, zIndex: 10,
                background: 'rgba(0,20,60,0.88)', borderRadius: 6, padding: '4px 12px',
                fontSize: 12, color: '#60c8ff', border: '1px solid #2255aa',
              }}>
                Biigle polygon selected — Enter to save · Click to add SAM3 point
              </div>
            )}

            {tooltip && (
              <div style={{
                position: 'absolute', left: mousePos.x + 14, top: mousePos.y - 10,
                background: 'rgba(0,0,0,0.88)', color: '#fff',
                padding: '4px 10px', borderRadius: 4, fontSize: 11,
                pointerEvents: 'none', zIndex: 20, maxWidth: 260,
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                border: '1px solid #333',
              }}>
                {tooltip}
              </div>
            )}

            {drawMode && !isCsvTab && (
              <div style={{
                position: 'absolute', top: 8, right: 8, zIndex: 10,
                background: 'rgba(255,0,255,0.15)', borderRadius: 6, padding: '6px 12px',
                fontSize: 12, color: '#ff88ff', border: '1px solid #aa22aa',
                display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2
              }}>
                <div><b>Manual Draw Mode</b></div>
                <div style={{ fontSize: 10 }}>Left click: Add point</div>
                <div style={{ fontSize: 10 }}>Drag: Freehand lasso</div>
                <div style={{ fontSize: 10 }}>Right click: Undo point</div>
                <div style={{ fontSize: 10 }}>Enter: Finish polygon</div>
                <div style={{ fontSize: 10 }}>Delete/Esc: Cancel</div>
              </div>
            )}

            {/* Zoom + opacity kontrolleri */}
            <div style={{
              position: 'absolute', bottom: 12, right: 12, zIndex: 10,
              background: 'rgba(10,10,30,0.8)', borderRadius: 8,
              padding: '8px 10px', display: 'flex', flexDirection: 'column',
              alignItems: 'center', gap: 5, border: '1px solid #222',
            }}>
              <button onClick={() => changeZoom(1.25)} style={zoomBtn}>＋</button>
              <span style={{ fontSize: 11, color: '#aaa', minWidth: 36, textAlign: 'center' }}>
                {Math.round(zoom * 100)}%
              </span>
              <button onClick={() => changeZoom(1 / 1.25)} style={zoomBtn}>－</button>
              <button onClick={resetZoom} title="Fit" style={{ ...zoomBtn, fontSize: 14, marginTop: 2 }}>⊡</button>
              <div style={{ width: '100%', height: 1, background: '#333', margin: '4px 0' }} />
              <span style={{ fontSize: 10, color: '#666' }}>Opacity</span>
              <input
                type="range" min={0} max={80} value={annOpacity}
                onChange={e => setAnnOpacity(Number(e.target.value))}
                style={{ width: 60, accentColor: '#a8d8ea' }}
              />
              <span style={{ fontSize: 10, color: '#888' }}>{annOpacity}%</span>
              <div style={{ width: '100%', height: 1, background: '#333', margin: '4px 0' }} />
              <button
                onClick={() => setShowAnns(v => !v)}
                title={showAnns ? 'Hide annotations' : 'Show annotations'}
                style={{
                  ...zoomBtn, width: 36, fontSize: 16,
                  background: showAnns ? '#1a3a5a' : '#1a1a1a',
                  color: showAnns ? '#a8d8ea' : '#555',
                  border: showAnns ? '1px solid #3a6a9a' : '1px solid #333',
                }}
              >
                {showAnns ? '👁' : '👁'}
              </button>
              <button
                onClick={() => { setDrawMode(v => !v); setSelectMode(false) }}
                title={drawMode ? 'Exit Manual Draw' : 'Manual Polygon Draw (M)'}
                style={{
                  ...zoomBtn, width: 36, fontSize: 16,
                  background: drawMode ? '#7a3aaa' : '#1a1a1a',
                  color: drawMode ? '#fff' : '#555',
                  border: drawMode ? '1px solid #9a5aCC' : '1px solid #333',
                }}
              >
                ✎
              </button>
              <div
                onClick={() => { setSelectMode(v => !v); setDrawMode(false) }}
                title={selectMode ? 'Switch to annotate mode (✏)' : 'Switch to select mode (↖)'}
                style={{ cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}
              >
                <span style={{ fontSize: 9, color: selectMode ? '#c8a8ff' : '#888', letterSpacing: 0.3 }}>
                  {selectMode ? '↖ select' : '✏ draw'}
                </span>
                <div style={{
                  width: 36, height: 18, borderRadius: 9,
                  background: selectMode ? '#7a3aaa' : '#2a2a3a',
                  border: selectMode ? '1px solid #9a5aCC' : '1px solid #444',
                  position: 'relative', transition: 'background 0.15s',
                }}>
                  <div style={{
                    position: 'absolute', top: 2,
                    left: selectMode ? 19 : 2,
                    width: 12, height: 12, borderRadius: '50%',
                    background: selectMode ? '#c8a8ff' : '#666',
                    transition: 'left 0.15s',
                  }} />
                </div>
              </div>
            </div>

            <Stage
              ref={stageRef}
              width={containerSize.width}
              height={containerSize.height}
              scaleX={zoom}
              scaleY={zoom}
              x={stagePos.x}
              y={stagePos.y}
              draggable={!shiftHeld && !draftBox}
              onDragStart={() => { dragging.current = true }}
              onDragEnd={e => {
                setStagePos({ x: e.target.x(), y: e.target.y() })
                setTimeout(() => { dragging.current = false }, 50)
              }}
              onWheel={handleWheel}
              onClick={isCsvTab || draftBox ? null : handleStageClick}
              onContextMenu={isCsvTab || draftBox ? null : handleContextMenu}
              onMouseDown={handleStageMouseDown}
              onMouseUp={handleStageMouseUp}
              onMouseMove={handleMouseMove}
              style={{ cursor: isCsvTab ? 'default' : selectMode ? 'default' : (predicting ? 'wait' : (shiftHeld ? 'crosshair' : 'crosshair')) }}
            >
              <Layer>
                {bgImage && <KonvaImage image={bgImage} scaleX={scale} scaleY={scale} />}

                {!isCsvTab && (
                  <>
                    {showAnns && (
                      <AnnotationOverlay
                        annotations={annotations} scaleX={scale} scaleY={scale}
                        config={config} opacity={annOpacity} zoom={zoom}
                        selectedAnnIds={selectedAnnIds}
                        highlightStyle={highlightStyle}
                        selectMode={selectMode}
                        onAnnClick={onAnnClick}
                      />
                    )}
                    {colorizedMask && (
                      <MaskOverlay dataUrl={colorizedMask} scaleX={scale} scaleY={scale} opacity={annOpacity} />
                    )}
                    {/* Show active CSV annotation polygon in SAM3 tab */}
                    {activeCsvAnn && (
                      <Line
                        points={activeCsvAnn.points.map(v => v * scale)}
                        closed={activeCsvAnn.shape_name !== 'Point'}
                        fill={`rgba(96,200,255,${annOpacity / 100 * 0.45})`}
                        stroke="#60c8ff" strokeWidth={2.5}
                      />
                    )}
                    {points.map((p, i) => (
                      <Circle
                        key={i} x={p.x * scale} y={p.y * scale}
                        radius={5 / zoom}
                        fill={p.label === 1 ? '#00dd00' : '#dd2222'}
                        stroke="white" strokeWidth={1.5 / zoom}
                      />
                    ))}
                    {draftBox && (
                      <Rect
                        x={Math.min(draftBox.x1, draftBox.x2) * scale}
                        y={Math.min(draftBox.y1, draftBox.y2) * scale}
                        width={Math.abs(draftBox.x2 - draftBox.x1) * scale}
                        height={Math.abs(draftBox.y2 - draftBox.y1) * scale}
                        stroke="#00ccff" strokeWidth={2 / zoom}
                        fill="rgba(0, 204, 255, 0.2)"
                      />
                    )}
                    {drawMode && manualPoints.length > 0 && (
                      <Line
                        points={manualPoints.flatMap(p => [p.x * scale, p.y * scale])}
                        closed={false}
                        stroke="#ff44ff"
                        strokeWidth={2.5 / zoom}
                      />
                    )}
                    {drawMode && manualPoints.length > 0 && mousePos && (
                      <Line
                        points={[
                          manualPoints[manualPoints.length - 1].x * scale,
                          manualPoints[manualPoints.length - 1].y * scale,
                          (mousePos.x - stagePos.x) / zoom,
                          (mousePos.y - stagePos.y) / zoom
                        ]}
                        stroke="#ff44ff"
                        strokeWidth={2 / zoom}
                        dash={[5 / zoom, 5 / zoom]}
                      />
                    )}
                    {drawMode && manualPoints.map((p, i) => (
                      <Circle
                        key={`mp-${i}`}
                        x={p.x * scale}
                        y={p.y * scale}
                        radius={4 / zoom}
                        fill="#ff44ff"
                      />
                    ))}
                  </>
                )}

                {(isCsvTab || (shiftHeld && !selectMode)) && csvAnnotations.length > 0 && (
                  <CsvAnnotationLayer
                    annotations={csvAnnotations}
                    scale={scale}
                    opacity={annOpacity}
                    config={config}
                    filterClass={filterCsvClass}
                    selectedAnn={activeCsvAnn}
                    pendingAnns={pendingCsvAnns}
                    zoom={zoom}
                    onSelect={setActiveCsvAnn}
                    onAltClick={(ann) => {
                      setPendingCsvAnns(prev => [...prev, ann])
                    }}
                    onCtrlClick={(ann) => {
                      const k = ann.label_name + '|' + ann.points[0] + ',' + ann.points[1]
                      setPendingCsvAnns(prev => prev.filter(p =>
                        (p.label_name + '|' + p.points[0] + ',' + p.points[1]) !== k
                      ))
                    }}
                    onHover={setTooltip}
                  />
                )}
              </Layer>
            </Stage>
          </>
        )}
      </div>
    </div>
  )
}

const zoomBtn = {
  width: 28, height: 24, background: '#1a2a4a', color: '#ccc',
  border: '1px solid #334', borderRadius: 4, cursor: 'pointer',
  fontSize: 15, lineHeight: 1, padding: 0,
}
