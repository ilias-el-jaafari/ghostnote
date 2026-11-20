/** Prefix a public-folder path with the Vite base (needed on GitHub Pages). */
export function publicUrl(path: string): string {
  const base = import.meta.env.BASE_URL || '/'
  const clean = path.replace(/^\/+/, '')
  return `${base}${clean}`
}
