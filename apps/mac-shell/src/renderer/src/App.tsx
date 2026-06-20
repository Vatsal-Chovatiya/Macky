import { useEffect, useState, useRef } from 'react'

function App() {
  const [status, setStatus] = useState('Idle. Hold Ctrl + Option')
  const [response, setResponse] = useState('')
  const [bundleId, setBundleId] = useState('')
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])

  useEffect(() => {
    // Setup microphone
    navigator.mediaDevices.getUserMedia({ audio: true }).then((stream) => { 
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder

      mediaRecorder.ondataavailable = (e) => { 
        if(e.data.size > 0) chunksRef.current.push(e.data)
      } 
    })

    window.electronAPI.onPttStart(() => {
      setStatus('🔴 Listening...')
      setResponse('')
      chunksRef.current = []
      mediaRecorderRef.current?.start()
    })
    
    window.electronAPI.onPttStop(async () => {
      setStatus('⏳ Processing parallel tasks...')
      mediaRecorderRef.current?.stop()
       
      // Wait a tiny bit for the last chunk to arrive
      await new Promise(r => setTimeout(r, 100)) 
      
      // Combine chunks into a single WebM audio blob
      const audioBlob = new Blob(chunksRef.current, { type: 'audio/webm' })
      
      // Convert Blob to ArrayBuffer to send over IPC
      const arrayBuffer = await audioBlob.arrayBuffer()
      
      // Send audio to Main Process
      await window.electronAPI.processRequest(arrayBuffer)
    })

      // 4. Listen for the AI response
    window.electronAPI.onAiResponse((_event, text) => {
      setResponse(text)
      setStatus('✅ Done!')
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