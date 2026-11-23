plugins {
    id("com.android.application")
}

val liveChatAppUrl: String = System.getenv("LIVECHAT_APP_URL")
    ?.takeIf { it.isNotBlank() }
    ?: "https://ais-pre-zetd7lnknbe4oqki4jt44t-965804738249.asia-southeast1.run.app"

android {
    namespace = "com.livechatter.app"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.livechatter.app"
        minSdk = 24
        targetSdk = 35
        versionCode = 1
        versionName = "1.0.0"

        buildConfigField("String", "LIVECHAT_URL", "\"$liveChatAppUrl\"")
    }

    signingConfigs {
        getByName("debug") {
            val customKeystore = rootProject.file("debug.keystore")
            if (customKeystore.exists()) {
                storeFile = customKeystore
                storePassword = "android"
                keyAlias = "androiddebugkey"
                keyPassword = "android"
            }
        }
    }

    buildTypes {
        debug {
            signingConfig = signingConfigs.getByName("debug")
        }
        release {
            isMinifyEnabled = false
            signingConfig = signingConfigs.getByName("debug")
        }
    }

    buildFeatures {
        buildConfig = true
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}

dependencies {
    implementation("androidx.appcompat:appcompat:1.7.0")
    implementation("androidx.activity:activity:1.9.3")
    implementation("androidx.core:core:1.15.0")
}
