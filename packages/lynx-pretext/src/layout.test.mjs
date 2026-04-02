import { beforeEach, expect, test } from 'bun:test'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

let getTextInfoCalls = 0

beforeEach(() => {
  getTextInfoCalls = 0
  globalThis.lynx = {
    getTextInfo(text) {
      getTextInfoCalls += 1
      return { width: text.length * 8, content: [text] }
    },
  }
})

test('prepareWithSegments returns bidi metadata while measuring via lynx.getTextInfo', async () => {
  const { prepareWithSegments } = await import('./layout.ts')
  const prepared = prepareWithSegments('hello مرحبا', '16px Arial')

  expect(getTextInfoCalls).toBeGreaterThan(0)
  expect(prepared.segLevels).not.toBeNull()
})

test('package is publishable without a linked upstream pretext dependency', async () => {
  const here = path.dirname(fileURLToPath(import.meta.url))
  const packageJson = JSON.parse(await readFile(path.join(here, '..', 'package.json'), 'utf8'))
  const layoutSource = await readFile(path.join(here, 'layout.ts'), 'utf8')

  expect(packageJson.dependencies?.['@chenglou/pretext']).toBeUndefined()
  expect(layoutSource).not.toContain('@chenglou/pretext')
})
