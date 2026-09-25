// Hand-authored inline SVG glyphs — no emoji, no icon font. All 24×24 viewBox,
// stroked with currentColor so CSS drives the tint. Size = rendered px.

const wrap = (inner: string, s: number, sw: number): string =>
  `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" ` +
  `stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;

/** Golf tee — ball seated in the cup, tapered stem, base bar. */
export const tee = (s = 16, sw = 1.6): string =>
  wrap(
    '<circle cx="12" cy="5.6" r="3.1"/>' +
    '<path d="M9.6 9.4 L11 16.6 H13 L14.4 9.4"/>' +
    '<path d="M8.2 19.4 H15.8"/>',
    s, sw,
  );

/** Hole flag — the "par" medal. */
export const flag = (s = 16, sw = 1.6): string =>
  wrap(
    '<path d="M6.5 21 V3.5"/>' +
    '<path d="M6.5 4.5 L17.5 8 L6.5 11.5"/>' +
    '<path d="M3.5 21 H13"/>',
    s, sw,
  );

/** Target reticle — the "objectives" medal. */
export const target = (s = 16, sw = 1.6): string =>
  wrap(
    '<circle cx="12" cy="12" r="6.8"/>' +
    '<circle cx="12" cy="12" r="2.4"/>' +
    '<path d="M12 2.2 V4.8 M12 19.2 V21.8 M2.2 12 H4.8 M19.2 12 H21.8"/>',
    s, sw,
  );

/** Four-point star — the "fragments collected" medal. */
export const spark = (s = 16, sw = 1.6): string =>
  wrap('<path d="M12 3 L13.9 10.1 L21 12 L13.9 13.9 L12 21 L10.1 13.9 L3 12 L10.1 10.1 Z"/>', s, sw);

/** Fragment shard — faceted crystal splinter (collectible pip). */
export const shard = (s = 16, sw = 1.6): string =>
  wrap(
    '<path d="M12 2.5 L16.8 9.5 L12 21.5 L7.2 9.5 Z"/>' +
    '<path d="M7.2 9.5 H16.8 M12 2.5 V21.5" opacity="0.45"/>',
    s, sw,
  );

export const pause = (s = 16): string =>
  wrap('<path d="M9 5 V19 M15 5 V19"/>', s, 2.4);

export const play = (s = 16): string =>
  wrap('<path d="M8.5 5.5 L18 12 L8.5 18.5 Z"/>', s, 1.8);

export const lock = (s = 16, sw = 1.6): string =>
  wrap(
    '<rect x="6" y="11" width="12" height="8.5" rx="2"/>' +
    '<path d="M8.5 11 V8 a3.5 3.5 0 0 1 7 0 V11"/>',
    s, sw,
  );

export const check = (s = 12, sw = 2): string =>
  wrap('<path d="M4.5 12.5 L9.5 17.5 L19.5 7"/>', s, sw);

/** Mixer sliders — the settings glyph (deliberately not a gear). */
export const sliders = (s = 16, sw = 1.6): string =>
  wrap(
    '<path d="M4 7 H20 M4 12 H20 M4 17 H20"/>' +
    '<circle cx="9.5" cy="7" r="2.1" fill="currentColor" stroke="none"/>' +
    '<circle cx="15" cy="12" r="2.1" fill="currentColor" stroke="none"/>' +
    '<circle cx="7.5" cy="17" r="2.1" fill="currentColor" stroke="none"/>',
    s, sw,
  );

export const back = (s = 16, sw = 1.8): string =>
  wrap('<path d="M14.5 5 L7.5 12 L14.5 19"/>', s, sw);

export const next = (s = 16, sw = 1.8): string =>
  wrap('<path d="M9.5 5 L16.5 12 L9.5 19"/>', s, sw);

export const replay = (s = 16, sw = 1.8): string =>
  wrap(
    '<path d="M17.7 6.6 A8 8 0 1 0 20 12"/>' +
    '<path d="M17.9 2.8 V6.8 H13.9"/>',
    s, sw,
  );

/** Tee with a slash — "undo pin" (same tee body as the HUD pin markers). */
export const teeSlash = (s = 16, sw = 1.6): string =>
  wrap(
    '<circle cx="12" cy="5.6" r="3.1"/>' +
    '<path d="M9.6 9.4 L11 16.6 H13 L14.4 9.4"/>' +
    '<path d="M8.2 19.4 H15.8"/>' +
    '<path d="M4.5 4 L19.5 20"/>',
    s, sw,
  );
