export { getMaterialStatusLabel } from './materialStatus'
export { getMaterialFailureMessage } from './materialFailure'
export { RenameMaterialDialog } from './RenameMaterialDialog'
export {
  MAX_MATERIAL_UPLOAD_BYTES,
  MAX_MATERIAL_TITLE_LENGTH,
  validateMaterialUpload,
  validateMaterialTitle,
} from './materialUploadValidation'
export type {
  MaterialFailureReason,
  MaterialOverview,
  MaterialOverviewStatus,
  MaterialStatus,
  StudyMaterial,
} from './materialTypes'
export {
  createMaterialsRepository,
  type MaterialsRepository,
} from './materialsRepository'
