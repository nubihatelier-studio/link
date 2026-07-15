# Nubih Creator — app nativa (iOS / Android)

Este proyecto ya tiene Capacitor configurado (`capacitor.config.ts`) y las carpetas nativas
`ios/` y `android/` generadas. Lo único que no se puede hacer desde acá es compilar un
`.ipa`/`.apk` real — eso necesita Xcode (Mac) o Android Studio corriendo en tu máquina.

## La primera vez

```bash
npm install
npm run build
npx cap sync
```

`cap sync` copia el build web más reciente a `ios/App/App/public` y `android/app/src/main/assets/public`,
y deja los plugins nativos (`@capacitor/filesystem`, `@capacitor/share`) enlazados.

## iOS (necesita Mac + Xcode)

```bash
npm run cap:ios
```

Esto compila, sincroniza, y abre `ios/App/App.xcworkspace` en Xcode. Ahí:
1. Elige tu equipo de desarrollo en **Signing & Capabilities** (tu Apple ID gratis alcanza para probar en tu propio iPhone; para subir a la App Store hace falta una cuenta de Apple Developer paga).
2. Elige un simulador o tu iPhone conectado, y presiona **Run** (▶).

## Android (necesita Android Studio)

```bash
npm run cap:android
```

Abre `android/` en Android Studio. Ahí: deja que Gradle sincronice, elige un emulador o tu
celular por USB (con depuración USB activada), y presiona **Run** (▶).

## Después de cada cambio de código

Repite `npm run cap:sync` (o directamente `npm run cap:ios` / `npm run cap:android`, que ya
lo hacen por ti) antes de volver a correr la app — Capacitor no recarga el JS solo, hay que
volver a sincronizar el build.

## Ícono y splash screen

Ya están generados a partir del logo real de Nubih (`resources/icon.png` y
`resources/splash.png`). Si el logo cambia, regenera ambos con `@capacitor/assets`:

```bash
npx capacitor-assets generate
```
