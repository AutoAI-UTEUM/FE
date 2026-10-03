import { describe, expect, it } from 'vitest'

import {
  MAX_MATERIAL_UPLOAD_BYTES,
  MAX_MATERIAL_TITLE_LENGTH,
  validateMaterialTitle,
  validateMaterialUpload,
} from './materialUploadValidation'

describe('material title validation', () => {
  it('requires a trimmed title of at most 255 characters', () => {
    expect(validateMaterialTitle('   ')).toBe('자료 제목을 입력하세요.')
    expect(validateMaterialTitle('a'.repeat(MAX_MATERIAL_TITLE_LENGTH))).toBeNull()
    expect(validateMaterialTitle('a'.repeat(MAX_MATERIAL_TITLE_LENGTH + 1))).toBe(
      '자료 제목은 255자 이하로 입력하세요.',
    )
  })
})

describe('material upload validation', () => {
  it('rejects an empty PDF and accepts the exact 45MB boundary', () => {
    const emptyPdf = new File([], 'empty.pdf', { type: 'application/pdf' })
    const boundaryPdf = new File(['pdf'], 'boundary.pdf', { type: 'application/pdf' })
    Object.defineProperty(boundaryPdf, 'size', { value: MAX_MATERIAL_UPLOAD_BYTES })

    expect(validateMaterialUpload(emptyPdf)).toBe('빈 PDF 파일은 업로드할 수 없습니다.')
    expect(validateMaterialUpload(boundaryPdf)).toBeNull()
  })
})
