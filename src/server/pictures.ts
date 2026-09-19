// Placeholder photography: Gemini can't produce real image URLs, so pictures are seeded stand-ins.
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

export const picture = (seed: string, w: number, h: number) => `https://picsum.photos/seed/${slug(seed) || "x"}/${w}/${h}`;
