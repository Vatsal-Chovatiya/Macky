import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getActiveBundleId } from '../context'
import { exec } from 'child_process'

vi.mock('child_process', () => {
  return {
    exec: vi.fn()
  }
})

describe('getActiveBundleId', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('successfully retrieves and trims frontmost bundle identifier', async () => {
    const mockStdout = '  com.apple.finder\n'
    vi.mocked(exec).mockImplementation((_cmd, cb) => {
      ;(cb as any)(null, mockStdout, '')
      return {} as any
    })

    const bundleId = await getActiveBundleId()

    expect(exec).toHaveBeenCalledTimes(1)
    expect(exec).toHaveBeenCalledWith(
      expect.stringContaining(
        'bundle identifier of first application process whose foremost is true'
      ),
      expect.any(Function)
    )
    expect(bundleId).toBe('com.apple.finder')
  })

  it('returns "unknown" if osascript command returns an error', async () => {
    const mockError = new Error('osascript error')
    vi.mocked(exec).mockImplementation((_cmd, cb) => {
      ;(cb as any)(mockError, '', '')
      return {} as any
    })

    const bundleId = await getActiveBundleId()

    expect(exec).toHaveBeenCalledTimes(1)
    expect(bundleId).toBe('unknown')
  })
})
