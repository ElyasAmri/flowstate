package com.example.crc

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

/** Connection lifecycle, surfaced to the UI as a flow. */
enum class ConnState { Disconnected, Connecting, Connected, Error }

/** The deck's last reported position, echoed back over the relay. */
data class DeckPosition(val h: Int, val v: Int, val total: Int, val overview: Boolean)

/**
 * Thin OkHttp WebSocket client that talks to the deck's relay (mounted on the
 * Vite dev server at `/remote`). Commands go out as JSON (`{"cmd":"next"}`); the
 * deck echoes its position back, which we expose as [position] so the remote can
 * show where the deck is. Listener callbacks arrive on OkHttp's dispatcher
 * thread; updating a StateFlow value from there is safe and Compose collects it.
 *
 * Auto-reconnects: while a connection is wanted (between [connect] and
 * [disconnect]), any drop or failure schedules a retry after [RECONNECT_MS], so
 * the remote heals itself when the laptop/relay comes back -- no manual tap.
 */
class RemoteClient {
    private val client = OkHttpClient()
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    private var socket: WebSocket? = null
    private var reconnectJob: Job? = null
    @Volatile private var wanted = false
    private var url: String = ""

    private val _state = MutableStateFlow(ConnState.Disconnected)
    val state: StateFlow<ConnState> = _state

    private val _position = MutableStateFlow<DeckPosition?>(null)
    val position: StateFlow<DeckPosition?> = _position

    fun connect(url: String) {
        this.url = url
        wanted = true
        reconnectJob?.cancel()
        open()
    }

    private fun open() {
        socket?.cancel()
        _state.value = ConnState.Connecting
        socket = client.newWebSocket(Request.Builder().url(url).build(), Listener())
    }

    /** Retry once after a delay, unless a connection is no longer wanted. */
    private fun scheduleReconnect() {
        if (!wanted) return
        reconnectJob?.cancel()
        reconnectJob = scope.launch {
            delay(RECONNECT_MS)
            if (wanted) open()
        }
    }

    private inner class Listener : WebSocketListener() {
        override fun onOpen(webSocket: WebSocket, response: Response) {
            socket = webSocket
            reconnectJob?.cancel() // a live socket cancels any pending retry
            _state.value = ConnState.Connected
        }

        override fun onMessage(webSocket: WebSocket, text: String) {
            val json = runCatching { JSONObject(text) }.getOrNull() ?: return
            if (json.optString("type") == "pos") {
                _position.value = DeckPosition(
                    h = json.optInt("h"),
                    v = json.optInt("v"),
                    total = json.optInt("total"),
                    overview = json.optBoolean("overview"),
                )
            }
        }

        override fun onClosing(webSocket: WebSocket, code: Int, reason: String) {
            webSocket.close(NORMAL_CLOSURE, null)
        }

        // Ignore callbacks from a socket we have already replaced.
        override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
            if (webSocket !== socket) return
            _state.value = ConnState.Disconnected
            scheduleReconnect()
        }

        override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
            if (webSocket !== socket) return
            _state.value = ConnState.Error
            scheduleReconnect()
        }
    }

    fun disconnect() {
        wanted = false
        reconnectJob?.cancel()
        socket?.close(NORMAL_CLOSURE, null)
        socket = null
        _position.value = null
        _state.value = ConnState.Disconnected
    }

    /** Send a bare command, e.g. `send("next")` -> `{"cmd":"next"}`. */
    fun send(cmd: String) {
        socket?.send(JSONObject().put("cmd", cmd).toString())
    }

    /** Jump to a slide: `goto(5)` -> `{"cmd":"goto","h":5,"v":0}`. */
    fun goto(h: Int, v: Int = 0) {
        socket?.send(JSONObject().put("cmd", "goto").put("h", h).put("v", v).toString())
    }

    private companion object {
        const val NORMAL_CLOSURE = 1000
        const val RECONNECT_MS = 2000L
    }
}
