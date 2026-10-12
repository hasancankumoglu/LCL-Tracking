import { useEffect, useState } from 'react'

interface Props {
  vesselName?: string | null
  imoNumber?: string | null
  mmsiNumber?: string | null
  /** İframe/boş durum kutusunun yüksekliği (CSS değeri). Varsayılan 380px. */
  height?: string | number
}

const NUMERIC_ID = /^\d+$/

/**
 * MarineTraffic's embed only resolves a position when given `mmsi`; `imo:`
 * alone does not render a ship. This is a genuine cross-origin navigation
 * (a real `https://www.marinetraffic.com` page), not `srcDoc`, so it does
 * not inherit this app's CSP and runs under its own origin — VesselFinder's
 * null-origin CORS problem (its script executing in an opaque `srcDoc`
 * origin, rejected by their API's CORS policy) does not apply here.
 */
function buildMarineTrafficUrl(mmsi: string): string {
  return `https://www.marinetraffic.com/en/ais/embed/zoom:11/mmsi:${mmsi}/shipid:0/shownames:false/fleet:/fleet_hide_old_positions:false`
}

export default function VesselTrackingSection({
  vesselName,
  imoNumber,
  mmsiNumber,
  height = 380
}: Props): React.JSX.Element {
  const [online, setOnline] = useState(navigator.onLine)

  useEffect(() => {
    function handleOnline(): void {
      setOnline(true)
    }
    function handleOffline(): void {
      setOnline(false)
    }
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  const imo = imoNumber && NUMERIC_ID.test(imoNumber) ? imoNumber : ''
  const mmsi = mmsiNumber && NUMERIC_ID.test(mmsiNumber) ? mmsiNumber : ''
  const trimmedName = vesselName?.trim()

  // MarineTraffic's embed needs an MMSI; without one, fall back to an
  // external link (opens in the default browser, no CORS/CSP concerns there).
  if (!mmsi) {
    if (!imo && !trimmedName) {
      return (
        <div className="empty-state">
          Bu booking için IMO/MMSI numarası girilmedi. Gemi konumunu görüntülemek için booking
          kaydına IMO, MMSI veya gemi adı ekleyin.
        </div>
      )
    }
    const searchUrl = imo
      ? `https://www.vesselfinder.com/vessels/details/${imo}`
      : `https://www.vesselfinder.com/vessels?name=${encodeURIComponent(trimmedName as string)}`
    const label = imo ? `IMO ${imo}` : `"${trimmedName}"`
    return (
      <div className="empty-state">
        Haritada canlı takip için MMSI numarası gerekiyor. {label} için VesselFinder&apos;da
        arayabilirsiniz.
        <div style={{ marginTop: 8 }}>
          <a href={searchUrl} target="_blank" rel="noopener noreferrer">
            {label} için VesselFinder&apos;da ara
          </a>
        </div>
      </div>
    )
  }

  if (!online) {
    return (
      <div className="empty-state">
        Gemi konumunu görüntülemek için internet bağlantısı gerekli.
      </div>
    )
  }

  return (
    <iframe
      key={mmsi}
      title={vesselName ? `Gemi Takip - ${vesselName}` : 'Gemi Takip'}
      sandbox="allow-scripts allow-same-origin allow-popups"
      style={{ width: '100%', height, border: 'none', borderRadius: 8 }}
      src={buildMarineTrafficUrl(mmsi)}
    />
  )
}
