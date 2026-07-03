import { beforeEach, describe, expect, it } from 'vitest'
import { mockApi, resetMockData } from './mock'

describe('mock approval rules', () => {
  beforeEach(resetMockData)

  it('approves one application and rejects only truly overlapping applications', async () => {
    await mockApi.decideApplication('g1', 'a1', 'approve', 1)
    const group = (await mockApi.getApprovals())[0]
    expect(group.applications.find(item => item.id === 'a1')?.status).toBe('approved')
    expect(group.applications.find(item => item.id === 'a2')?.status).toBe('rejected')
    expect(group.applications.find(item => item.id === 'a3')?.status).toBe('pending')
  })

  it('rejects missing groups and applications', async () => {
    await expect(mockApi.decideApplication('missing', 'a1', 'approve', 1)).rejects.toThrow('审批分组不存在')
    await expect(mockApi.decideApplication('g1', 'missing', 'approve', 1)).rejects.toThrow('会议申请不存在')
  })

  it('enforces optimistic concurrency versions', async () => {
    await expect(mockApi.decideApplication('g1', 'a1', 'approve', 2)).rejects.toThrow('申请已被更新')
  })

  it('can reset data between scenarios', async () => {
    await mockApi.decideApplication('g1', 'a1', 'reject', 1)
    resetMockData()
    expect((await mockApi.getApprovals())[0].applications[0].status).toBe('pending')
  })
})
