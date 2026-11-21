export function publicMetadata(origin: string | undefined) {
  let root: string | null = null
  if (origin) {
    try {
      const url = new URL(origin)
      if (url.protocol === 'https:' && url.pathname === '/' && !url.search && !url.hash
        && !url.username && !url.password && /^[a-z0-9-]+(?:\.[a-z0-9-]+)+$/i.test(url.hostname)
        && !url.hostname.endsWith('.localhost') && !/^\d+\.\d+\.\d+\.\d+$/.test(url.hostname)) root = url.origin + '/'
    } catch {
      // An unconfigured or malformed origin leaves the build non-indexable.
    }
  }
  const robots = root
    ? `User-agent: *\nDisallow: /api/\nDisallow: /docs\nDisallow: /redoc\nDisallow: /openapi.json\nSitemap: ${root}sitemap.xml\n`
    : 'User-agent: *\nDisallow: /\n'
  const sitemap = root
    ? `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${root}</loc></url></urlset>\n`
    : null
  return { root, robots, sitemap }
}
