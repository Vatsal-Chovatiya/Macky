import { exec } from 'child_process'

export function getActiveBundleId(): Promise<string> {
  return new Promise((resolve) => {
    // AppleScript to get the bundle ID of the frontmost app
    const script = `
        tell application "System Events"
        get bundle identifier of first application process whose foremost is true
        end tell
        `

    exec(`osascript -e '${script}'`, (error, stdout) => {
      if (error) {
        resolve('unknown')
      } else {
        resolve(stdout.trim())
      }
    })
  })
}
