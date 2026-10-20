import type { CarrierLookupResult, CarrierName, CarrierReferenceType } from '../../shared/types'
import { lookupMaerskBooking } from './maersk'
import { lookupMaerskPublicTracking } from './maerskPublic'
import { mt } from '../i18n/language'

/** Armatör adına göre doğru adaptöre yönlendirir. Yeni armatör eklendiğinde buraya bir case eklenir. */
export function lookupCarrierBooking(
  carrier: CarrierName,
  referenceType: CarrierReferenceType,
  value: string
): Promise<CarrierLookupResult> {
  switch (carrier) {
    case 'MAERSK':
      return lookupMaerskBooking(referenceType, value)
    default:
      return Promise.resolve({
        status: 'error',
        message: mt('errors.unsupportedCarrier', { carrier })
      })
  }
}

/**
 * Resmi API kullanılamadığında (kimlik bilgisi yok/hata/bulunamadı), kullanıcının
 * açıkça seçtiği deneysel "genel takip sayfası" fallback'ine yönlendirir. Yeni
 * armatör eklendiğinde ve bir public-fallback adaptörü varsa buraya case eklenir.
 */
export function lookupCarrierPublicFallback(
  carrier: CarrierName,
  referenceType: CarrierReferenceType,
  value: string
): Promise<CarrierLookupResult> {
  switch (carrier) {
    case 'MAERSK':
      return lookupMaerskPublicTracking(referenceType, value)
    default:
      return Promise.resolve({
        status: 'error',
        message: mt('errors.publicFallbackNotSupportedFor', { carrier })
      })
  }
}

export { setCarrierCredentials, hasCarrierCredentials, clearCarrierCredentials } from './config'
