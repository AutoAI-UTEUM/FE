import { describe, expect, it } from 'vitest'

import {
  getDefaultMaterialTitle,
  MAX_MATERIAL_TITLE_LENGTH,
  validateMaterialTitle,
} from './materialUploadValidation'

describe('material title validation', () => {
  it('removes only the final PDF extension', () => {
    expect(getDefaultMaterialTitle('lecture.pdf')).toBe('lecture')
    expect(getDefaultMaterialTitle('LECTURE.PDF')).toBe('LECTURE')
    expect(getDefaultMaterialTitle('lecture.pdf.backup')).toBe('lecture.pdf.backup')
  })

  it('requires a trimmed title of at most 255 characters', () => {
    expect(validateMaterialTitle('   ')).toBe('자료 제목을 입력하세요.')
    expect(validateMaterialTitle('a'.repeat(MAX_MATERIAL_TITLE_LENGTH))).toBeNull()
    expect(validateMaterialTitle('a'.repeat(MAX_MATERIAL_TITLE_LENGTH + 1))).toBe(
      '자료 제목은 255자 이하로 입력하세요.',
    )
  })
})
