// Helpers for the Webbeo visual layer (src/components/pro).
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
/** Turn *word* into an accent italic: "Space, *shaped* with care" */
export const emph = (s = '') => esc(s).replace(/\*([^*]+)\*/g, '<em class="italic text-signal">$1</em>');
export const tel = (p = '') => 'tel:' + p.replace(/[^\d+]/g, '');

/** Scroll-reveal classes for AstroWind's <Intersect/> controller (staggers siblings, honours reduced motion). */
export const REVEAL = 'intersect-once intersect-quarter motion-safe:opacity-0 motion-safe:intersect:animate-fade';
export const REVEAL_NOQ = REVEAL + ' intersect-no-queue';
