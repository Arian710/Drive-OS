# Drive OS – iOS App (Capacitor)

Dieses Repo enthaelt jetzt neben der Web-App (`index.html`, `supabase.js` im Root, weiterhin von Vercel genutzt)
auch das Capacitor-Projekt fuer die native iOS-App.

## Voraussetzungen (nur auf macOS moeglich)
- Xcode (aktuelle Version aus dem App Store)
- Node.js (https://nodejs.org)

## Setup auf dem Mac
```bash
git clone https://github.com/Arian710/Drive-OS.git
cd Drive-OS
npm install
npm run sync:ios   # kopiert index.html/supabase.js nach www/ und synct das iOS-Projekt
```

## Xcode oeffnen
```bash
open ios/App/App.xcodeproj
```
Dort: Signing & Capabilities -> dein Apple Developer Team auswaehlen, dann auf einem Simulator oder Geraet ausfuehren (Play-Button).

## Nach Aenderungen an index.html/supabase.js
Immer `npm run sync:ios` erneut ausfuehren, bevor in Xcode gebaut wird –
sonst laeuft im Simulator/Device noch der alte Stand.

## Bundle-ID
Aktuell: `com.arianshahidi.driveos` (in `capacitor.config.json`).
Kann noch geaendert werden, sollte aber vor dem ersten App-Store-Release final sein.
