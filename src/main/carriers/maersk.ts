import { getCarrierCredentials } from './config'
import { getMaerskAccessToken } from './maerskAuth'
import { mt } from '../i18n/language'
import type {
  CarrierBookingSnapshot,
  CarrierLookupResult,
  CarrierReferenceType
} from '../../shared/types'

// Kaynak: https://developer.maersk.com/catalogue/Track%20and%20Trace%20Plus (DCSA Track & Trace
// Events v2.2 standardına göre, Production Environment).
const EVENTS_URL = 'https://api.maersk.com/track-and-trace-private/events'

/**
 * DCSA v2.2 Track & Trace event'i - resmi şema tamamı yerine, bu entegrasyonun
 * ihtiyaç duyduğu alanlar için gevşek/tolerant bir şekil. Gerçek örnek response
 * görüldükten sonra kesinleştirilmesi gerekir (bkz. proje notları).
 */
interface DcsaLocation {
  locationName?: string
  UNLocationCode?: string
}

interface DcsaVessel {
  vesselIMONumber?: string
  vesselName?: string
}

interface DcsaTransportCall {
  location?: DcsaLocation
  vessel?: DcsaVessel
}

interface DcsaEvent {
  eventType?: 'SHIPMENT' | 'TRANSPORT' | 'EQUIPMENT'
  eventDateTime?: string
  eventClassifierCode?: 'PLN' | 'EST' | 'ACT'
  transportDocumentReference?: string
  carrierBookingReference?: string
  shipmentEventTypeCode?: string
  documentTypeCode?: string
  transportEventTypeCode?: 'ARRI' | 'DEPA' | string
  transportCall?: DcsaTransportCall
  equipmentEventTypeCode?: string
  equipmentReference?: string
  ISOEquipmentCode?: string
}

function buildQueryParam(referenceType: CarrierReferenceType, value: string): string {
  switch (referenceType) {
    case 'BL':
      return `transportDocumentReference=${encodeURIComponent(value)}`
    case 'BOOKING':
      return `carrierBookingReference=${encodeURIComponent(value)}`
    case 'CONTAINER':
      return `equipmentReference=${encodeURIComponent(value)}`
  }
}

function mapEventsToSnapshot(events: DcsaEvent[]): CarrierBookingSnapshot {
  const transportEvents = events.filter((e) => e.eventType === 'TRANSPORT' && e.eventDateTime)
  const equipmentEvents = events.filter((e) => e.eventType === 'EQUIPMENT')
  const shipmentEvents = events.filter((e) => e.eventType === 'SHIPMENT' && e.eventDateTime)

  const departures = transportEvents
    .filter((e) => e.transportEventTypeCode === 'DEPA')
    .sort((a, b) => (a.eventDateTime! < b.eventDateTime! ? -1 : 1))
  const arrivals = transportEvents
    .filter((e) => e.transportEventTypeCode === 'ARRI')
    .sort((a, b) => (a.eventDateTime! < b.eventDateTime! ? 1 : -1))

  const etdEvent = departures[0]
  const etaEvent = arrivals[0]

  const vesselEvent = [...transportEvents]
    .sort((a, b) => (a.eventDateTime! < b.eventDateTime! ? 1 : -1))
    .find((e) => e.transportCall?.vessel?.vesselName)

  const latestShipmentEvent = [...shipmentEvents].sort((a, b) =>
    a.eventDateTime! < b.eventDateTime! ? 1 : -1
  )[0]

  const containerNos = new Set<string>()
  const containers: CarrierBookingSnapshot['containers'] = []
  for (const e of equipmentEvents) {
    if (!e.equipmentReference || containerNos.has(e.equipmentReference)) continue
    containerNos.add(e.equipmentReference)
    containers.push({
      containerNo: e.equipmentReference,
      equipmentTypeCode: e.ISOEquipmentCode ?? null
    })
  }

  const blNumber = events.find((e) => e.transportDocumentReference)?.transportDocumentReference
  const bookingReference = events.find((e) => e.carrierBookingReference)?.carrierBookingReference

  return {
    carrier: 'MAERSK',
    source: 'official',
    bookingReference: bookingReference ?? null,
    blNumber: blNumber ?? null,
    vesselName: vesselEvent?.transportCall?.vessel?.vesselName ?? null,
    imoNumber: vesselEvent?.transportCall?.vessel?.vesselIMONumber ?? null,
    pol: etdEvent?.transportCall?.location?.locationName ?? null,
    destination: etaEvent?.transportCall?.location?.locationName ?? null,
    eta: etaEvent?.eventDateTime ?? null,
    etd: etdEvent?.eventDateTime ?? null,
    // Bu event akışında free time/demurrage için dokümante edilmiş bir alan yok;
    // gerçek response örneği gelene kadar boş bırakılıyor.
    freeTimeEnd: null,
    blStatus: latestShipmentEvent
      ? [latestShipmentEvent.shipmentEventTypeCode, latestShipmentEvent.documentTypeCode]
          .filter(Boolean)
          .join(' / ')
      : null,
    containers,
    rawEventCount: events.length
  }
}

export async function lookupMaerskBooking(
  referenceType: CarrierReferenceType,
  value: string
): Promise<CarrierLookupResult> {
  if (!getCarrierCredentials('MAERSK')) {
    return { status: 'not_configured' }
  }

  let accessToken: string
  try {
    accessToken = await getMaerskAccessToken()
  } catch (err) {
    return { status: 'error', message: err instanceof Error ? err.message : String(err) }
  }

  const credentials = getCarrierCredentials('MAERSK')!
  const url = `${EVENTS_URL}?${buildQueryParam(referenceType, value)}`

  let response: Response
  try {
    response = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Consumer-Key': credentials.consumerKey
      }
    })
  } catch (err) {
    return {
      status: 'error',
      message: mt('errors.maerskConnectionFailed', {
        message: err instanceof Error ? err.message : String(err)
      })
    }
  }

  if (response.status === 404) {
    return { status: 'not_found' }
  }
  if (response.status === 429) {
    return {
      status: 'error',
      message: mt('errors.maerskRateLimited')
    }
  }
  if (!response.ok) {
    return { status: 'error', message: mt('errors.maerskApiError', { status: response.status }) }
  }

  const events = (await response.json()) as DcsaEvent[]
  if (!Array.isArray(events) || events.length === 0) {
    return { status: 'not_found' }
  }

  return { status: 'found', snapshot: mapEventsToSnapshot(events) }
}
