import Groq, { toFile } from 'groq-sdk'

let groq: Groq | null = null

function getGroqClient(): Groq {
  if (!groq) {
    groq = new Groq({ apiKey: process.env.GROQ_API_KEY })
  }
  return groq
}

export async function transcribeAudio(audioBuffer: Buffer): Promise<string> {
  // Guard: don't send empty audio to the API (causes 400 "file is empty")
  if (!audioBuffer || audioBuffer.length === 0) {
    console.warn('STT skipped: audio buffer is empty (no speech recorded)')
    return ''
  }

  try {
    const client = getGroqClient()
    const transcription = await client.audio.transcriptions.create({
      file: await toFile(audioBuffer, 'audio.webm'),
      model: 'whisper-large-v3-turbo',
      response_format: 'text'
    })

    // Groq sometimes returns an object or string depending on response_format
    return typeof transcription === 'string' ? transcription : transcription.text
  } catch (error) {
    console.error('STT Error:', error)
    return ''
  }
}
