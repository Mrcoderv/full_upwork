// Single source of truth for status → hue family mapping (Phase 1).
// Hue families: neutral / info / warning / danger / success / violet.
// See assets/styles/tokens.css for the tint/ink values behind each hue.

export const HUE_NEUTRAL = 'neutral'
export const HUE_INFO = 'info'
export const HUE_WARNING = 'warning'
export const HUE_DANGER = 'danger'
export const HUE_SUCCESS = 'success'
export const HUE_VIOLET = 'violet'

// APL-board statuses (student status chip)
export const APL_STATUS = {
  GRAY: { label: 'Ny elev', hue: HUE_NEUTRAL },
  BLUE: { label: 'Kontaktad', hue: HUE_INFO },
  YELLOW: { label: 'APL på gång', hue: HUE_WARNING },
  PURPLE: { label: 'Behöver uppföljning', hue: HUE_VIOLET },
  RED: { label: 'Snart slut', hue: HUE_DANGER },
  GREEN: { label: 'Klar praktik', hue: HUE_SUCCESS },
}

// APL board column order (matches legacy GRAY/BLUE/YELLOW/PURPLE/RED/GREEN)
export const APL_STATUS_ORDER = ['GRAY', 'BLUE', 'YELLOW', 'PURPLE', 'RED', 'GREEN']

// Study plan / enrollment statuses
export const STUDIEPLAN_STATUS = {
  ej_paborjad: { label: 'Ej påbörjad', hue: HUE_NEUTRAL },
  antagen: { label: 'Antagen', hue: HUE_INFO },
  betygsatt: { label: 'Betygsatt', hue: HUE_SUCCESS },
  reviderad: { label: 'Reviderad', hue: HUE_WARNING },
  avbrott: { label: 'Avbrott', hue: HUE_DANGER },
}

// Grade statuses (unlocked grades are shown as dashed "Ej låst")
export const GRADE_STATUS = {
  ej_examinerad: { label: 'Ej examinerad', hue: HUE_NEUTRAL },
  A: { label: 'A', hue: HUE_SUCCESS },
  B: { label: 'B', hue: HUE_SUCCESS },
  C: { label: 'C', hue: HUE_INFO },
  D: { label: 'D', hue: HUE_INFO },
  E: { label: 'E', hue: HUE_WARNING },
  F: { label: 'F', hue: HUE_DANGER },
}

// Legacy helper: APL status → Vuetify color name, resolved through the
// registered theme colors (see main.js) so it lands on the shared hues.
export function aplStatusColor(status) {
  const map = {
    GRAY: 'gray',
    BLUE: 'blue',
    YELLOW: 'yellow',
    PURPLE: 'purple',
    RED: 'red',
    GREEN: 'green',
  }
  return map[status] || 'gray'
}
