# Flaschen KI

GitHub-Projekt für die Android-App „Flaschen KI“.

## Inhalt

- `app/` – Expo/React-Native-App
- `docs/` – Website für GitHub Pages
- `releases/` – Platz für die fertige APK
- `.github/workflows/pages.yml` – automatische Veröffentlichung der Website
- `.github/workflows/build-apk.yml` – optionaler EAS-APK-Build

## 1. Repository erstellen

Erstelle auf GitHub ein neues öffentliches Repository, zum Beispiel:

`flaschen-ki`

Lade anschließend den kompletten Inhalt dieses Ordners hoch.

## 2. GitHub Pages aktivieren

Öffne im Repository:

`Settings → Pages`

Unter **Build and deployment** wähle:

`GitHub Actions`

Nach dem nächsten Push wird die Website automatisch veröffentlicht.

Die Adresse lautet anschließend ungefähr:

`https://DEIN-GITHUB-NAME.github.io/flaschen-ki/`

## 3. APK auf der Website anbieten

Kopiere deine fertige APK nach:

`releases/flaschen-ki.apk`

Danach Commit und Push durchführen.

## 4. APK automatisch mit GitHub Actions bauen

Dafür brauchst du ein Expo Access Token.

1. Erstelle bei Expo ein Access Token.
2. Öffne GitHub:
   `Settings → Secrets and variables → Actions`
3. Erstelle das Secret:
   `EXPO_TOKEN`
4. Öffne:
   `Actions → Build Android APK → Run workflow`

Der Workflow startet einen EAS-Build. Der fertige Download wird weiterhin auf Expo/EAS bereitgestellt; er wird nicht automatisch in `releases/` kopiert.

## 5. Lokal starten

```bash
cd app
npm install
npx expo start
```

## Sicherheit

- Niemals `.env` oder OpenAI-API-Schlüssel zu GitHub hochladen.
- Einen OpenAI-Schlüssel niemals direkt in die APK einbauen.
- KI-Funktionen sollten über einen eigenen HTTPS-Server laufen.
