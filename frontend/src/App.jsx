import { useState, useEffect, useCallback } from 'react'
import ConfigScreen     from './components/ConfigScreen'
import ImageList        from './components/ImageList'
import AnnotationCanvas from './components/AnnotationCanvas'
import AnnotationPanel  from './components/AnnotationPanel'
import ClassInputModal  from './components/ClassInputModal'
import { getConfig, getImages, getAnnotations, saveAnnotation, predict, getCsvAnnotations, getAnnotationCounts, saveCsvBatch, autoAnnotatePoints, deleteAnnotation } from './api'

export default function App() {
  const [config,        setConfig]        = useState(null)
  const [started,       setStarted]       = useState(false)
  const [images,        setImages]        = useState([])
  const [selectedImage, setSelectedImage] = useState(null)
  const [annotations,   setAnnotations]   = useState([])
  const [points,        setPoints]        = useState([])
  const [activeMask,    setActiveMask]    = useState(null)
  const [iouScore,      setIouScore]      = useState(null)
  const [predicting,    setPredicting]    = useState(false)
  const [showModal,     setShowModal]     = useState(false)
  const [csvAnnotations, setCsvAnnotations] = useState([])
  const [activeTab,      setActiveTab]      = useState('sam3')
  const [shiftHeld,      setShiftHeld]      = useState(false)
  const [annCounts,      setAnnCounts]      = useState({})
  const [pendingCsvAnns,     setPendingCsvAnns]     = useState([])
  const [filterCsvClass,     setFilterCsvClass]     = useState(null)
  const [activeCsvAnn,       setActiveCsvAnn]       = useState(null)
  const [autoAnnotateTarget, setAutoAnnotateTarget] = useState(null)
  const [autoAnnotating,     setAutoAnnotating]     = useState(false)
  const [autoResult,         setAutoResult]         = useState(null)
  const [autoProgress,       setAutoProgress]       = useState({ current: 0, total: 0 })
  const [selectedAnnIds,     setSelectedAnnIds]     = useState(new Set())
  const [highlightStyle,     setHighlightStyle]     = useState('border')

  const refreshCounts = () => getAnnotationCounts().then(setAnnCounts).catch(() => {})

  useEffect(() => {
    getConfig().then(cfg => {
      setConfig(cfg)
      if (cfg.dataset_dir) {
        setStarted(true)
        getImages().then(setImages)
        refreshCounts()
      }
    })
  }, [])

  const selectImage = async (filename) => {
    setSelectedImage(filename)
    setPoints([])
    setActiveMask(null)
    setIouScore(null)
    setAnnotations(await getAnnotations(filename))
    getCsvAnnotations(filename).then(setCsvAnnotations).catch(() => setCsvAnnotations([]))
    setPendingCsvAnns([])
    setFilterCsvClass(null)
    setActiveCsvAnn(null)
    setAutoResult(null)
    setAutoAnnotateTarget(null)
    setAutoProgress({ current: 0, total: 0 })
    setSelectedAnnIds(new Set())
  }

  const handleDeleteSelected = useCallback(async () => {
    if (selectedAnnIds.size === 0) return
    for (const id of selectedAnnIds) {
      await deleteAnnotation(id)
    }
    setSelectedAnnIds(new Set())
    refreshAnnotations()
  }, [selectedAnnIds])

  useEffect(() => {
    const down = (e) => {
      if (e.key === 'Shift') { setShiftHeld(true); return }
      if (e.key === 'Delete') { handleDeleteSelected(); return }
      if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
        e.preventDefault()
        setSelectedAnnIds(new Set(annotations.map(a => a.id)))
      }
    }
    const up = (e) => { if (e.key === 'Shift') setShiftHeld(false) }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup',   up)
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up) }
  }, [handleDeleteSelected, annotations])

  const refreshAnnotations = async () => {
    if (selectedImage) setAnnotations(await getAnnotations(selectedImage))
    refreshCounts()
  }

  const handleStart = async (cfg) => {
    setConfig(cfg)
    setStarted(true)
    setImages(await getImages())
  }

  const handleClear = () => {
    setPoints([])
    setActiveMask(null)
    setIouScore(null)
  }

  const handleRequestSave = () => {
    if (activeMask) setShowModal(true)
  }

  const handleSave = async (className) => {
    if (pendingCsvAnns.length > 0) {
      // CSV batch save
      await saveCsvBatch(
        `${config.dataset_dir}/${selectedImage}`,
        className,
        pendingCsvAnns.map(a => ({ points: a.points, shape_name: a.shape_name })),
      )
      setPendingCsvAnns([])
      setActiveCsvAnn(null)
      setFilterCsvClass(null)
      refreshAnnotations()
      return
    }
    if (activeCsvAnn && !activeMask) {
      // Single CSV annotation save
      await saveCsvBatch(
        `${config.dataset_dir}/${selectedImage}`,
        className,
        [{ points: activeCsvAnn.points, shape_name: activeCsvAnn.shape_name }],
      )
      setActiveCsvAnn(null)
      refreshAnnotations()
      return
    }
    if (!activeMask || !selectedImage) return
    await saveAnnotation(`${config.dataset_dir}/${selectedImage}`, activeMask, className)
    handleClear()
    refreshAnnotations()
  }

  const handleRequestCsvSave = () => {
    if (pendingCsvAnns.length > 0) setShowModal(true)
  }

  const handleRequestAutoAnnotate = (defaultClass, points) => {
    setAutoAnnotateTarget({ defaultClass, points })
    setAutoResult(null)
  }

  const handleAnnClick = (annId, shiftKey) => {
    setSelectedAnnIds(prev => {
      const next = new Set(prev)
      if (shiftKey) {
        next.has(annId) ? next.delete(annId) : next.add(annId)
      } else {
        if (next.size === 1 && next.has(annId)) next.clear()
        else { next.clear(); next.add(annId) }
      }
      return next
    })
  }

  const handleClearSelection = () => setSelectedAnnIds(new Set())

  const doAutoAnnotate = async (className) => {
    if (!autoAnnotateTarget) return
    const pts      = autoAnnotateTarget.points
    const imgPath  = `${config.dataset_dir}/${selectedImage}`
    setAutoAnnotateTarget(null)
    setAutoAnnotating(true)
    setAutoProgress({ current: 0, total: pts.length })
    let saved = 0, failed = 0
    for (let i = 0; i < pts.length; i++) {
      try {
        const result = await predict(imgPath, [{ x: pts[i].points[0], y: pts[i].points[1], label: 1 }])
        await saveAnnotation(imgPath, result.mask_b64, className)
        saved++
      } catch {
        failed++
      }
      setAutoProgress({ current: i + 1, total: pts.length })
    }
    setAutoResult({ saved, failed })
    setAutoAnnotating(false)
    refreshAnnotations()
  }

  if (!started || !config) {
    return <ConfigScreen onStart={handleStart} initialConfig={config} />
  }

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      <ImageList images={images} selected={selectedImage} onSelect={selectImage} annCounts={annCounts} />
      <AnnotationCanvas
        config={config}
        selectedImage={selectedImage}
        points={points}
        setPoints={setPoints}
        activeMask={activeMask}
        setActiveMask={setActiveMask}
        setIouScore={setIouScore}
        annotations={annotations}
        predicting={predicting}
        setPredicting={setPredicting}
        onRequestSave={handleRequestSave}
        csvAnnotations={csvAnnotations}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        shiftHeld={shiftHeld}
        filterCsvClass={filterCsvClass}
        activeCsvAnn={activeCsvAnn}
        setActiveCsvAnn={setActiveCsvAnn}
        pendingCsvAnns={pendingCsvAnns}
        setPendingCsvAnns={setPendingCsvAnns}
        onRequestCsvSave={handleRequestCsvSave}
        selectedAnnIds={selectedAnnIds}
        highlightStyle={highlightStyle}
        onAnnClick={handleAnnClick}
        onClearSelection={handleClearSelection}
      />
      <AnnotationPanel
        config={config}
        selectedImage={selectedImage}
        annotations={annotations}
        activeMask={activeMask}
        iouScore={iouScore}
        points={points}
        onRequestSave={handleRequestSave}
        onDelete={refreshAnnotations}
        onClear={handleClear}
        predicting={predicting}
        activeTab={activeTab}
        csvAnnotations={csvAnnotations}
        filterCsvClass={filterCsvClass}
        setFilterCsvClass={setFilterCsvClass}
        pendingCsvAnns={pendingCsvAnns}
        setPendingCsvAnns={setPendingCsvAnns}
        onRequestCsvSave={handleRequestCsvSave}
        onRequestAutoAnnotate={handleRequestAutoAnnotate}
        autoAnnotating={autoAnnotating}
        autoResult={autoResult}
        autoProgress={autoProgress}
        selectedAnnIds={selectedAnnIds}
        setSelectedAnnIds={setSelectedAnnIds}
        highlightStyle={highlightStyle}
        setHighlightStyle={setHighlightStyle}
      />
      {showModal && (
        <ClassInputModal
          config={config}
          onSave={handleSave}
          onClose={() => setShowModal(false)}
          initialValue={pendingCsvAnns.length > 0 ? (filterCsvClass || '') : ''}
        />
      )}
      {autoAnnotateTarget && (
        <ClassInputModal
          config={config}
          onSave={doAutoAnnotate}
          onClose={() => setAutoAnnotateTarget(null)}
          initialValue={autoAnnotateTarget.defaultClass || ''}
        />
      )}
    </div>
  )
}
