import { afterEach, describe, expect, it, vi } from 'vitest'
import { HttpApiClient } from './client'

describe('HttpApiClient', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('sends expectedVersion with an approval decision', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }))
    vi.stubGlobal('fetch', fetchMock)
    const client = new HttpApiClient('/api')

    await client.decideApplication('g1', 'a1', 'approve', 7)

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/meeting-requests/a1/approve',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ expectedVersion: 7 }),
      }),
    )
  })
})
