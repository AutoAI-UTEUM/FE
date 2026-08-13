export type MaterialStatus = 'PROCESSING' | 'READY' | 'FAILED'
export type MaterialFailureReason =
  | 'UNSUPPORTED_FORMAT'
  | 'ENCRYPTED_PDF'
  | 'NO_TEXT_CONTENT'
  | 'FILE_TOO_LARGE'
  | 'EXTRACTION_FAILED'
  | 'PAGE_LIMIT_EXCEEDED'
  | 'SCHEDULING_FAILED'

export interface StudyMaterial {
  activeSessionId?: string
  createdAt: string
  failureReason?: MaterialFailureReason
  fileSizeBytes?: number
  id: string
  pageCount?: number
  status: MaterialStatus
  title: string
  traceId?: string
}
