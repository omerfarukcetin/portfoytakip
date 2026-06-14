# PortfoyTakip

Modern, mobil uyumlu ve local-first bir kisisel yatirim ve portfoy takip uygulamasi.

## Ozellikler

- Coklu portfoy olusturma ve yonetme
- Hisse, fon, para piyasasi fonu, doviz, altin/gumus, kripto, BES ve nakit takibi
- Alim, satis, temettu, nakit girisi ve nakit cikisi kayitlari
- Maliyet, guncel deger, gerceklesen ve gerceklesmemis kar/zarar hesaplari
- Portfoy bazli toplam deger ve performans gorunumu
- Varlik dagilimi ve para birimi maruziyeti raporlari
- Cevrimdisi kullanima uygun PWA yapisi
- Yerel otomatik snapshot sistemi
- JSON disari aktarma ve ice aktarma
- Acik ve koyu tema destegi

## Dosyalar

- `index.html`: uygulama iskeleti ve modal yapilari
- `styles.css`: responsive arayuz, tema sistemi ve bilesen stilleri
- `app.js`: veri modeli, hesaplamalar, form akislari ve raporlama
- `sw.js`: uygulama kabugunu cevrimdisi icin onbellege alan service worker
- `manifest.webmanifest`: PWA tanimi

## Veri ve guvenlik yaklasimi

Uygulama yerel-odakli calisir:

- Ana durum `localStorage` icinde saklanir
- Her kayittan sonra ek bir kurtarma snapshot'i olusturulur
- Kullanici dilerse JSON yedegi disari aktarabilir ve geri yukleyebilir

Bu yapi tek cihazda hizli acilis, dusuk gecikme ve baglanti olmasa bile calisma saglar.

## Otomatik fiyat guncelleme

Su anda iki feed tipi bulunur:

- `Binance spot`: kripto sembolune gore fiyat ceker
- `JSON endpoint`: ozel bir JSON kaynagindan fiyat ve kur alani okunur

Turkiye fonlari ve cihazlar arasi gercek bulut senkronizasyonu icin tarayici tarafindan dogrudan baglanmak yerine bir backend veya proxy katmani eklemek daha guvenli ve sagliklidir. Uygulama bunun icin feed/senkron mimarisini hazir halde birakir.

## Calistirma

Statik bir uygulamadir. Ornek yerel calistirma:

```bash
python3 -m http.server 8000
```

Ardindan tarayicida `http://localhost:8000` adresini ac.
