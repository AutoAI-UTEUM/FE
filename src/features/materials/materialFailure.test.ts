import { describe, expect, it } from 'vitest'

import { getMaterialFailureMessage } from './materialFailure'
import type { MaterialFailureReason } from './materialTypes'

describe('getMaterialFailureMessage', () => {
  it.each<[MaterialFailureReason, string]>([
    [
      'UNSUPPORTED_FORMAT',
      'PDF 파일이 아니거나 손상된 파일입니다. 정상 PDF로 다시 업로드해 주세요.',
    ],
    [
      'ENCRYPTED_PDF',
      '암호가 걸린 PDF입니다. 암호를 해제한 뒤 다시 업로드해 주세요.',
    ],
    [
      'NO_TEXT_CONTENT',
      '텍스트를 추출할 수 없는 파일입니다(스캔 이미지 등). 텍스트가 포함된 PDF를 업로드해 주세요.',
    ],
    ['FILE_TOO_LARGE', '파일 용량이 허용 한도를 초과했습니다.'],
    [
      'PAGE_LIMIT_EXCEEDED',
      '페이지 수가 허용 한도(300페이지)를 초과했습니다.',
    ],
    [
      'EXTRACTION_FAILED',
      '자료 처리 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.',
    ],
    [
      'SCHEDULING_FAILED',
      '자료 처리 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.',
    ],
  ])('%s 코드를 사용자 안내 문구로 변환한다', (reason, message) => {
    expect(getMaterialFailureMessage(reason)).toBe(message)
  })

  it('원인이 없거나 알 수 없는 값이면 일반 안내를 표시한다', () => {
    const fallback =
      '파일 업로드는 완료됐지만 PDF 분석에 실패했습니다. 잠시 후 다시 시도해 주세요.'

    expect(getMaterialFailureMessage()).toBe(fallback)
    expect(
      getMaterialFailureMessage('UNKNOWN_REASON' as MaterialFailureReason),
    ).toBe(fallback)
  })
})
