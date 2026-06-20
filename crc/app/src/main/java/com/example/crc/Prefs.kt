package com.example.crc

import android.content.Context
import androidx.core.content.edit

/**
 * Persistent settings, backed by SharedPreferences so the relay/OBS addresses
 * survive process death and reinstalls (a `rememberSaveable` only survives
 * configuration changes within a running process).
 */
class Prefs(context: Context) {
    private val sp = context.getSharedPreferences("flowstate_remote", Context.MODE_PRIVATE)

    /** The deck's slide relay (Vite dev server, /remote path). */
    var relayUrl: String
        get() = sp.getString(KEY_RELAY, DEFAULT_RELAY) ?: DEFAULT_RELAY
        set(value) = sp.edit { putString(KEY_RELAY, value) }

    /** OBS WebSocket address (Tools -> WebSocket Server Settings, default 4455). */
    var obsUrl: String
        get() = sp.getString(KEY_OBS_URL, DEFAULT_OBS) ?: DEFAULT_OBS
        set(value) = sp.edit { putString(KEY_OBS_URL, value) }

    /** OBS WebSocket password; empty when OBS auth is disabled. */
    var obsPassword: String
        get() = sp.getString(KEY_OBS_PW, "") ?: ""
        set(value) = sp.edit { putString(KEY_OBS_PW, value) }

    companion object {
        // Dev machine's LAN address; edit per network on the settings screen.
        const val DEFAULT_RELAY = "ws://192.168.0.121:5173/remote"
        const val DEFAULT_OBS = "ws://192.168.0.121:4455"
        private const val KEY_RELAY = "relay_url"
        private const val KEY_OBS_URL = "obs_url"
        private const val KEY_OBS_PW = "obs_pw"
    }
}
