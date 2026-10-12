import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import type { ContainerWithBooking } from '@shared/types'
import VesselTrackingPanel from '../components/VesselTrackingPanel'

export default function VesselTrackingPage(): React.JSX.Element {
  const [searchParams] = useSearchParams()
  const [containers, setContainers] = useState<ContainerWithBooking[]>([])
  const [loading, setLoading] = useState(true)

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
    return <div className="empty-state">Yükleniyor...</div>
  }

  const containerIdParam = searchParams.get('containerId')

  return (
    <div className="vessel-tracking-page">
      <div className="page-title">
        <h1>Gemi Takip</h1>
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
