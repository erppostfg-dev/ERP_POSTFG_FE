import { THEME_TEXT } from '../constants/ui'
import { setTheme, useTheme } from '../lib/theme'

/*
 * The day / night switch in the top bar (2026-11-26, user: "a funny way for the toggle"): a tiny sky. Day = sun and a
 * drifting cloud; click = the sun rolls over and becomes a crescent moon, the sky goes deep blue and stars twinkle.
 * Styles: index.css .pf-sky*. Works with the keyboard (it is a real switch button).
 */

const STARS = [
  { top: 6, left: 9 }, { top: 15, left: 6 }, { top: 9, left: 19 }, { top: 19, left: 15 }, { top: 5, left: 25 },
]

export function ThemeToggle() {
  const theme = useTheme()
  const night = theme === 'dark'
  return (
    <button
      type="button"
      role="switch"
      aria-checked={night}
      aria-label={night ? THEME_TEXT.TO_LIGHT : THEME_TEXT.TO_DARK}
      title={night ? THEME_TEXT.TO_LIGHT : THEME_TEXT.TO_DARK}
      data-night={night}
      onClick={(e) => {
        // the new mode spreads out from the middle of the switch (lib/theme.ts)
        const b = e.currentTarget.getBoundingClientRect()
        setTheme(night ? 'light' : 'dark', { x: b.left + b.width / 2, y: b.top + b.height / 2 })
      }}
      className="pf-sky shrink-0"
    >
      {STARS.map((s, i) => <span key={i} className="pf-sky-star" style={{ top: s.top, left: s.left, animationDelay: `${i * 0.45}s` }} />)}
      <span className="pf-sky-cloud" />
      <span className="pf-sky-knob" />
    </button>
  )
}
