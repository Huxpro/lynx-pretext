import { useEffect } from '@lynx-js/react'

export function HelloWorld() {
  useEffect(() => {
    console.info('lynx-pretext: hello world')
  }, [])

  return (
    <view style={{ padding: 20 }}>
      <text style={{ fontSize: 24, fontWeight: 'bold', color: '#333' }}>
        lynx-pretext
      </text>
      <text style={{ fontSize: 16, color: '#666', marginTop: 8 }}>
        Text measurement and layout library for Lynx
      </text>
    </view>
  )
}
