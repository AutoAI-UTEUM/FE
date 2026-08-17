import type { PagedResponse } from '../../shared/api'
import type { AuthenticatedRequest } from '../auth'

export type ReportGenerationStatus = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED'
export type ReportCriterionStatus = 'ASSESSED' | 'INSUFFICIENT_DATA'
export type ReportScope =
  | { type: 'FULL' }
  | { type: 'WEEK'; weekNumber: number }

export interface ReportStudent {
  affiliation?: string
  email: string
  id: string
  name: string
}

export interface ReportEvidence {
  evidenceId: string
  fact?: string
  label: string
  metrics?: ReportEvidenceMetric[]
  occurredAt: string
  sourceType: string
}

export interface ReportEvidenceMetric {
  label: string
  value: string
}

export interface ReportCriterionResult {
  criterionKey: string
  criterionName: string
  evidenceIds: string[]
  narrative: string
  score: number | null
  status: ReportCriterionStatus
  trend?: string | null
}

export interface StudentReport {
  classroomId: string
  createdAt?: string
  criterionResults: ReportCriterionResult[]
  evidence: ReportEvidence[]
  failureMessage?: string
  generationId?: string
  improvements: ReportStatement[]
  misconceptionCandidates: ReportStatement[]
  overallScore: number | null
  overview?: string
  pollAfterSeconds?: number
  recommendedActions: ReportStatement[]
  reportId: string
  sourceDataAsOf?: string
  stage?: string | null
  stale?: boolean
  status: ReportGenerationStatus
  strengths: ReportStatement[]
  studentId: string
  studentName?: string
  trend?: string | null
  version?: number
}

export interface ReportStatement {
  content: string
  evidenceIds: string[]
}

export interface ReportCriterion {
  active: boolean
  builtin: boolean
  description: string
  id: string | null
  key: string
  minimumEvidence: number
  name: string
  rubric: string
  sourceTypes: string[]
  version: string
  weight: number
}

export interface CreateReportInput {
  requestId: string
  scope: ReportScope
}

export interface SaveReportCriterionInput {
  active?: boolean
  description: string
  key: string
  minimumEvidence: number
  name: string
  rubric: string
  sourceTypes: string[]
  weight: number
}

interface ReportStudentDto {
  affiliation?: string
  email: string
  name: string
  studentId: number | string
}

interface ReportEvidenceDto {
  evidenceId: string
  fact?: string
  label?: string
  metrics?: ReportEvidenceMetric[]
  occurredAt: string
  publicLabel?: string
  sourceType: string
}

interface ReportCriterionResultDto extends Omit<ReportCriterionResult, 'criterionName'> {
  criterionName?: string
  criterionVersion?: string
}

interface ReportDto extends Omit<Partial<StudentReport>, 'classroomId' | 'evidence' | 'reportId' | 'status' | 'studentId'> {
  classroomId?: number | string
  criteria?: ReportCriterionResultDto[]
  criterionResults?: ReportCriterionResult[]
  evidence?: ReportEvidenceDto[]
  failureCode?: string
  overallStage?: string | null
  reportId: string
  status: ReportGenerationStatus
  studentId?: number | string
  summary?: {
    improvements?: ReportStatement[]
    misconceptionCandidates?: ReportStatement[]
    overview?: string
    recommendedActions?: ReportStatement[]
    strengths?: ReportStatement[]
  }
}

interface CompletedReportDto {
  createdAt?: string
  overallScore?: number | null
  overallStage?: string | null
  reportId: string
  version?: number
}

interface ReportListDto {
  activeGeneration?: ReportDto | null
  items: CompletedReportDto[]
}

interface ReportCriterionDto {
  active?: boolean
  allowedSources?: string[]
  builtin?: boolean
  criterionId?: number | string | null
  criterionKey: string
  description?: string
  minEvidence?: number
  name: string
  rubric?: Record<string, unknown>
  version?: string
  weight?: number
}

