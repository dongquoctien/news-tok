import emojiRegex from 'emoji-regex'

const EMOJI_RE = emojiRegex()

export function stripEmoji(text: string): string {
  return text.replace(EMOJI_RE, '').replace(/\s{2,}/g, ' ').trim()
}

export function hasEmoji(text: string): boolean {
  EMOJI_RE.lastIndex = 0
  return EMOJI_RE.test(text)
}
