// Converts HSL or #hex color to an rgba() string
export function colorToRgba(color, alpha) {
  return `rgba(${colorToRgb(color)},${alpha.toFixed(3)})`
}

// Returns a "r,g,b" string
export function colorToRgb(color) {
  if (!color) return '200,200,200'
  color = color.trim()

  if (color.startsWith('#')) {
    const m6 = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/i.exec(color)
    if (m6) return `${parseInt(m6[1],16)},${parseInt(m6[2],16)},${parseInt(m6[3],16)}`
    const m3 = /^#([0-9a-f])([0-9a-f])([0-9a-f])/i.exec(color)
    if (m3) {
      return `${parseInt(m3[1]+m3[1],16)},${parseInt(m3[2]+m3[2],16)},${parseInt(m3[3]+m3[3],16)}`
    }
  }

  if (color.startsWith('hsl')) {
    const m = color.match(/hsl\(\s*([\d.]+)\s*,\s*([\d.]+)%\s*,\s*([\d.]+)%/)
    if (m) {
      const [r, g, b] = hslToRgb(+m[1] / 360, +m[2] / 100, +m[3] / 100)
      return `${r},${g},${b}`
    }
  }

  return '200,200,200'
}

function hslToRgb(h, s, l) {
  let r, g, b
  if (s === 0) {
    r = g = b = l
  } else {
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s
    const p = 2 * l - q
    const hue2rgb = (p, q, t) => {
      if (t < 0) t += 1
      if (t > 1) t -= 1
      if (t < 1 / 6) return p + (q - p) * 6 * t
      if (t < 1 / 2) return q
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6
      return p
    }
    r = hue2rgb(p, q, h + 1 / 3)
    g = hue2rgb(p, q, h)
    b = hue2rgb(p, q, h - 1 / 3)
  }
  return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)]
}
