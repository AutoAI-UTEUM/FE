export { getMaterialStatusLabel } from './materialStatus'
export { getMaterialFailureMessage } from './materialFailure'
export {
  MAX_MATERIAL_UPLOAD_BYTES,
  validateMaterialUpload,
} from './materialUploadValidation'
export type { MaterialFailureReason, MaterialStatus, StudyMaterial } from './materialTypes'
export {
  createMaterialsRepository,
  type MaterialsRepository,
} from './materialsRepository'
