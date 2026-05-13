import { Line, Circle } from 'react-konva'
import { colorToRgba } from '../colorUtils'

export function annKey(ann) {
  return ann.label_name + '|' + ann.points[0] + ',' + ann.points[1]
}

function isPending(ann, pendingAnns) {
  const k = annKey(ann)
  return pendingAnns.some(p => annKey(p) === k)
}

function isSelected(ann, selectedAnn) {
  if (!selectedAnn) return false
  return annKey(ann) === annKey(selectedAnn)
}

export default function CsvAnnotationLayer({
  annotations = [],
  scale,
  opacity = 30,
  config,
  filterClass = null,
  selectedAnn = null,
  pendingAnns = [],
  onSelect,
  onAltClick,
  onCtrlClick,
  onHover,
  zoom = 1,
}) {
  const visible = filterClass
    ? annotations.filter(a => a.label_name === filterClass)
    : annotations

  return visible.map((ann, i) => {
    const cls    = config?.classes?.find(c => c.name === ann.label_name)
    const color  = cls?.color || '#ffdd00'
    const pts    = ann.points.map(v => v * scale)
    const sel    = isSelected(ann, selectedAnn)
    const pend   = isPending(ann, pendingAnns)

    const fillAlpha   = opacity / 100 * 0.55
    const strokeColor = pend ? '#4488ff' : sel ? '#ffffff' : color
    const strokeWidth = (sel ? 3 : pend ? 2.5 : 1.5) / zoom

    const fillColor = pend
      ? `rgba(68,136,255,${fillAlpha})`
      : sel
        ? `rgba(255,255,255,${fillAlpha})`
        : colorToRgba(color, fillAlpha)

    const handlers = {
      onMouseEnter: () => onHover?.(ann.label_name),
      onMouseLeave: () => onHover?.(null),
      onClick: (e) => {
        e.cancelBubble = true
        if (e.evt.ctrlKey || e.evt.metaKey) {
          onCtrlClick?.(ann)
        } else if (e.evt.altKey) {
          onAltClick?.(ann)
        } else {
          onSelect?.(ann)
        }
      },
    }

    if (ann.shape_name === 'Point') {
      return (
        <Circle
          key={i}
          x={pts[0]} y={pts[1]}
          radius={(pend ? 9 : sel ? 8 : 6) / zoom}
          fill={pend ? 'rgba(68,136,255,0.8)' : sel ? 'rgba(255,255,255,0.8)' : colorToRgba(color, 0.8)}
          stroke={strokeColor}
          strokeWidth={strokeWidth}
          {...handlers}
        />
      )
    }

    return (
      <Line
        key={i}
        points={pts}
        closed
        fill={fillColor}
        stroke={strokeColor}
        strokeWidth={strokeWidth}
        {...handlers}
      />
    )
  })
}
