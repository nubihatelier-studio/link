# Nubih Creator — app nativa (iOS / Android)

Este proyecto ya tiene Capacitor configurado (`capacitor.config.ts`) y las carpetas nativas
`ios/` y `android/` generadas. Lo único que no se puede hacer desde acá es compilarlas a un
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

Esto builda, sincroniza, y abre `ios/App/App.xcworkspace` en Xcode. Ahí:
1. Seleccioná tu equipo de desarrollo en **Signing & Capabilities** (tu Apple ID gratis alcanza para probar en tu propio iPhone; para subir a la App Store hace falta una cuenta de Apple Developer paga).
2. Elegí un simulador o tu iPhone conectado, y **Run** (▶).

## Android (necesita Android Studio)

```bash
npm run cap:android
```

Abre `android/` en Android Studio. Ahí: dejá que Gradle sincronice, elegí un emulador o tu
celular por USB (con depuración USB activada), y **Run** (▶).

## Después de cada cambio de código

Repetí `npm run cap:sync` (o directamente `npm run cap:ios` / `npm run cap:android`, que ya
lo hacen por vos) antes de volver a correr la app — Capacitor no recarga el JS solo, hay que
volver a sincronizar el build.

## Ícono y splash screen

Todavía usan el placeholder que trae Capacitor por defecto. Para poner el logo real de Nubih,
lo más simple es generarlos con `@capacitor/assets`:

```bash
npm install -D @capacitor/assets
npx capacitor-assets generate
```

(necesita un `resources/icon.png` de al menos 1024×1024 y, si querés splash screen,
`resources/splash.png` de 2732×2732 — avisame si querés que te arme esos archivos a partir
del logo de Nubih que ya tenemos.)
