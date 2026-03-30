import { root, useState, useEffect, useMemo, useCallback } from '@lynx-js/react'
import { prepareWithSegments, layoutNextLine } from 'lynx-pretext'
import { DevPanel, useDevPanelFPS, DevPanelFPS } from '@lynx-pretext/devtools'
import {
  chikaFrames,
  chikaMeta,
  getChikaFramePos,
  type SpriteExclusionFrame,
} from './chika-exclusion'
import {
  makimaFrames,
  makimaMeta,
  getMakimaFramePos,
} from './makima-exclusion'
import chikaSprite from '../assets/chika-sprite.png'
import makimaSprite from '../assets/makima-sprite.png'

// ── Constants ──────────────────────────────────────────────────────

const DEFAULT_PAGE_WIDTH = 375
const DEFAULT_PAGE_HEIGHT = 667
const GUTTER = 20
const TEXT_FONT_SIZE = 14
const TEXT_LINE_HEIGHT = 22
const TEXT_FONT = `${TEXT_FONT_SIZE}px "Palatino Linotype", Palatino, serif`

const BODY_TEXT = `The web renders text through a pipeline that was designed thirty years ago for static documents. A browser loads a font, shapes text into glyphs, measures their combined width, determines where lines break, and positions each line vertically. Every step depends on the previous one.

Every step requires the rendering engine to consult its internal layout tree — a structure so expensive to maintain that browsers guard access to it behind synchronous reflow barriers.

For a paragraph in a blog post, this pipeline is invisible. The browser loads, lays out, and paints before the reader's eye has traveled from the address bar to the first word.

But the web is no longer a collection of static documents. It is a platform for applications, and those applications need to know about text in ways the original pipeline never anticipated.

A messaging application needs to know the exact height of every message bubble before rendering a virtualized list. A masonry layout needs the height of every card to position them without overlap. An editorial page needs text to flow around images, advertisements, and interactive elements.

The cost of layout is not just a performance concern. It shapes what developers can build. When text measurement is expensive, applications avoid dynamic layouts. They settle for fixed-width columns and predictable heights because anything else would risk jank.

This is the constraint that has defined web typography for three decades. We have built elaborate systems on top of a foundation that assumes text is static, that lines are fixed, that the viewport is a stable container.

But what if we could change that? What if text layout could be incremental, reactive, and fast enough to run at sixty frames per second? What if we could measure and lay out text in parallel with rendering, without blocking the main thread?

These are the questions that led to the development of pretext. A library that reimagines text layout for the modern web, where documents are applications and applications are dynamic.`

const VIDEO_SPRITE_WIDTH = 480
const VIDEO_SPRITE_HEIGHT = 270
// Note: FPS is now read from meta.fps (actual fps after sampling)

// ── Types ──────────────────────────────────────────────────────────────

type DancerType = 'chika' | 'makima'

type DancerConfig = {
  frames: SpriteExclusionFrame[]
  meta: typeof chikaMeta
  getFramePos: (frameIndex: number) => { x: number; y: number }
  sprite: string
  defaultScale: number // Default scale factor
}

const DANCER_CONFIGS: Record<DancerType, DancerConfig> = {
  chika: {
    frames: chikaFrames,
    meta: chikaMeta,
    getFramePos: getChikaFramePos,
    sprite: chikaSprite,
    defaultScale: 0.8,
  },
  makima: {
    frames: makimaFrames,
    meta: makimaMeta,
    getFramePos: getMakimaFramePos,
    sprite: makimaSprite,
    defaultScale: 0.75,
  },
}

type PositionedLine = {
  x: number
  y: number
  width: number
  text: string
}

type Interval = {
  left: number
  right: number
}

// ── Main Component ──────────────────────────────────────────────────────

