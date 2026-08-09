import { Navigate, useParams } from 'react-router-dom'

import { classroomDetailPath } from '../../routes'

export function ClassroomContentLegacyRedirect({ filter }: { filter: 'exam' | 'notice' }) {
  const { classroomId = '' } = useParams()
  return <Navigate replace to={`${classroomDetailPath(classroomId)}?week=all&filter=${filter}`} />
}
