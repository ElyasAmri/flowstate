// Top-level build file where you can add configuration options common to all sub-projects/modules.
plugins {
    // AGP 9 provides built-in Kotlin (no kotlin.android). The Compose Compiler
    // plugin is still needed. See https://kotl.in/gradle/agp-built-in-kotlin
    alias(libs.plugins.android.application) apply false
    alias(libs.plugins.kotlin.compose) apply false
}
