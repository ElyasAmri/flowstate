package com.example.crc

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
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
 */
class RemoteClient {
    private val client = OkHttpClient()
    private var socket: WebSocket? = null

    private val _state = MutableStateFlow(ConnState.Disconnected)
    val state: StateFlow<ConnState> = _state

    private val _position = MutableStateFlow<DeckPosition?>(null)
    val position: StateFlow<DeckPosition?> = _position

    fun connect(url: String) {
        disconnect()
        _state.value = ConnState.Connecting
        val request = Request.Builder().url(url).build()
        socket = client.newWebSocket(
            request,
            object : WebSocketListener() {
                override fun onOpen(webSocket: WebSocket, response: Response) {
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

                override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
                    _state.value = ConnState.Disconnected
                }

                override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
                    _state.value = ConnState.Error
                }
            },
        )
    }

    fun disconnect() {
        socket?.close(NORMAL_CLOSURE, null)
        socket = null
        _position.value = null
        _state.value = ConnState.Disconnected
    }

    /** Send a bare command, e.g. `send("next")` -> `{"cmd":"next"}`. */
    fun send(cmd: String) {
        socket?.send(JSONObject().put("cmd", cmd).toString())
    }

    private companion object {
        const val NORMAL_CLOSURE = 1000
    }
}
