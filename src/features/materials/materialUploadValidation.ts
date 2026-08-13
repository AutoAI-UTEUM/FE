export const MAX_MATERIAL_UPLOAD_BYTES = 45 * 1024 * 1024
export const MAX_MATERIAL_TITLE_LENGTH = 255

export function validateMaterialTitle(title: string): string | null {
  const normalizedTitle = title.trim()

  if (!normalizedTitle) {
    return '자료 제목을 입력하세요.'
  }

  if (normalizedTitle.length > MAX_MATERIAL_TITLE_LENGTH) {
    return `자료 제목은 ${MAX_MATERIAL_TITLE_LENGTH}자 이하로 입력하세요.`
  }

  return null
}

export function validateMaterialUpload(file: File | null | undefined): string | null {
  if (!file) {
    return '업로드할 PDF 파일을 선택하세요.'
  }

  if (!isPdfFile(file)) {
    return 'PDF 파일만 업로드할 수 있습니다.'
  }

  if (file.size > MAX_MATERIAL_UPLOAD_BYTES) {
    return '45MB 이하의 PDF 파일만 업로드할 수 있습니다.'
  }

  return null
}

function isPdfFile(file: File): boolean {
  const hasPdfType = file.type === 'application/pdf'
  const hasPdfExtension = file.name.toLowerCase().endsWith('.pdf')

  return hasPdfType || hasPdfExtension
}
