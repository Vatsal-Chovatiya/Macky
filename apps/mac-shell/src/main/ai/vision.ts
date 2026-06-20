export async function askVisionLLM(prompt: string, screenshotBase64: string): Promise<string> {
  const apiKey = process.env.VISION_API_KEY

  if (!apiKey) {
    console.error(' VISION_API_KEY is missing in .env file')
    return 'Vision API key is not configured.'
  }

  const payload = {
    model: process.env.VISION_MODEL,
    messages: [
      {
        role: 'system',
        content:
          "You are a screen-aware AI assistant. Analyze the provided screenshot and answer the user's question concisely."
      },
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: prompt
          },
          {
            type: 'image_url',
            image_url: {
              url: `data:image/jpeg;base64,${screenshotBase64}`
            }
          }
        ]
      }
    ],
    max_tokens: 1024,
    temperature: 0.2
  }

  try {
    console.log('Sending request to NVIDIA Nemotron...')

    const response = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify(payload)
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error(` NVIDIA API Error (${response.status}):`, errorText)
      return `Vision API returned an error: ${response.status}`
    }

    const data = await response.json()

    const aiText = data.choices?.[0]?.message?.content || 'I could not analyze the screen.'
    console.log(' NVIDIA Response received.')

    return aiText
  } catch (error) {
    console.error(' Network error calling NVIDIA:', error)
    return 'I encountered a network error analyzing the screen.'
  }
}
