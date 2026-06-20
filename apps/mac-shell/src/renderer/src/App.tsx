import { useEffect, useState, useRef, useCallback } from 'react'

function App() {
  const [status, setStatus] = useState('Idle. Hold Ctrl + Option')
  const [response, setResponse] = useState('')
  const [bundleId, setBundleId] = useState('')
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const streamRef = useRef<MediaStream | null>(null)

  // Wrap the stop handler in a ref so its stable across renders
  const handlePttStop = useCallback(async () => {
    setStatus('Processing parallel tasks...')

    const recorder = mediaRecorderRef.current
    if (!recorder || recorder.state === 'inactive') {
      console.warn('PTT stop: MediaRecorder was not recording')
      // Still send an empty buffer so the main process can handle it gracefully
      await window.electronAPI.processRequest(new ArrayBuffer(0))
      return
    }

    // Wait for the MediaRecorder to fully flush all chunks via the 'stop' event.
    const audioArrayBuffer = await new Promise<ArrayBuffer>((resolve) => {
      recorder.onstop = async () => {
        if (chunksRef.current.length === 0) {
          console.warn('PTT stop: No audio chunks recorded')
          resolve(new ArrayBuffer(0))
          return
        }
        const audioBlob = new Blob(chunksRef.current, { type: 'audio/webm' })
        const buffer = await audioBlob.arrayBuffer()
        resolve(buffer)
      }
      recorder.stop()
    })

    // Send audio to Main Process
    await window.electronAPI.processRequest(audioArrayBuffer)
  }, [])

  useEffect(() => {
    let isCleanedUp = false

    // Setup microphone
    navigator.mediaDevices
      .getUserMedia({ audio: true })
      .then((stream) => {
        if (isCleanedUp) {
          // If the effect was cleaned up before we got the stream, release it
          stream.getTracks().forEach((t) => t.stop())
          return
        }

        streamRef.current = stream
        const mediaRecorder = new MediaRecorder(stream)
        mediaRecorderRef.current = mediaRecorder

        mediaRecorder.ondataavailable = (e) => {
          if (e.data.size > 0) chunksRef.current.push(e.data)
        }
      })
      .catch((err) => {
        console.error('Failed to get microphone access:', err)
        setStatus(' Microphone access denied')
      })

    // IPC Listeners
    const removePttStart = window.electronAPI.onPttStart(() => {
      setStatus('🔴 Listening...')
      setResponse('')
      chunksRef.current = []
      mediaRecorderRef.current?.start()
    })

    const removePttStop = window.electronAPI.onPttStop(handlePttStop)

    const removeContextReady = window.electronAPI.onContextReady(({ bundleId: id }) => {
      setBundleId(id)
    })

    const removeAiResponse = window.electronAPI.onAiResponse((text) => {
      setResponse(text)
      setStatus('✅ Done!')
    })

    // Cleanup function — prevents listener leaks on HMR and React StrictMode
    return () => {
      isCleanedUp = true

      // Remove IPC listeners
      removePttStart?.()
      removePttStop?.()
      removeContextReady?.()
      removeAiResponse?.()

      // Stop microphone stream
      streamRef.current?.getTracks().forEach((t) => t.stop())
      streamRef.current = null
      mediaRecorderRef.current = null
    }
  }, [handlePttStop])

  return (
    <div
      style={{
        padding: '40px',
        fontFamily: 'system-ui',
        background: '#111',
        color: 'white',
        height: '100vh'
      }}
    >
      <h1>HeyClicky Mac Clone</h1>
      <h2 style={{ color: status.includes('🔴') ? '#ff4444' : '#44ff44' }}>{status}</h2>
      {bundleId && (
        <p>
          Detected Bundle ID: <strong>{bundleId}</strong>
        </p>
      )}
      {response && (
        <div
          style={{ marginTop: '20px', padding: '15px', background: '#222', borderRadius: '8px' }}
        >
          <h3>AI Response</h3>
          <p style={{ whiteSpace: 'pre-wrap' }}>{response}</p>
        </div>
      )}
    </div>
  )
}

export default App