export function createReportsRepository(request: AuthenticatedRequest) {
  return {
    async listStudents(classroomId: string, signal?: AbortSignal) {
      const { data } = await request<PagedResponse<ReportStudentDto>>(
        `/api/classrooms/${encodeURIComponent(classroomId)}/students?page=0&size=100`,
        { signal },
      )
      return data.items.map(mapStudent)
    },
    async createReport(classroomId: string, studentId: string, input: CreateReportInput) {
      const { data } = await request<ReportDto>(
        `/api/classrooms/${encodeURIComponent(classroomId)}/students/${encodeURIComponent(studentId)}/reports`,
        {
          body: {
            requestId: input.requestId,
            scope: input.scope.type,
            weekNumber: input.scope.type === 'WEEK' ? input.scope.weekNumber : undefined,
          },
          method: 'POST',
        },
      )
      return mapReport(data, { classroomId, studentId })
    },
    async listReports(classroomId: string, studentId: string, signal?: AbortSignal) {
      const { data } = await request<ReportListDto>(
        `/api/classrooms/${encodeURIComponent(classroomId)}/students/${encodeURIComponent(studentId)}/reports`,
        { signal },
      )
      return {
        activeGeneration: data.activeGeneration
          ? mapReport(data.activeGeneration, { classroomId, studentId })
          : null,
        items: data.items.map((item) => mapReport({ ...item, status: 'COMPLETED' }, { classroomId, studentId })),
      }
    },
    async getReport(reportId: string, signal?: AbortSignal) {
      const { data } = await request<ReportDto>(`/api/reports/${encodeURIComponent(reportId)}`, { signal })
      return mapReport(data)
    },
    async listCriteria(classroomId: string, signal?: AbortSignal) {
      const { data } = await request<{ items: ReportCriterionDto[] }>(
        `/api/classrooms/${encodeURIComponent(classroomId)}/report-criteria`,
        { signal },
      )
      return data.items.map(mapCriterion)
    },
    async createCriterion(classroomId: string, input: SaveReportCriterionInput) {
      const { data } = await request<ReportCriterionDto>(
        `/api/classrooms/${encodeURIComponent(classroomId)}/report-criteria`,
        { body: mapCriterionInput(input), method: 'POST' },
      )
      return mapCriterion(data)
    },
    async updateCriterion(classroomId: string, criterionId: string, input: Partial<SaveReportCriterionInput>) {
      const { data } = await request<ReportCriterionDto>(
        `/api/classrooms/${encodeURIComponent(classroomId)}/report-criteria/${encodeURIComponent(criterionId)}`,
        { body: mapCriterionInput(input), method: 'PATCH' },
      )
      return mapCriterion(data)
    },
  }
}

function mapStudent(value: ReportStudentDto): ReportStudent {
  return { ...value, id: String(value.studentId) }
}

function mapReport(
  value: ReportDto,
  fallback: { classroomId?: string; studentId?: string } = {},
): StudentReport {
  const summary = value.summary
  const criterionResults = value.criterionResults ?? value.criteria ?? []
  return {
    ...value,
    classroomId: value.classroomId === undefined ? fallback.classroomId ?? '' : String(value.classroomId),
    criterionResults: criterionResults.map((item) => ({
      ...item,
      criterionName: item.criterionName ?? item.criterionKey,
      evidenceIds: item.evidenceIds ?? [],
    })),
    evidence: (value.evidence ?? []).map((item) => ({
      ...item,
      label: item.label ?? item.publicLabel ?? item.sourceType,
    })),
    failureMessage: value.failureMessage ?? value.failureCode,
    improvements: mapStatements(value.improvements ?? summary?.improvements),
    misconceptionCandidates: mapStatements(value.misconceptionCandidates ?? summary?.misconceptionCandidates),
    overallScore: value.overallScore ?? null,
    overview: value.overview ?? summary?.overview,
    recommendedActions: mapStatements(value.recommendedActions ?? summary?.recommendedActions),
    reportId: String(value.reportId),
    stage: value.stage ?? value.overallStage,
    strengths: mapStatements(value.strengths ?? summary?.strengths),
    studentId: value.studentId === undefined ? fallback.studentId ?? '' : String(value.studentId),
  }
}

function mapCriterion(value: ReportCriterionDto): ReportCriterion {
  return {
    active: value.active ?? true,
    builtin: value.builtin ?? false,
    description: value.description ?? '',
    id: value.criterionId === null || value.criterionId === undefined ? null : String(value.criterionId),
    key: value.criterionKey,
    minimumEvidence: value.minEvidence ?? 1,
    name: value.name,
    rubric: typeof value.rubric?.summary === 'string' ? value.rubric.summary : JSON.stringify(value.rubric ?? {}),
    sourceTypes: value.allowedSources ?? [],
    version: value.version ?? '',
    weight: value.weight ?? 1,
  }
}

function mapCriterionInput(input: Partial<SaveReportCriterionInput>) {
  return {
    active: input.active,
    allowedSources: input.sourceTypes,
    criterionKey: input.key,
    description: input.description,
    minEvidence: input.minimumEvidence,
    name: input.name,
    rubric: input.rubric === undefined ? undefined : { summary: input.rubric },
    weight: input.weight,
  }
}

function mapStatements(values?: ReportStatement[]): ReportStatement[] {
  return (values ?? []).map((item) => typeof item === 'string'
    ? { content: item, evidenceIds: [] }
    : { ...item, evidenceIds: item.evidenceIds ?? [] })
}
