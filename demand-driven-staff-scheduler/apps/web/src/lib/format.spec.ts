import { describe, expect, it } from 'vitest'
import { formatHours, formatPercent, formatRatio } from './format'

describe('format', () => {
  it('formats a ratio to 2 decimals by default', () => {
    expect(formatRatio(1.5)).toBe('1.50')
  })

  it('renders null as an em dash — never NaN or blank (brief §2.6 divide-by-zero guard)', () => {
    expect(formatRatio(null)).toBe('—')
  })

  it('formats hours with a trailing h', () => {
    expect(formatHours(7.5)).toBe('7.5h')
  })

  it('formats a 0..1 ratio as a percent', () => {
    expect(formatPercent(0.6)).toBe('60%')
  })
})
