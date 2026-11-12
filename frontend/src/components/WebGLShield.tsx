import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Component, useCallback, useEffect, useRef, useState } from 'react'
import type { PointerEvent, ReactNode, RefObject } from 'react'
import { Color, MathUtils } from 'three'
import type { Group, Mesh, MeshStandardMaterial } from 'three'
import type { RevocationState } from './revocationStorage'

interface EmblemProps {
  status: RevocationState['status']
  completed: number
  total: number
  celebrate?: boolean
  className?: string
}

interface SceneProps {
  status: EmblemProps['status']
  completed: number
  total: number
  visible: RefObject<boolean>
  celebrate: boolean
  tilt: RefObject<{ x: number; y: number }>
  invalidateFrameRef: RefObject<(() => void) | null>
  onContextLost: () => void
}

const reducedMotionQuery = '(prefers-reduced-motion: reduce)'
const bronze = new Color('#846748')
const evergreen = new Color('#24563f')

let supportsWebGL: boolean | undefined

function canRenderEmblem() {
  if (supportsWebGL !== undefined) return supportsWebGL

  try {
    const context = document.createElement('canvas').getContext('webgl2')
    supportsWebGL = context !== null
    context?.getExtension('WEBGL_lose_context')?.loseContext()
  } catch {
    supportsWebGL = false
  }
  return supportsWebGL
}

function FinSightMark() {
  return (
    <group position={[-0.28, 0, 0.115]}>
      <mesh position={[0, 0, 0]}>
        <boxGeometry args={[0.14, 0.91, 0.06]} />
        <meshStandardMaterial color="#f1e8d5" />
      </mesh>
      <mesh position={[0.26, 0.385, 0]}>
        <boxGeometry args={[0.51, 0.14, 0.06]} />
        <meshStandardMaterial color="#f1e8d5" />
      </mesh>
      <mesh position={[0.17, 0.07, 0]}>
        <boxGeometry args={[0.35, 0.14, 0.06]} />
        <meshStandardMaterial color="#f1e8d5" />
      </mesh>
    </group>
  )
}

function EmblemScene({ status, completed, total, visible, celebrate, tilt, invalidateFrameRef, onContextLost }: SceneProps) {
  const emblem = useRef<Group>(null)
  const face = useRef<MeshStandardMaterial>(null)
  const halo = useRef<Mesh>(null)
  const haloMaterial = useRef<MeshStandardMaterial>(null)
  const spinElapsed = useRef(0)
  const floatingTime = useRef(0)
  const progress = useRef(0)
  const targetProgress = completed / total
  const { gl, invalidate } = useThree()

  useEffect(() => {
    const canvas = gl.domElement
    canvas.addEventListener('webglcontextlost', onContextLost)
    invalidateFrameRef.current = invalidate
    return () => {
      invalidateFrameRef.current = null
      canvas.removeEventListener('webglcontextlost', onContextLost)
    }
  }, [gl, invalidate, invalidateFrameRef, onContextLost])

  useEffect(() => {
    if (celebrate) spinElapsed.current = 0
    invalidate()
  }, [celebrate, invalidate])

  useFrame((_, delta) => {
    const model = emblem.current
    if (!model || !face.current || !halo.current || !haloMaterial.current) return
    if (!visible.current) return

    delta = Math.min(delta, 0.05)
    floatingTime.current += delta
    const float = Math.sin(floatingTime.current * 1.65)
    progress.current = MathUtils.damp(progress.current, targetProgress, 6, delta)
    face.current.color.copy(bronze).lerp(evergreen, progress.current)

    const targetX = -0.15 + tilt.current.y * 0.28
    const targetY = -0.2 + tilt.current.x * 0.42 + float * 0.075
    const spinning = celebrate && spinElapsed.current < 1.12

    if (spinning) spinElapsed.current += delta
    const phase = spinning ? Math.min(spinElapsed.current / 1.12, 1) : 1
    const turn = phase * phase * (3 - 2 * phase)
    const spin = spinning ? Math.PI * 2 * turn : 0
    if (!spinning && Math.abs(model.rotation.y - targetY) > Math.PI) {
      model.rotation.y -= Math.PI * 2
    }

    model.rotation.x = MathUtils.damp(model.rotation.x, targetX, 12, delta)
    model.rotation.y = spinning ? targetY + spin : MathUtils.damp(model.rotation.y, targetY, 12, delta)
    model.position.y = float * 0.048 + Math.sin(Math.PI * phase) * 0.15
    face.current.emissiveIntensity = spinning ? Math.sin(Math.PI * phase) * 0.65 : 0
    halo.current.visible = spinning
    halo.current.scale.setScalar(0.98 + phase * 0.55)
    haloMaterial.current.opacity = (1 - phase) * 0.65

    invalidate()
  })

  return (
    <>
      <hemisphereLight args={['#fff5e6', '#5d695f', 1.35]} />
      <directionalLight position={[2, 4, 5]} color="#fff0ce" intensity={3} />
      <directionalLight position={[-3, 1, -4]} color="#e3efe8" intensity={2.4} />
      <group ref={emblem} rotation={[-0.15, -0.2, 0]}>
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.84, 0.84, 0.24, 64]} />
          <meshStandardMaterial ref={face} emissive="#24563f" emissiveIntensity={0} roughness={0.36} metalness={0.32} />
        </mesh>
        {[-0.105, 0.105].map((depth) => (
          <mesh key={depth} position={[0, 0, depth]}>
            <torusGeometry args={[0.825, 0.045, 12, 64]} />
            <meshStandardMaterial color="#c39d65" roughness={0.33} metalness={0.48} />
          </mesh>
        ))}
        <mesh position={[0, 0, 0.124]}>
          <torusGeometry args={[0.71, 0.009, 6, 64]} />
          <meshStandardMaterial color="#dfc69c" roughness={0.42} />
        </mesh>
        <FinSightMark />
        <group rotation={[0, Math.PI, 0]}>
          <FinSightMark />
        </group>
      </group>
      {Array.from({ length: total }, (_, index) => {
        const segment = Math.PI * 2 / total
        const lit = index < completed
        return (
          <mesh key={index} rotation={[0, 0, Math.PI / 2 - segment * (index + 1) + 0.06]}>
            <torusGeometry args={[1.09, lit ? 0.022 : 0.009, 8, 32, segment - 0.12]} />
            <meshStandardMaterial color={lit ? '#36765a' : '#a38f72'}
              emissive={lit ? '#24563f' : '#000000'} emissiveIntensity={status === 'marked_revoked' ? 0.45 : 0.2} />
          </mesh>
        )
      })}
      <mesh ref={halo} visible={false}>
        <ringGeometry args={[0.94, 0.96, 48]} />
        <meshStandardMaterial ref={haloMaterial} color="#24563f" transparent depthWrite={false} />
      </mesh>
    </>
  )
}

class EmblemBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children
  }
}

export function WebGLShield({ status, completed, total, celebrate = false }: EmblemProps) {
  const isComplete = completed === total
  const container = useRef<HTMLDivElement>(null)
  const visible = useRef(true)
  const [reducedMotion, setReducedMotion] = useState(() => window.matchMedia(reducedMotionQuery).matches)
  const [contextLost, setContextLost] = useState(false)
  const [hasWebGL, setHasWebGL] = useState<boolean>()
  const tilt = useRef({ x: 0, y: 0 })
  const invalidateFrameRef = useRef<(() => void) | null>(null)
  const onContextLost = useCallback(() => setContextLost(true), [])

  useEffect(() => {
    if (!container.current || !('IntersectionObserver' in window)) return
    const observer = new IntersectionObserver(([entry]) => {
      visible.current = entry.isIntersecting
      if (visible.current) invalidateFrameRef.current?.()
    })
    observer.observe(container.current)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const preference = window.matchMedia(reducedMotionQuery)
    const updatePreference = () => {
      setReducedMotion(preference.matches)
      if (!preference.matches) setHasWebGL(canRenderEmblem())
    }
    updatePreference()
    preference.addEventListener('change', updatePreference)
    return () => preference.removeEventListener('change', updatePreference)
  }, [])

  function updateTilt(event: PointerEvent<HTMLDivElement>) {
    const bounds = event.currentTarget.getBoundingClientRect()
    tilt.current = {
      x: (event.clientX - bounds.left) / bounds.width * 2 - 1,
      y: (event.clientY - bounds.top) / bounds.height * 2 - 1,
    }
    invalidateFrameRef.current?.()
  }

  const fallback = (
    <div className={`shield-fallback ${isComplete ? 'complete' : ''}`}>
      <span className="shield-fallback-icon" style={{ fontFamily: 'var(--font-display)' }}>F</span>
    </div>
  )

  return (
    <div
      ref={container}
      className={`webgl-shield-container ${isComplete ? 'is-complete' : ''}`}
      aria-hidden="true"
      onPointerMove={updateTilt}
      onPointerLeave={() => {
        tilt.current = { x: 0, y: 0 }
        invalidateFrameRef.current?.()
      }}
    >
      {reducedMotion || contextLost || !hasWebGL ? fallback : (
        <EmblemBoundary fallback={fallback}>
          <Canvas
            className="webgl-shield-canvas"
            frameloop="demand"
            dpr={[1, 1.5]}
            camera={{ position: [0, 0, 4], fov: 42 }}
            fallback={fallback}
          >
            <EmblemScene
              status={status}
              completed={completed}
              total={total}
              visible={visible}
              celebrate={celebrate}
              tilt={tilt}
              invalidateFrameRef={invalidateFrameRef}
              onContextLost={onContextLost}
            />
          </Canvas>
        </EmblemBoundary>
      )}
    </div>
  )
}
