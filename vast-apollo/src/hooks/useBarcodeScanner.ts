import { useEffect, useRef } from 'react'

/**
 * A wired barcode scanner (the shop's TVS BS-L150s) is a keyboard: it types the code and
 * presses Enter. Nothing has to be opened or connected, so this hook simply listens for a
 * burst of keystrokes arriving faster than a person can type.
 *
 * Typing is left alone. A scan is only a scan when every key in the burst arrives within
 * GAP_MS of the last one, which no hand can do, and when the keys land outside a text box -
 * a scan into the manual code box is that box's own business.
 */

// A fast typist manages about 100ms between keys; the scanner is under 20ms.
const GAP_MS = 50
const MIN_LENGTH = 4

const typingInto = (target: EventTarget | null) => {
    const el = target as HTMLElement | null
    if (!el) return false
    const tag = el.tagName
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable
}

/** One short note for a good scan, two low ones for a bad code. No sound file to ship. */
export function beep(ok = true) {
    try {
        const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
        const audio = new Ctx()
        const play = (frequency: number, start: number, length: number) => {
            const tone = audio.createOscillator()
            const gain = audio.createGain()
            tone.frequency.value = frequency
            gain.gain.value = 0.07
            tone.connect(gain).connect(audio.destination)
            tone.start(audio.currentTime + start)
            tone.stop(audio.currentTime + start + length)
        }
        if (ok) {
            play(1800, 0, 0.08)
        } else {
            play(320, 0, 0.14)
            play(320, 0.18, 0.14)
        }
        setTimeout(() => audio.close().catch(() => undefined), 600)
    } catch {
        /* a till with no sound card still has to take the scan */
    }
}

export function useBarcodeScanner(onScan: (code: string) => void, enabled = true) {
    // Held in refs so the listener is attached once: re-attaching on every render would drop
    // a burst that is already half typed.
    const buffer = useRef('')
    const lastKeyAt = useRef(0)
    const handler = useRef(onScan)
    handler.current = onScan

    useEffect(() => {
        if (!enabled) return

        const onKeyDown = (event: KeyboardEvent) => {
            if (typingInto(event.target)) return

            const now = Date.now()
            if (now - lastKeyAt.current > GAP_MS) buffer.current = ''
            lastKeyAt.current = now

            if (event.key === 'Enter') {
                const code = buffer.current.trim()
                buffer.current = ''
                if (code.length >= MIN_LENGTH) {
                    event.preventDefault()
                    handler.current(code)
                }
                return
            }

            // Scanners send plain characters; Shift, Tab and the rest are not part of a code.
            if (event.key.length === 1) buffer.current += event.key
        }

        window.addEventListener('keydown', onKeyDown)
        return () => window.removeEventListener('keydown', onKeyDown)
    }, [enabled])
}
