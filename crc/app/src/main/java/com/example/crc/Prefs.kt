package com.example.crc

import android.content.Context
import androidx.core.content.edit

/**
 * Persistent settings, backed by SharedPreferences so the relay address
 * survives process death and reinstalls (a `rememberSaveable` only survives
 * configuration changes within a running process).
 */
class Prefs(context: Context) {
    private val sp = context.getSharedPreferences("flowstate_remote", Context.MODE_PRIVATE)

    /** The deck's slide relay (Vite dev server, /remote path). */
    var relayUrl: String
        get() = sp.getString(KEY_RELAY, DEFAULT_RELAY) ?: DEFAULT_RELAY
        set(value) = sp.edit { putString(KEY_RELAY, value) }

    companion object {
        // Dev machine's LAN address; edit per network on the settings screen.
        const val DEFAULT_RELAY = "ws://192.168.0.121:5173/remote"
        private const val KEY_RELAY = "relay_url"
    }
}
