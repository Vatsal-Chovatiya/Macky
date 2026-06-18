import { exec } from 'child_process'

export function getActiveBundleId(): Promise<string> {
  return new Promise((resolve) => {
    // Use a single-line AppleScript to avoid quoting issues with multi-line scripts in exec
    const script =
      'tell application "System Events" to get bundle identifier of first application process whose frontmost is true'

    exec(`osascript -e '${script}'`, (error, stdout, stderr) => {
      if (error) {
        console.warn(
          `Failed to get active bundle ID: ${error.message}`,
          stderr ? `stderr: ${stderr.trim()}` : ''
        )
        resolve('unknown')
      } else {
        resolve(stdout.trim())
      }
    })
  })
}
