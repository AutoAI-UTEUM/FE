import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { afterEach, describe, expect, it } from 'vitest'

import { ClassroomContentLegacyRedirect } from './ClassroomContentLegacyRedirect'

afterEach(cleanup)

describe('ClassroomContentLegacyRedirect', () => {
  it.each([
    ['announcements', 'notice'],
    ['exams', 'exam'],
  ] as const)('redirects the legacy %s list to the classroom hub', async (path, filter) => {
    render(<MemoryRouter initialEntries={[`/classrooms/12/${path}`]}><Routes><Route element={<ClassroomContentLegacyRedirect filter={filter} />} path={`/classrooms/:classroomId/${path}`} /><Route element={<LocationProbe />} path="/classrooms/:classroomId" /></Routes></MemoryRouter>)

    expect(await screen.findByTestId('location')).toHaveTextContent(`/classrooms/12?week=all&filter=${filter}`)
  })
})

function LocationProbe() {
  const location = useLocation()
  return <p data-testid="location">{location.pathname}{location.search}</p>
}
