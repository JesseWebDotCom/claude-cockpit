// COCKPIT-33: the one-line summary at the upper right of the captain row and of every crew row: provider, model, time
// ("MAX: Sonnet 5.5 4m", "codex GPT-6 Luna 12m", "claude Sonnet 4m"). Pure; tested in tests/cockpit33.test.ts.
// A field the pane or session does not expose is left out, never invented. When the line is too wide the model is cut
// first (with an ellipsis, then dropped), then the provider; the time always stays.
import { fitText, textWidth } from './draw.ts'

export type SummaryIn = {
  // "MAX", "codex", "claude", "opencode", "local"; '' when unknown.
  provider: string
  // "Sonnet 5.5", "GPT-6 Luna low" (a mode or effort the pane shows rides in the model text); '' when unknown.
  model: string
  // "4m", "12m"; '' when the row has no running clock.
  time: string
  // The captain's shape puts a colon after the provider ("MAX: Sonnet 5.5 4m").
  colon?: boolean
}

// Narrowest cut of a model worth showing ("So…"); below this the model is dropped whole.
const MODEL_MIN_CHARS = 3

// The line at full length, nothing cut. This is also the tooltip and accessible text.
export function summaryFull(i: SummaryIn): string {
  const p = i.provider.trim() === '' ? '' : i.provider.trim() + (i.colon === true ? ':' : '')
  return [p, i.model.trim(), i.time.trim()].filter(s => s !== '').join(' ')
}

// The line cut to maxPx at the given font size: model first, then provider; the time is never cut.
export function summaryFit(i: SummaryIn, maxPx: number, size: number): string {
  const full = summaryFull(i)
  if (textWidth(full, size) <= maxPx) return full
  const time = i.time.trim()
  const model = i.model.trim()
  const provider = i.provider.trim() === '' ? '' : i.provider.trim() + (i.colon === true ? ':' : '')
  const space = textWidth(' ', size)
  const timeW = textWidth(time, size)
  if (time === '' ) return fitText(full, size, maxPx)
  if (model !== '') {
    const lead = provider === '' ? 0 : textWidth(provider, size) + space
    const avail = maxPx - lead - timeW - space
    const minW = textWidth(model.slice(0, MODEL_MIN_CHARS), size)
    if (avail >= minW) return [provider, fitText(model, size, avail), time].filter(s => s !== '').join(' ')
  }
  if (provider !== '') {
    const avail = maxPx - timeW - space
    if (avail >= textWidth(provider.slice(0, 2), size)) return fitText(provider, size, avail) + ' ' + time
  }
  return time
}

// Splits the powered text ("Codex (ChatGPT plan) · GPT-6 Luna low", "Claude Max · Sonnet 5.5") into its model part;
// '' when the text names none or says the model is unknown.
export function modelOfPowered(powered: string): string {
  const at = powered.indexOf('·')
  if (at < 0) return ''
  const model = powered.slice(at + 1).trim()
  return /^model unknown$/i.test(model) || /^unknown$/i.test(model) ? '' : model
}

// The provider word for a crew member's kind, lower case as the lanes are named; an unknown kind keeps its own word.
export function providerOfKind(kind: string): string {
  const k = kind.trim().toLowerCase()
  if (k === '' || k === 'unknown') return ''
  return k
}
