# Changelog

Bu dosya LCL-Tracking uygulamasındaki sürüm bazlı değişiklikleri listeler.
Format [Keep a Changelog](https://keepachangelog.com/) yaklaşımına dayanır.

**Not:** Bu dosya `npm run release` çalıştırıldığında otomatik güncellenir.
- Bir sonraki sürüm için yapılan değişiklikleri aşağıdaki **[Yayınlanmamış]**
  bölümüne madde madde eklemeniz yeterlidir; release script'i bu maddeleri
  release sırasında yeni sürüm başlığının altına taşır ve GitHub Release
  açıklaması olarak da kullanır.
- Eğer release alınırken bu bölüm boşsa, script son etiketlenmiş sürümden
  bu yana yapılan git commit mesajlarından otomatik bir özet üretir.

## [Yayınlanmamış]

<!-- Yeni değişiklikleri buraya madde madde ekleyin, örn: "- Yeni X özelliği eklendi" -->

## [1.4.1] - 2026-10-20

### Değişenler

- Durumu "Tamamlandı" olan booking'ler artık cutoff tarihine bakılmadan listede yeşil olarak vurgulanıyor
- Booking listesi, hiçbir sütun kaldırılmadan küçük ekranlarda yatay kaydırma gerektirmeyecek şekilde ekran genişliğine uyarlandı.
- Booking listesinde hücreler tek satırda gösteriliyor; müşteri adları 20 karakterden sonra üç noktayla kısaltılıp üzerine gelindiğinde tam gösteriliyor ve konteyner boyutu başlığı "Size" olarak kısaltıldı.

## [1.4.0] - 2026-10-20

### Eklenenler
- Atanmayan Araçlar ekranında çoklu seçimle modal üzerinden yeni booking oluşturma ve seçilen araçları konteyner olarak bu bookinge bağlama eklendi.

### Değişenler
- Bookinge konteyner eklerken/düzenlerken Konteyner No alanı artık zorunlu değil

## [1.3.0] - 2026-10-16

### Eklenenler
- Yeni "Operation Manager" kullanıcı rolü eklendi; bu rol Admin gibi booking silme işlemini doğrudan yapabiliyor ve onaylayabiliyor
- Operatörlerin booking silme işlemleri artık doğrudan silmiyor, Admin veya Operation Manager onayına gönderiliyor; onaylanana kadar booking silinmiyor
- Yeni "Onayda Bekleyen İşlemler" sayfası eklendi: Admin ve Operation Manager bekleyen silme taleplerini görüp onaylayabiliyor/reddedebiliyor, operatörler kendi taleplerinin durumunu takip edip onaylanmadan önce geri çekebiliyor
- Aynı booking için onayda bekleyen bir silme talebi varken ikinci bir talep gönderilemiyor; booking listesinde bu durum bir rozetle gösteriliyor
- Müşteri Yönetimi sayfası eklendi: Admin, Vergi No/Müşteri Adı/Vergi Dairesi/Mail (zorunlu), Adres/İletişim Telefon (opsiyonel) alanlarıyla müşteri ekleyip düzenleyebiliyor ve silebiliyor
- Yeni bir müşteri eklendiğinde, müşterinin mail adresiyle otomatik bir giriş hesabı oluşuyor ve geçici şifresi admin'e gösteriliyor
- Yeni "Müşteri" kullanıcı rolü eklendi: bu rolle giriş yapan kullanıcılar sadece Dashboard ve Bookingler sayfalarını, sadece kendilerine atanmış bookingleri salt okunur olarak görebiliyor (booking üzerinde düzenleme/konteyner ekleme/silme yapamıyor)
- Booking formuna, bookingin hangi müşteriye ait olduğunu seçebilecek bir "Müşteri" alanı eklendi
- Bir müşteri silindiğinde, o müşteriye atanmış bookingler silinmiyor (sadece müşteri bağlantısı kaldırılıyor) ve bağlı giriş hesabı pasifleştiriliyor
- Booking listesine, Customer rolü dışındaki kullanıcılar için bir "Müşteri" kolonu ve müşteriye göre filtreleme eklendi
- Dashboard'a, Customer rolü dışındaki kullanıcılar için müşteri bazında yük ve konteyner dağılımı grafikleri eklendi

### Değişenler
- Kullanıcılar sayfası "İç Kullanıcılar" ve "Müşteri Kullanıcıları" olmak üzere iki ayrı sekmeye bölündü
- Kullanıcılar ve Müşteriler sayfalarına arama kutusu eklendi
- "Dashboard" ekranının adı "Operasyon Özet" (İngilizce: "Operations Summary") olarak değiştirildi
- Müşteri rolü artık kendi booking listesini Excel'e aktarabiliyor (içe aktarma ve yeni booking oluşturma hâlâ kapalı)
- Müşteri rolü, booking listesindeki "Operatör" kolonundan diğer roller gibi operatöre e-posta gönderebiliyor

## [1.2.0] - 2026-10-15

### Değişenler
- Uygulamaya Türkçe/İngilizce dil desteği eklendi; giriş ekranında ve üst menüde bayrak simgesiyle dil değiştirilebiliyor, seçim hatırlanıyor
- Raporlar (Word/metin) ve Excel'e aktarma, seçilen dile göre oluşturuluyor
- Excel'den içe aktarma ekranı da Türkçe/İngilizce dile göre görüntüleniyor (Excel sütun adları hariç, değişmeden kalıyor)
- Booking'de "Unit" (planlanan konteyner sayısı) girilmemişse kapasite artık 0 kabul ediliyor; Unit alanı doldurulmadan booking'e konteyner eklenemiyor (hem arayüzde buton devre dışı bırakılıyor hem de arka uçta engelleniyor)
- Booking listesinde Unit sütunu, Unit girilmemiş kayıtlarda da gerçek eklenmiş konteyner sayısını "0/eklenenSayı" biçiminde gösteriyor
- Booking detay sayfasında Unit ve konteyner sayacı, Unit boşken de "0/eklenen" biçiminde tutarlı gösteriliyor

### Düzeltmeler

- Unit sayısına ulaşılmış booking'lerde yanlışlıkla fazladan konteyner eklenebilmesi engellendi
- Kullanıcılar sayfasında "E-posta Düzenle" butonuna tıklandığında oluşan hata giderildi; e-posta artık uygulama içi bir modal pencere üzerinden düzenleniyor

## [1.1.0] - 2026-10-15

### Eklenenler

- Kullanıcı adı/şifre ile giriş ekranı, oturum yönetimi ve "Beni Hatırla" seçeneği
- Kullanıcı yönetimi sayfası: kullanıcı ekleme/düzenleme ve sayfa bazlı yetkilendirme (izinler)
- Şifre değiştirme sayfası
- Supabase tabanlı bulut senkronizasyonu ve mevcut yerel SQLite verisinin buluta taşınması (migration)
- Uygulama içi otomatik güncelleme kontrolü (electron-updater ile arka planda indirme ve kurulum)
- Release notu/CHANGELOG otomasyonu: her `npm run release` çalıştırıldığında sürüm notları otomatik güncellenir ve GitHub Release açıklamasına eklenir

### Değişenler

- Yedekleme (backup) akışı ve belge depolama mantığı yeniden düzenlendi
- Rezervasyon (booking) detay, liste ve form sayfalarında iyileştirmeler
- Rapor oluşturma ve e-posta gönderim akışı güncellendi
- Genel arayüz teması ve stilleri yenilendi (giriş ekranı arka planı, yükleme animasyonu, filigran)
- Main/renderer arası IPC katmanı yeni kullanıcı ve yetkilendirme özellikleri için genişletildi

### Düzeltmeler

- Çeşitli küçük hatalar ve tutarlılık sorunları giderildi
