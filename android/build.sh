#!/bin/bash
set -e

# =============================================================================
# Boggle TV — Build Script
# Buduje APK na Android TV bez Android Studio
# =============================================================================

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
ANDROID_DIR="$SCRIPT_DIR"
ASSETS_DIR="$ANDROID_DIR/app/src/main/assets/nodejs-project"

echo ""
echo "🎮 Boggle TV — Budowanie APK"
echo "=============================="
echo ""

# --- 1. Sprawdź Javę ---
if ! command -v java &> /dev/null; then
    echo "☕ Java nie znaleziona. Instaluję JDK 17 przez Homebrew..."
    if command -v brew &> /dev/null; then
        brew install openjdk@17
        export JAVA_HOME="$(brew --prefix openjdk@17)/libexec/openjdk.jdk/Contents/Home"
        export PATH="$JAVA_HOME/bin:$PATH"
    else
        echo "❌ Homebrew nie znalezione. Zainstaluj Java JDK 17 ręcznie:"
        echo "   https://adoptium.net/temurin/releases/"
        exit 1
    fi
fi

JAVA_VER=$(java -version 2>&1 | head -1 | cut -d'"' -f2 | cut -d'.' -f1)
echo "✅ Java: $(java -version 2>&1 | head -1)"

# --- 2. Sprawdź Android SDK ---
if [ -z "$ANDROID_HOME" ] && [ -z "$ANDROID_SDK_ROOT" ]; then
    # Try common locations
    if [ -d "$HOME/Library/Android/sdk" ]; then
        export ANDROID_HOME="$HOME/Library/Android/sdk"
    elif [ -d "$HOME/Android/Sdk" ]; then
        export ANDROID_HOME="$HOME/Android/Sdk"
    else
        echo ""
        echo "📱 Android SDK nie znalezione."
        echo ""
        echo "Opcja 1 — Zainstaluj Android Studio (najłatwiej):"
        echo "   https://developer.android.com/studio"
        echo ""
        echo "Opcja 2 — Tylko command-line tools:"
        echo "   1. Pobierz: https://developer.android.com/studio#command-line-tools-only"
        echo "   2. Rozpakuj do ~/Android/sdk/cmdline-tools/latest/"
        echo "   3. Uruchom:"
        echo "      export ANDROID_HOME=~/Android/sdk"
        echo "      \$ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager \"platform-tools\" \"platforms;android-34\" \"build-tools;34.0.0\""
        echo "   4. Uruchom ten skrypt ponownie"
        echo ""
        exit 1
    fi
fi
export ANDROID_SDK_ROOT="${ANDROID_HOME:-$ANDROID_SDK_ROOT}"
export ANDROID_HOME="$ANDROID_SDK_ROOT"
echo "✅ Android SDK: $ANDROID_HOME"

# --- 3. Sprawdź wymagane SDK platformy ---
if [ ! -d "$ANDROID_HOME/platforms/android-34" ]; then
    echo "📦 Instaluję platformę Android 34..."
    yes | "$ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager" \
        "platforms;android-34" "build-tools;34.0.0" "platform-tools" 2>/dev/null || \
    echo "⚠️  Nie mogłem zainstalować SDK automatycznie. Uruchom Android Studio i zainstaluj SDK 34."
fi

# --- 4. Skopiuj pliki serwera do assets ---
echo ""
echo "📁 Kopiuję pliki serwera do APK..."
rm -rf "$ASSETS_DIR"
mkdir -p "$ASSETS_DIR"

# Kopiuj pliki projektu (bez android/ i .git i inne zbędne)
cp "$PROJECT_DIR/server.js" "$ASSETS_DIR/"
cp "$PROJECT_DIR/package.json" "$ASSETS_DIR/"
cp -r "$PROJECT_DIR/data" "$ASSETS_DIR/data"
cp -r "$PROJECT_DIR/public" "$ASSETS_DIR/public"
cp -r "$PROJECT_DIR/node_modules" "$ASSETS_DIR/node_modules"

echo "✅ Pliki serwera skopiowane"

# --- 5. Buduj APK ---
echo ""
echo "🔨 Buduję APK..."
cd "$ANDROID_DIR"

# Make gradlew executable if it exists
if [ -f "./gradlew" ]; then
    chmod +x ./gradlew
    ./gradlew assembleDebug --no-daemon
else
    # Download gradle wrapper
    echo "📥 Pobieram Gradle wrapper..."
    gradle wrapper --gradle-version 8.5 2>/dev/null || {
        echo "❌ Gradle nie znalezione. Instaluję..."
        if command -v brew &> /dev/null; then
            brew install gradle
            gradle wrapper --gradle-version 8.5
        else
            echo "❌ Zainstaluj Gradle: brew install gradle"
            exit 1
        fi
    }
    chmod +x ./gradlew
    ./gradlew assembleDebug --no-daemon
fi

# --- 6. Gotowe! ---
APK_PATH="$ANDROID_DIR/app/build/outputs/apk/debug/app-debug.apk"
if [ -f "$APK_PATH" ]; then
    echo ""
    echo "✅ ====================================="
    echo "   APK ZBUDOWANE POMYŚLNIE!"
    echo "   $APK_PATH"
    echo "======================================"
    echo ""
    echo "📺 Instalacja na TV:"
    echo "   Opcja 1: adb install $APK_PATH"
    echo "   Opcja 2: Skopiuj APK na pendrive → zainstaluj przez Downloader"
    echo "   Opcja 3: Udostępnij APK przez sieć lokalną"
    echo ""

    # If adb is available and a device is connected, offer to install
    if command -v adb &> /dev/null; then
        DEVICE_COUNT=$(adb devices | grep -c 'device$' || true)
        if [ "$DEVICE_COUNT" -gt 0 ]; then
            echo "📱 Wykryto podłączone urządzenie. Instaluję..."
            adb install -r "$APK_PATH" && echo "✅ Zainstalowano na urządzeniu!"
        fi
    fi
else
    echo ""
    echo "❌ Build nie powiódł się. Sprawdź logi powyżej."
    exit 1
fi
