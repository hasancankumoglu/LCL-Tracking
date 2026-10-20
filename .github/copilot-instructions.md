# Project Guidelines

## Yerelleştirme (i18n)

- Kullanıcıya görünen her metin (ekran başlıkları, buton/menü etiketleri, hata ve
  uyarı mesajları, bilgilendirme yazıları vb.) [src/shared/locales/](../src/shared/locales)
  altındaki tüm dil dosyalarına ([tr.ts](../src/shared/locales/tr.ts),
  [en.ts](../src/shared/locales/en.ts)) eklenir/güncellenir; sadece tek bir dilde
  bırakılmaz.
- Yeni bir metin eklerken veya var olan bir metni değiştirirken, ilgili anahtar
  tüm dil dosyalarında aynı anda güncellenir; anlam olarak birebir çeviri olması
  gerekmez ama her dilde o dile uygun, doğal bir karşılığı olmalıdır.
- Kod içinde sabit (hard-coded) kullanıcıya dönük metin kullanılmaz; `t('...')`
  üzerinden locale anahtarları kullanılır.

## Changelog

- Her kullanıcı promptu sonunda, kod/davranış değişikliği içeren bir çalışma
  yapıldıysa [CHANGELOG.md](../CHANGELOG.md) dosyasındaki `## [Yayınlanmamış]`
  bölümünü o çalışmayı özetleyen madde(ler) ile güncelle. Bu, görev tamamlandığında
  otomatik ve kullanıcı istemeden yapılmalı; ayrı bir onay istemeye gerek yok.
- Sadece soru-cevap, inceleme/okuma veya dosya değişikliği içermeyen promptlarda
  CHANGELOG güncellemesi gerekmez.
- Yeni madde(ler) uygun kategoriye eklenir (`### Eklenenler`, `### Değişenler`,
  `### Düzeltmeler`); kategori `## [Yayınlanmamış]` başlığının hemen altında yoksa
  oluşturulur. Var olan maddelerin üzerine yazılmaz, sona eklenir.
- Maddeler kısa ve kullanıcıya dönük Türkçe olarak yazılır (ör. "- X sayfasında Y
  düzeltildi"), teknik implementasyon detayına girilmez.
- `## [Yayınlanmamış]` bölümü, `npm run release` çalıştırıldığında script
  tarafından yeni sürüm başlığının altına taşınır; bu nedenle sürüm numarası veya
  tarih elle eklenmez.