export function DancePage() {
  const [pageWidth, setPageWidth] = useState(DEFAULT_PAGE_WIDTH)
  const [pageHeight, setPageHeight] = useState(DEFAULT_PAGE_HEIGHT)
  const [currentTime, setCurrentTime] = useState(0)
  const [isPlaying, setIsPlaying] = useState(true)
  const [preparedText, setPreparedText] = useState<ReturnType<typeof prepareWithSegments> | null>(null)
  const [dancerType, setDancerType] = useState<DancerType>('chika')
  const [scale, setScale] = useState(DANCER_CONFIGS.chika.defaultScale)

  // FPS monitoring
  const { btsFpsTick, btsFpsDisplay } = useDevPanelFPS()

  const config = DANCER_CONFIGS[dancerType]

  // Layout change callback for responsive sizing
  const onLayout = useCallback((e: any) => {
    setPageWidth(Math.floor(e.detail.width))
    setPageHeight(Math.floor(e.detail.height))
  }, [])

  // Prepare text once
  useEffect(() => {
    const prepared = prepareWithSegments(BODY_TEXT, TEXT_FONT)
    setPreparedText(prepared)
  }, [])

  // Reset scale when dancer changes
  useEffect(() => {
    setScale(config.defaultScale)
  }, [dancerType, config.defaultScale])

  // Animation loop - use requestAnimationFrame for 60fps, sprite plays at 12fps
  useEffect(() => {
    if (!isPlaying) return

    const spriteFps = config.meta.fps || 12
    const startTime = Date.now()
    let rafId: number

    const tick = () => {
      const elapsed = (Date.now() - startTime) / 1000
      setCurrentTime(elapsed % (config.meta.totalFrames / spriteFps))
      btsFpsTick() // Track BTS FPS at 60fps
      rafId = requestAnimationFrame(tick)
    }
    rafId = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlaying, config.meta.totalFrames, config.meta.fps])

  const togglePlay = useCallback(() => {
    setIsPlaying(!isPlaying)
    if (!isPlaying) {
      setCurrentTime(0)
    }
  }, [isPlaying])

  const toggleDancer = useCallback(() => {
    const types: DancerType[] = ['chika', 'makima']
    const currentIndex = types.indexOf(dancerType)
    const nextIndex = (currentIndex + 1) % types.length
    setDancerType(types[nextIndex]!)
  }, [dancerType])

  // Get current frame
  const fps = config.meta.fps || 12
  const frameIndex = Math.floor(currentTime * fps) % config.meta.totalFrames
  const currentFrame = config.frames[frameIndex]!
  const spritePos = config.getFramePos(frameIndex)

  // Calculate video display bounds (no clamp, allow overflow)
  const isPortrait = config.meta.frameHeight > config.meta.frameWidth
  const videoWidth = config.meta.frameWidth * scale
  const videoHeight = config.meta.frameHeight * scale

  // Calculate scale factor for background-position
  const scaleX = scale
  const scaleY = scale

  const videoX = (pageWidth - videoWidth) / 2
  const videoY = (pageHeight - videoHeight) / 2

  // Layout text with exclusion
  const textLines = useMemo(() => {
    if (!preparedText) return []

    const articleLeft = GUTTER
    const articleWidth = pageWidth - GUTTER * 2
    const articleHeight = pageHeight - GUTTER * 2 - 60 // Reserve space for controls
    const lineHeight = TEXT_LINE_HEIGHT

    const lines: PositionedLine[] = []
    let cursor = { segmentIndex: 0, graphemeIndex: 0 }
    let y = GUTTER

    while (y + lineHeight <= articleHeight + GUTTER) {
      // Check if this line is within video bounds
      const lineTop = y
      const lineBottom = y + lineHeight

      // Check if line overlaps with video vertically
      const videoTop = videoY
      const videoBottom = videoY + videoHeight

      if (lineBottom <= videoTop || lineTop >= videoBottom) {
        // No overlap with video, use full width
        const line = layoutNextLine(preparedText, cursor, articleWidth)
        if (!line) break
        lines.push({
          x: articleLeft,
          y,
          width: line.width,
          text: line.text,
        })
        cursor = line.end
        y += lineHeight
        continue
      }

      // Line overlaps with video - calculate exclusion
      const normalizedY = (y - videoY) / videoHeight
      const bandIndex = Math.floor(normalizedY * currentFrame.profile.length)
      const band = currentFrame.profile[Math.min(bandIndex, currentFrame.profile.length - 1)]

      if (!band) {
        y += lineHeight
        continue
      }

      // Calculate exclusion zone (relative to article bounds)
      const exclusionWidth = band.width * videoWidth
      const exclusionCenterX = videoX + videoWidth / 2 + band.offset * videoWidth
      const exclusionHalfWidth = exclusionWidth / 2

      const padding = 16 // Extra padding around exclusion (increased for safety)
      // Convert to article-relative coordinates
      const exclusionLeft = Math.max(0, exclusionCenterX - articleLeft - exclusionHalfWidth - padding)
      const exclusionRight = Math.min(articleWidth, exclusionCenterX - articleLeft + exclusionHalfWidth + padding)

      // Calculate available regions
      const regions: Interval[] = []

      if (exclusionLeft > 0) {
        regions.push({ left: 0, right: exclusionLeft })
      }

      if (exclusionRight < articleWidth) {
        regions.push({ left: exclusionRight, right: articleWidth })
      }

      // Place text in each region
      let placedAny = false
      for (const region of regions) {
        const regionWidth = region.right - region.left
        if (regionWidth < 40) continue // Skip too narrow regions

        const line = layoutNextLine(preparedText, cursor, regionWidth)
        if (!line) break

        lines.push({
          x: articleLeft + region.left,
          y,
          width: line.width,
          text: line.text,
        })
        cursor = line.end
        placedAny = true
      }

      if (placedAny) {
        y += lineHeight
      } else {
        // Skip this line if we couldn't place any text
        y += lineHeight
      }
    }

    return lines
  }, [preparedText, currentFrame, videoX, videoY, videoWidth, videoHeight, pageWidth, pageHeight])

  return (
    <DevPanel.Root defaultOpen={true}>
      <view
        style={{
          width: '100%',
          height: '100%',
          backgroundColor: '#f6f0e6',
        }}
        bindlayoutchange={onLayout}
      >
        {/* Page content — fills entire viewport */}
        <view
          style={{
            width: `${pageWidth}px`,
            height: `${pageHeight}px`,
            overflow: 'hidden',
            backgroundColor: '#f6f0e6',
          }}
        >
          {/* Video sprite display */}
          <view
            style={{
              position: 'absolute',
              left: `${videoX}px`,
              top: `${videoY}px`,
              width: `${videoWidth}px`,
              height: `${videoHeight}px`,
              overflow: 'hidden',
              backgroundImage: `url(${config.sprite})`,
              backgroundRepeat: 'no-repeat',
              // Scale background-size to match display window scale
              backgroundSize: `${config.meta.frameWidth * config.meta.cols * scaleX}px ${config.meta.frameHeight * config.meta.rows * scaleY}px`,
              // Scale background-position to match display window scale
              backgroundPosition: `${-spritePos.x * scaleX}px ${-spritePos.y * scaleY}px`,
            }}
          />

          {/* Text lines */}
          {textLines.map((line, index) => (
            <view
              key={index}
              style={{
                position: 'absolute',
                left: `${line.x}px`,
                top: `${line.y}px`,
                height: `${TEXT_LINE_HEIGHT}px`,
              }}
            >
              <text
                style={{
                  fontSize: `${TEXT_FONT_SIZE}px`,
                  color: '#11100d',
                  lineHeight: `${TEXT_LINE_HEIGHT}px`,
                }}
              >
                {line.text}
              </text>
            </view>
          ))}
        </view>

        {/* DevPanel Trigger */}
        <DevPanel.Trigger />

        {/* DevPanel Content */}
        <DevPanel.Content title="Dance Controls">
          {/* FPS Display */}
          <DevPanelFPS mtsFpsDisplay={0} btsFpsDisplay={btsFpsDisplay} />

          {/* Stats */}
          <DevPanel.Stats>
            <DevPanel.Stat label="frame" value={`${frameIndex + 1}/${config.meta.totalFrames}`} />
            <DevPanel.Stat label="time" value={`${currentTime.toFixed(1)}s`} />
          </DevPanel.Stats>

          {/* Scale Stepper */}
          <DevPanel.Stepper
            label="scale"
            value={Math.round(scale * 100)}
            min={50}
            max={300}
            step={5}
            unit="%"
            onChange={(v) => setScale(v / 100)}
          />

          {/* Dancer Buttons */}
          <DevPanel.Actions>
            <DevPanel.Button
              label="Chika"
              active={dancerType === 'chika'}
              onPress={() => setDancerType('chika')}
            />
            <DevPanel.Button
              label="Makima"
              active={dancerType === 'makima'}
              onPress={() => setDancerType('makima')}
            />
          </DevPanel.Actions>

          {/* Play/Pause Button */}
          <DevPanel.Actions>
            <DevPanel.Button
              label={isPlaying ? 'Pause' : 'Play'}
              active={isPlaying}
              onPress={togglePlay}
            />
          </DevPanel.Actions>
        </DevPanel.Content>
      </view>
    </DevPanel.Root>
  )
}

root.render(<DancePage />)
