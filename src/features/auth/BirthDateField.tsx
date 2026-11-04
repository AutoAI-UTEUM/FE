import { TextInput } from '../../shared/ui'
import { getSeoulToday } from './dateOfBirth'

export function BirthDateField({ value, onChange, error }: {
  value: string
  onChange: (value: string) => void
  error?: string
}) {
  return (
    <TextInput
      autoComplete="bday"
      description="가입 연령 확인에 사용합니다."
      error={error}
      id="signup-date-of-birth"
      label="생년월일"
      max={getSeoulToday()}
      min="0001-01-01"
      onChange={(event) => onChange(event.target.value)}
      required
      type="date"
      value={value}
    />
  )
}
