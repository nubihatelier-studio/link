import { useNavigate } from 'react-router-dom'
import { t } from '@/i18n/es'
import { InfoScreen } from '@/components/shared/InfoScreen'

/** Catch-all for any URL that doesn't match a route at all (typo, stale link, etc.). */
export function NotFoundPage() {
  const navigate = useNavigate()
  return (
    <InfoScreen
      title={t.notFound.title}
      message={t.notFound.message}
      action={{ label: t.common.goHome, onClick: () => navigate('/') }}
    />
  )
}
