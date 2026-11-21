import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { publicMetadata } from './src/publicMetadata.ts'

function releaseMetadata(): Plugin {
  const { root, robots, sitemap } = publicMetadata(process.env.FINSIGHT_PUBLIC_ORIGIN)
  return {
    name: 'finsight-release-metadata',
    apply: 'build',
    transformIndexHtml() {
      return root ? [
        { tag: 'link', attrs: { rel: 'canonical', href: root } },
        { tag: 'meta', attrs: { property: 'og:url', content: root } },
      ] : [{ tag: 'meta', attrs: { name: 'robots', content: 'noindex, nofollow' } }]
    },
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'robots.txt', source: robots })
      if (sitemap) this.emitFile({ type: 'asset', fileName: 'sitemap.xml', source: sitemap })
    },
  }
}

export default defineConfig({
  plugins: [react(), releaseMetadata()],
  server: {
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
    },
  },
  build: {
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (id.includes('react-dom') || id.includes('react/')) return 'vendor-react'
          if (id.includes('three') || id.includes('@react-three')) return 'vendor-three'
          if (id.includes('gsap')) return 'vendor-animation'
          if (id.includes('lucide-react')) return 'vendor-icons'
        },
      },
    },
  },
})