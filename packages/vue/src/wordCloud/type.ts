/**
 * Public types for `SWordCloud` / `SWordTag`.
 *
 * The legacy word cloud typed its props inline, exported no payload type for the
 * click event (it had none) and let the tag component's own props leak the internal
 * `coefficient`/`count` bookkeeping into its public surface.
 */

/** A word as the caller writes it: a bare string, or an object with extras. */
export type WordCloudWordInput = string | WordCloudWordObject;

/** The object form of a word. */
export interface WordCloudWordObject {
  /** The text rendered on the tag. */
  text: string;
  /**
   * Relative importance. Any positive scale works (`12` and `1200` are equally
   * valid); the value is ranked across the cloud, so raw frequencies are fine.
   * Defaults to `1`.
   */
  weight?: number;
  /** Pins this word's colour, overriding both `colors` and the built-in palette. */
  color?: string;
}

/** A word after normalisation: index, a `0…1` weight and an optional colour. */
export interface WordCloudWord {
  /** The text rendered on the tag. */
  text: string;
  /** Weight normalised to `0…1` by rank across the cloud (the lightest word is `0`). */
  weight: number;
  /** Caller-supplied colour, if any. */
  color?: string;
  /** Position in the input array; also the deterministic colour index. */
  index: number;
}

/** `[min, max]` font size in pixels. The pair is sorted, so order does not matter. */
export type WordCloudFontSizeRange = readonly [number, number];

/** Props accepted by `SWordCloud`. */
export interface WordCloudProps {
  /** The words to render. */
  words?: readonly WordCloudWordInput[];

  /**
   * Deprecated alias for `words`, kept so the legacy call shape still compiles.
   * `words` wins when both are supplied; a development warning is logged.
   */
  hotWords?: readonly string[];

  /**
   * Radius of the sphere in pixels.
   *
   * When omitted the cloud fills its parent's width and derives the radius from it
   * (`aspect-ratio: 1`), which is what most layouts want. The legacy component
   * required the prop and rendered a `2 * radius` box.
   */
  radius?: number;

  /** Font size at `scale === 1`, in pixels. Defaults to `16`. */
  baseFontSize?: number;

  /** Clamps the per-frame font size, after `baseFontSize` and the depth scale. */
  fontSizeRange?: WordCloudFontSizeRange;

  /**
   * Rotation speed on a `1…10` scale; higher is faster. Values outside the range are
   * clamped. Defaults to `5`.
   */
  speed?: number;

  /** Palette cycled across the words. Falls back to the theme's status colours. */
  colors?: readonly string[];

  /** Pause while the pointer is over the cloud. Defaults to `true`. */
  pauseOnHover?: boolean;
}

/** Payload of the `wordClick` event. */
export interface WordCloudClickPayload {
  /** Text of the clicked word. */
  text: string;
  /** Its index in the resolved word list. */
  index: number;
  /** Its normalised `0…1` weight. */
  weight: number;
  /** The native click event. */
  event: MouseEvent;
}

/** Events emitted by `SWordCloud`. */
export interface WordCloudEmits {
  /** A tag was clicked. */
  wordClick: [payload: WordCloudClickPayload];
}

/** A single computed frame for one tag, applied to the DOM by `SWordTag`. */
export interface WordTagFrame {
  /** Absolute translate on the X axis, in the cloud's local pixel space. */
  translateX: number;
  /** Absolute translate on the Y axis, in the cloud's local pixel space. */
  translateY: number;
  /** `0…1`, derived from depth. */
  opacity: number;
  /** Final font size in pixels, already depth-scaled and clamped. */
  fontSize: number;
  /** Stacking order; farther tags sit behind nearer ones. */
  zIndex: number;
  /** Weight of the rendered glyphs, derived from the same depth scale. */
  fontWeight: number;
}

/**
 * Imperative handle exposed by `SWordTag`.
 *
 * The cloud keeps these handles in a plain (non-reactive) array and drives them
 * directly. Routing a per-frame update through reactive props instead would schedule
 * one component re-render per tag per frame for values that are never read by the
 * template.
 */
export interface WordTagHandle {
  /** Apply one computed frame to the tag's element. */
  place: (frame: WordTagFrame) => void;
  /** Current rendered size in pixels, at the base font size. */
  measure: () => { width: number; height: number };
  /** Drop the inline font size so the tag measures at the inherited base size. */
  reset: () => void;
  /** The tag element, or `null` before mount. */
  readonly element: HTMLElement | null;
}

/** Imperative handle exposed by `SWordCloud`. */
export interface WordCloudExposed {
  /** Start (or resume) the rotation loop. */
  start: () => void;
  /** Stop the loop, leaving the tags where they are. */
  stop: () => void;
  /** Whether the loop is currently scheduled. */
  readonly isRunning: boolean;
}
