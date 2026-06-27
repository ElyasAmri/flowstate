package com.example.crc

import android.util.Base64
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import org.json.JSONObject
import java.security.MessageDigest

/**
 * OBS Studio remote over obs-websocket v5 (built into OBS 28+, default port
 * 4455). Implements the minimal handshake -- Hello (op 0) -> Identify (op 1)
 * with SHA-256 challenge-response auth when OBS requires a password -- then
 * switches the program scene with a SetCurrentProgramScene request (op 6) and
 * tracks the live scene via the CurrentProgramSceneChanged event (op 5).
 *
 * The phone talks to OBS directly (not through the deck relay), so this is a
 * self-contained client. Listener callbacks land on OkHttp's dispatcher thread;
 * StateFlow updates from there are safe and Compose collects them.
 */
class ObsClient {
    private val client = OkHttpClient()
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    private var socket: WebSocket? = null
    private var reconnectJob: Job? = null
    @Volatile private var wanted = false
    private var url: String = ""
    private var password: String = ""

    private val _state = MutableStateFlow(ConnState.Disconnected)
    val state: StateFlow<ConnState> = _state

    /** The OBS program scene name, kept in sync via events. */
    private val _scene = MutableStateFlow<String?>(null)
    val scene: StateFlow<String?> = _scene

    fun connect(url: String, password: String) {
        this.url = url
        this.password = password
        wanted = true
        reconnectJob?.cancel()
        open()
    }

    private fun open() {
        socket?.cancel()
        _state.value = ConnState.Connecting
        socket = client.newWebSocket(Request.Builder().url(url).build(), Listener())
    }

    /** Retry once after a delay (e.g. OBS launched after the phone), unless a
     *  connection is no longer wanted. */
    private fun scheduleReconnect() {
        if (!wanted) return
        reconnectJob?.cancel()
        reconnectJob = scope.launch {
            delay(RECONNECT_MS)
            if (wanted) open()
        }
    }

    fun disconnect() {
        wanted = false
        reconnectJob?.cancel()
        socket?.close(NORMAL_CLOSURE, null)
        socket = null
        _scene.value = null
        _state.value = ConnState.Disconnected
    }

    /** Cut OBS to the named scene (must match the scene name in OBS exactly). */
    fun setScene(name: String) {
        socket?.send(
            request(
                "SetCurrentProgramScene",
                "scene-$name",
                JSONObject().put("sceneName", name),
            ),
        )
    }

    private fun request(type: String, id: String, data: JSONObject? = null): String {
        val d = JSONObject().put("requestType", type).put("requestId", id)
        if (data != null) d.put("requestData", data)
        return JSONObject().put("op", OP_REQUEST).put("d", d).toString()
    }

    private fun sha256Base64(input: String): String {
        val digest = MessageDigest.getInstance("SHA-256").digest(input.toByteArray(Charsets.UTF_8))
        return Base64.encodeToString(digest, Base64.NO_WRAP)
    }

    private inner class Listener : WebSocketListener() {
        override fun onMessage(webSocket: WebSocket, text: String) {
            val msg = runCatching { JSONObject(text) }.getOrNull() ?: return
            when (msg.optInt("op", -1)) {
                OP_HELLO -> {
                    val d = msg.optJSONObject("d") ?: JSONObject()
                    val identify = JSONObject()
                        .put("rpcVersion", d.optInt("rpcVersion", 1))
                        // Subscribe to Scenes events so we track the active scene.
                        .put("eventSubscriptions", EVENT_SUB_SCENES)
                    // `authentication` is present only when OBS requires a password.
                    d.optJSONObject("authentication")?.let { auth ->
                        val secret = sha256Base64(password + auth.optString("salt"))
                        identify.put("authentication", sha256Base64(secret + auth.optString("challenge")))
                    }
                    webSocket.send(JSONObject().put("op", OP_IDENTIFY).put("d", identify).toString())
                }
                OP_IDENTIFIED -> {
                    socket = webSocket
                    reconnectJob?.cancel() // a live socket cancels any pending retry
                    _state.value = ConnState.Connected
                    // Seed the current scene so the active button highlights now.
                    webSocket.send(request("GetCurrentProgramScene", "get-scene"))
                }
                OP_EVENT -> {
                    val d = msg.optJSONObject("d") ?: return
                    if (d.optString("eventType") == "CurrentProgramSceneChanged") {
                        _scene.value = d.optJSONObject("eventData")?.optString("sceneName")
                    }
                }
                OP_REQUEST_RESPONSE -> {
                    val d = msg.optJSONObject("d") ?: return
                    if (d.optString("requestType") == "GetCurrentProgramScene") {
                        val rd = d.optJSONObject("responseData") ?: return
                        _scene.value = rd.optString("currentProgramSceneName")
                            .ifEmpty { rd.optString("sceneName") }
                    }
                }
            }
        }

        // Ignore callbacks from a socket we have already replaced.
        override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
            if (webSocket !== socket) return
            _scene.value = null
            _state.value = ConnState.Disconnected
            scheduleReconnect()
        }

        override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
            if (webSocket !== socket) return
            _scene.value = null
            _state.value = ConnState.Error
            scheduleReconnect()
        }
    }

    private companion object {
        const val NORMAL_CLOSURE = 1000
        const val RECONNECT_MS = 2000L
        // obs-websocket v5 opcodes.
        const val OP_HELLO = 0
        const val OP_IDENTIFY = 1
        const val OP_IDENTIFIED = 2
        const val OP_EVENT = 5
        const val OP_REQUEST = 6
        const val OP_REQUEST_RESPONSE = 7
        // EventSubscription.Scenes = 1 << 2.
        const val EVENT_SUB_SCENES = 4
    }
}
