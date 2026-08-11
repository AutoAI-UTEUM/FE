import type { MaterialFailureReason } from './materialTypes'

const FAILURE_MESSAGES: Record<MaterialFailureReason, string> = {
  EXTRACTION_FAILED: 'PDF 내용을 분석하지 못했습니다.',
  PAGE_LIMIT_EXCEEDED: 'PDF가 최대 300페이지를 초과했습니다.',
  SCHEDULING_FAILED: '서버 처리 작업을 시작하지 못했습니다.',
}

export function getMaterialFailureMessage(reason?: MaterialFailureReason): string {
  return reason
    ? (FAILURE_MESSAGES[reason] ?? reason)
    : '파일 업로드는 완료됐지만 PDF 분석에 실패했습니다.'
}
