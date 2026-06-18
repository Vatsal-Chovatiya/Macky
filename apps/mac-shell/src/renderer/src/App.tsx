import { useEffect, useState } from 'react'

function App() {
  const [status, setStatus] = useState('Idle. Hold Ctrl + Option')
  const [bundleId, setBundleId] = useState('')

  useEffect(() => {
    window.electronAPI.onPttStart(() => setStatus('🔴 Listening...'))
    
    window.electronAPI.onPttStop(async () => {
      setStatus('⏳ Processing parallel tasks...')
      await window.electronAPI.processRequest()
    })

    // Listen for the Main process to finish the parallel tasks
    window.electronAPI.onContextReady((data) => {
      setBundleId(data.bundleId)
      setStatus(`✅ Done! Active App: ${data.bundleId}`)
      console.log('Received Screenshot Base64 length:', data.screenshot.length)
    })
  }, [])

  return (
    <div style={{ padding: '40px', fontFamily: 'system-ui', background: '#111', color: 'white', height: '100vh' }}>
      <h1>HeyClicky Mac Clone</h1>
      <h2 style={{ color: status.includes('🔴') ? '#ff4444' : '#44ff44' }}>{status}</h2>
      {bundleId && <p>Detected Bundle ID: <strong>{bundleId}</strong></p>}
    </div>
  )
}

export default App