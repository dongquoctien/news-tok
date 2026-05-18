/**
 * Parse a narration `text` containing `**...**` highlight markers into
 * two complementary views:
 *
 *   - `runs`        — alternating `{ text, highlighted }` segments,
 *                     useful for whole-string primitives that render
 *                     the headline in one go (e.g. FadeInText).
 *   - `strippedText`— the same text with `**` removed, suitable for
 *                     primitives that need a single plain string
 *                     (e.g. TypewriterText measures character count).
 *   - `wordMask`    — `boolean[]` aligned with `strippedText.split(/\s+/)`.
 *                     `true` at index `i` means token `i` was inside a
 *                     `**...**` pair. Per-word primitives (KaraokeText,
 *                     WordPopText, …) use this to decide which word
 *                     gets the highlight repaint.
 *
 * Markers must come in matched pairs. An unbalanced `**` is treated as
 * a literal asterisk pair and the text passes through unchanged so a
 * stray marker can never wipe out the rest of the headline.
 *
 * The renderer treats the markers as a presentation layer — they are
 * already stripped before Edge TTS reads the line, so the word
 * boundaries we receive back already match `strippedText`.
 */

export type TextRun = {
  text: string
  highlighted: boolean
}

export type ParsedHighlight = {
  runs: TextRun[]
  strippedText: string
  wordMask: boolean[]
  /** True when at least one `**...**` pair was found. */
  hasHighlight: boolean
}

const MARKER_RE = /\*\*([^*]+)\*\*/g

export function parseHighlightMarkers(input: string): ParsedHighlight {
  if (!input.includes('**')) {
    return {
      runs: [{ text: input, highlighted: false }],
      strippedText: input,
      wordMask: tokenMask(input, () => false),
      hasHighlight: false,
    }
  }

  const runs: TextRun[] = []
  let last = 0
  let m: RegExpExecArray | null
  // Reset the regex's lastIndex — it's a /g instance and we're calling
  // it multiple times across the function lifetime.
  MARKER_RE.lastIndex = 0
  while ((m = MARKER_RE.exec(input)) !== null) {
    if (m.index > last) runs.push({ text: input.slice(last, m.index), highlighted: false })
    runs.push({ text: m[1]!, highlighted: true })
    last = m.index + m[0].length
  }
  if (last < input.length) runs.push({ text: input.slice(last), highlighted: false })

  // No matched pairs (e.g. odd number of `**`) — bail back to plain text
  // so a stray marker doesn't strip half the headline.
  const hasHighlight = runs.some((r) => r.highlighted)
  if (!hasHighlight) {
    return {
      runs: [{ text: input, highlighted: false }],
      strippedText: input,
      wordMask: tokenMask(input, () => false),
      hasHighlight: false,
    }
  }

  const strippedText = runs.map((r) => r.text).join('')

  // Walk the stripped text whitespace-separating tokens and mark each
  // token's highlight bit. We track a running character cursor through
  // the runs so a long highlighted phrase that spans 3 words gets all
  // 3 tokens flagged, not just the first.
  const wordMask: boolean[] = []
  let runIdx = 0
  let runOffset = 0
  let cursor = 0
  const tokens = strippedText.split(/(\s+)/) // keep whitespace runs so cursor math stays exact
  for (const tok of tokens) {
    if (tok.length === 0) continue
    if (/^\s+$/.test(tok)) {
      cursor += tok.length
      // advance runIdx as we move through pure whitespace
      while (runIdx < runs.length && runOffset >= runs[runIdx]!.text.length) {
        runIdx += 1
        runOffset = 0
      }
      // Distribute the whitespace span across runs.
      let remaining = tok.length
      while (remaining > 0 && runIdx < runs.length) {
        const left = runs[runIdx]!.text.length - runOffset
        const take = Math.min(left, remaining)
        runOffset += take
        remaining -= take
        if (runOffset >= runs[runIdx]!.text.length) {
          runIdx += 1
          runOffset = 0
        }
      }
      continue
    }
    // Token is a non-whitespace word. Its highlight bit = "did its first
    // character land inside a highlighted run?".
    while (runIdx < runs.length && runOffset >= runs[runIdx]!.text.length) {
      runIdx += 1
      runOffset = 0
    }
    const highlighted = runIdx < runs.length ? runs[runIdx]!.highlighted : false
    wordMask.push(highlighted)
    cursor += tok.length
    // Move the cursor through the runs by `tok.length` characters.
    let remaining = tok.length
    while (remaining > 0 && runIdx < runs.length) {
      const left = runs[runIdx]!.text.length - runOffset
      const take = Math.min(left, remaining)
      runOffset += take
      remaining -= take
      if (runOffset >= runs[runIdx]!.text.length) {
        runIdx += 1
        runOffset = 0
      }
    }
  }

  return { runs, strippedText, wordMask, hasHighlight: true }
}

function tokenMask(text: string, fn: (idx: number) => boolean): boolean[] {
  const tokens = text.split(/\s+/).filter((t) => t.length > 0)
  return tokens.map((_, i) => fn(i))
}
