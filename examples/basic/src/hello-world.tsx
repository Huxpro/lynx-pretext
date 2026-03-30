import { useEffect } from '@lynx-js/react'

export function HelloWorld() {
  useEffect(() => {
    console.info('lynx-pretext: hello world')
  }, [])

  return (
    <view style={{ padding: '20px' }}>
      <text style={{ fontSize: '24px', fontWeight: 'bold', color: '#333' }}>
        lynx-pretext
      </text>
      <text style={{ fontSize: '16px', color: '#666', marginTop: '8px' }}>
        Text measurement and layout library for Lynx
      </text>
    </view>
  )
}
