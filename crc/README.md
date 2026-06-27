# CRC — Android App

A phone remote for the presentation deck. Over the LAN it drives the deck's
relay (`ws://<laptop>:5173/remote`): the phone and laptop must be on the same
Wi-Fi. Three bottom tabs: **Controls** (prev / next / first / overview +
position), **Main** (jump to any main slide by title), and **Appendix** (same
for the backup slides). Set the relay address on the Settings screen.

Built with Kotlin, Jetpack Compose, and Gradle (Kotlin DSL).

## Stack

- **Language:** Kotlin 2.0
- **UI:** Jetpack Compose + Material 3
- **Build:** Gradle 8.11 (Kotlin DSL) with version catalog (`gradle/libs.versions.toml`)
- **Min SDK:** 24 · **Target/Compile SDK:** 35

## Layout

```
crc/
├── app/
│   ├── build.gradle.kts
│   └── src/
│       ├── main/java/com/example/crc/   # MainActivity + ui/theme
│       ├── main/res/                     # resources, launcher icon
│       ├── test/                         # local unit tests
│       └── androidTest/                  # instrumented tests
├── gradle/libs.versions.toml             # dependency version catalog
├── build.gradle.kts · settings.gradle.kts
└── gradlew · gradlew.bat                 # Gradle wrapper
```

## Build & run

```bash
# from crc
./gradlew assembleDebug      # build the debug APK
./gradlew installDebug       # install on a connected device/emulator
./gradlew test               # run local unit tests
```

Or open `crc` in Android Studio and run the `app` configuration.

> The application id / namespace is `com.example.crc` — rename it for a real release.
