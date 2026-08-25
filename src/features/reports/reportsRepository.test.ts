import { describe, expect, it, vi } from 'vitest'

import type { AuthenticatedRequest } from '../auth'
import { createReportsRepository } from './reportsRepository'

describe('reports repository', () => {
  it('sends the instructor report scope and fills context omitted by the 202 response', async () => {
    const request = vi.fn().mockResolvedValue({
      data: {
        generationId: 'generation-1',
        pollAfterSeconds: 4,
        reportId: 'report-1',
        status: 'PENDING',
      },
    })
    const repository = createReportsRepository(request as AuthenticatedRequest)

    await expect(repository.createReport('12', '31', {
      requestId: 'request-1',
      scope: { type: 'WEEK', weekNumber: 2 },
    })).resolves.toEqual(expect.objectContaining({
      classroomId: '12',
      criterionResults: [],
      overallScore: null,
      reportId: 'report-1',
      status: 'PENDING',
      studentId: '31',
    }))

    expect(request).toHaveBeenCalledWith('/api/classrooms/12/students/31/reports', {
      body: {
        requestId: 'request-1',
        scope: 'WEEK',
        weekNumber: 2,
      },
      method: 'POST',
    })
  })

  it('maps the deployed completed-report contract without turning null scores into zero', async () => {
    const request = vi.fn().mockResolvedValue({
      data: {
        classroomId: 12,
        criteria: [{
          criterionKey: 'quiz_accuracy',
          evidenceIds: [],
          narrative: '평가할 문항이 충분하지 않습니다.',
          score: null,
          status: 'INSUFFICIENT_DATA',
          trend: 'STABLE',
        }],
        evidence: [{
          evidenceId: 'e-1',
          metrics: [{ label: '시도 회차', value: '3회' }],
          occurredAt: '2026-08-04T00:00:00Z',
          publicLabel: '퀴즈 3회',
          sourceType: 'QUIZ_SUBMISSION',
        }],
        overallScore: null,
        overallStage: '보완 필요',
        reportId: 'report-2',
        status: 'COMPLETED',
        studentId: 31,
        trend: 'DECLINING',
      },
    })
    const repository = createReportsRepository(request as AuthenticatedRequest)

    const report = await repository.getReport('report-2')

    expect(report.overallScore).toBeNull()
    expect(report.criterionResults[0]?.score).toBeNull()
    expect(report.criterionResults[0]?.criterionName).toBe('quiz_accuracy')
    expect(report.evidence[0]).toEqual(expect.objectContaining({
      label: '퀴즈 3회',
      metrics: [{ label: '시도 회차', value: '3회' }],
    }))
    expect(report.evidence[0]).not.toHaveProperty('fact')
    expect(report.stage).toBe('보완 필요')
    expect(report.trend).toBe('DECLINING')
    expect(request).toHaveBeenCalledWith('/api/reports/report-2', { signal: undefined })
  })

  it('maps completed versions and restores an active generation from the list response', async () => {
    const request = vi.fn().mockResolvedValue({
      data: {
        activeGeneration: { pollAfterSeconds: 5, reportId: 'report-active', status: 'PROCESSING' },
        items: [{ createdAt: '2026-08-04T00:00:00Z', overallScore: 82, overallStage: '양호', reportId: 'report-1', version: 1 }],
      },
    })
    const repository = createReportsRepository(request as AuthenticatedRequest)

    await expect(repository.listReports('12', '31')).resolves.toEqual({
      activeGeneration: expect.objectContaining({ reportId: 'report-active', status: 'PROCESSING' }),
      items: [expect.objectContaining({ reportId: 'report-1', stage: '양호', status: 'COMPLETED' })],
    })
    expect(request).toHaveBeenCalledWith('/api/classrooms/12/students/31/reports', { signal: undefined })
  })

  it('maps report criteria field names in both directions', async () => {
    const request = vi.fn()
      .mockResolvedValueOnce({ data: { items: [{ active: true, allowedSources: ['SESSION'], builtin: true, criterionId: null, criterionKey: 'engagement', description: '참여도', minEvidence: 2, name: '학습 참여', rubric: { summary: '활동을 평가' }, version: 'v1', weight: 1 }] } })
      .mockResolvedValueOnce({ data: { active: true, allowedSources: ['SESSION'], builtin: false, criterionId: 10, criterionKey: 'weekly', description: '주간', minEvidence: 2, name: '주간 학습', rubric: { summary: '일관성을 평가' }, version: 'v1', weight: 1 } })
    const repository = createReportsRepository(request as AuthenticatedRequest)

    await expect(repository.listCriteria('12')).resolves.toEqual([
      expect.objectContaining({ builtin: true, id: null, key: 'engagement', minimumEvidence: 2, sourceTypes: ['SESSION'] }),
    ])
    await repository.createCriterion('12', { description: '주간', key: 'weekly', minimumEvidence: 2, name: '주간 학습', rubric: '일관성을 평가', sourceTypes: ['SESSION'], weight: 1 })

    expect(request).toHaveBeenNthCalledWith(1, '/api/classrooms/12/report-criteria', { signal: undefined })
    expect(request).toHaveBeenNthCalledWith(2, '/api/classrooms/12/report-criteria', {
      body: {
        active: undefined,
        allowedSources: ['SESSION'],
        criterionKey: 'weekly',
        description: '주간',
        minEvidence: 2,
        name: '주간 학습',
        rubric: { summary: '일관성을 평가' },
        weight: 1,
      },
      method: 'POST',
    })
  })

  it('starts report criteria generation and reads its status', async () => {
    const request = vi.fn()
      .mockResolvedValueOnce({ data: null })
      .mockResolvedValueOnce({
        data: {
          message: '강의별 평가 지표를 생성하고 있습니다.',
          registeredCount: 0,
          status: 'RUNNING',
        },
      })
    const repository = createReportsRepository(request as AuthenticatedRequest)

    await repository.generateCriteria('12')
    await expect(repository.getCriteriaGeneration('12')).resolves.toEqual({
      message: '강의별 평가 지표를 생성하고 있습니다.',
      registeredCount: 0,
      status: 'RUNNING',
    })

    expect(request).toHaveBeenNthCalledWith(
      1,
      '/api/classrooms/12/report-criteria/generate',
      { method: 'POST' },
    )
    expect(request).toHaveBeenNthCalledWith(
      2,
      '/api/classrooms/12/report-criteria/generation',
      { signal: undefined },
    )
  })
})
