import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import type { ContainerWithBooking } from '@shared/types'
import VesselTrackingPanel from '../components/VesselTrackingPanel'
import { useGlobalLoading } from '../lib/loadingOverlay'

export default function VesselTrackingPage(): React.JSX.Element | null {
  const { t } = useTranslation()
  const [searchParams] = useSearchParams()
  const [containers, setContainers] = useState<ContainerWithBooking[]>([])
  const [loading, setLoading] = useState(true)
  useGlobalLoading(loading)

  useEffect(() => {
    async function refresh(): Promise<void> {
      setLoading(true)
      const data = await window.api.containers.listForTracking()
      setContainers(data)
      setLoading(false)
    }
    refresh()
  }, [])

  if (loading) {
    return null
  }

  const containerIdParam = searchParams.get('containerId')

  return (
    <div className="vessel-tracking-page">
      <div className="page-title">
        <h1>{t('nav.vesselTracking')}</h1>
      </div>

      <VesselTrackingPanel
        containers={containers}
        groupByBooking
        initialContainerId={containerIdParam ? Number(containerIdParam) : null}
        mapHeight="100%"
      />
    </div>
  )
}
