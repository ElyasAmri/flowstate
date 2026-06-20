package com.example.crc

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.crc.ui.theme.CRCTheme

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            CRCTheme {
                Scaffold(modifier = Modifier.fillMaxSize()) { innerPadding ->
                    RemoteScreen(modifier = Modifier.padding(innerPadding))
                }
            }
        }
    }
}

@Composable
fun RemoteScreen(modifier: Modifier = Modifier) {
    val client = remember { RemoteClient() }
    // Tear the socket down when the screen leaves composition.
    DisposableEffect(Unit) { onDispose { client.disconnect() } }

    val state by client.state.collectAsState()
    val position by client.position.collectAsState()
    // Default to the dev machine's LAN address; edit per network at demo time.
    var url by rememberSaveable { mutableStateOf("ws://192.168.0.121:5173/remote") }

    val connected = state == ConnState.Connected

    Column(
        modifier = modifier
            .fillMaxSize()
            .padding(20.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Text("Flowstate Remote", style = MaterialTheme.typography.headlineSmall)

        OutlinedTextField(
            value = url,
            onValueChange = { url = it },
            label = { Text("Relay address") },
            singleLine = true,
            enabled = !connected && state != ConnState.Connecting,
            modifier = Modifier.fillMaxWidth(),
        )

        Row(
            horizontalArrangement = Arrangement.spacedBy(12.dp),
            verticalAlignment = Alignment.CenterVertically,
            modifier = Modifier.fillMaxWidth(),
        ) {
            Button(
                onClick = { if (connected) client.disconnect() else client.connect(url) },
                enabled = state != ConnState.Connecting,
            ) {
                Text(if (connected) "Disconnect" else "Connect")
            }
            val (label, color) = when (state) {
                ConnState.Connected -> "connected" to Color(0xFF4CAF50)
                ConnState.Connecting -> "connecting..." to Color(0xFFFFC107)
                ConnState.Error -> "connection failed" to Color(0xFFF44336)
                ConnState.Disconnected -> "disconnected" to Color.Gray
            }
            Text(label, color = color)
        }

        // Where the deck currently is, echoed back over the relay.
        val where = position?.let { p ->
            if (p.overview) "overview" else "slide ${p.h + 1}.${p.v + 1} / ${p.total}"
        } ?: "--"
        Text(
            where,
            modifier = Modifier.fillMaxWidth(),
            textAlign = TextAlign.Center,
            style = MaterialTheme.typography.titleMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )

        Spacer(Modifier.height(4.dp))

        // Primary controls: previous / next, large touch targets.
        Row(
            horizontalArrangement = Arrangement.spacedBy(12.dp),
            modifier = Modifier
                .fillMaxWidth()
                .weight(1f),
        ) {
            BigButton("PREV", connected, Modifier.weight(1f)) { client.send("prev") }
            BigButton("NEXT", connected, Modifier.weight(1f)) { client.send("next") }
        }

        // Secondary controls.
        Row(
            horizontalArrangement = Arrangement.spacedBy(12.dp),
            modifier = Modifier.fillMaxWidth(),
        ) {
            OutlinedButton(
                onClick = { client.send("first") },
                enabled = connected,
                modifier = Modifier.weight(1f),
            ) { Text("First") }
            OutlinedButton(
                onClick = { client.send("overview") },
                enabled = connected,
                modifier = Modifier.weight(1f),
            ) { Text("Overview") }
        }
    }
}

@Composable
private fun BigButton(
    label: String,
    enabled: Boolean,
    modifier: Modifier = Modifier,
    onClick: () -> Unit,
) {
    Button(
        onClick = onClick,
        enabled = enabled,
        modifier = modifier.fillMaxSize(),
    ) {
        Text(label, fontSize = 28.sp)
    }
}
