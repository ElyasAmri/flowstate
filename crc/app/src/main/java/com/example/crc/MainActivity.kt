package com.example.crc

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
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
                    App(modifier = Modifier.padding(innerPadding))
                }
            }
        }
    }
}

@Composable
fun App(modifier: Modifier = Modifier) {
    val context = LocalContext.current
    val prefs = remember { Prefs(context) }
    val client = remember { RemoteClient() }
    DisposableEffect(Unit) { onDispose { client.disconnect() } }

    var relayUrl by remember { mutableStateOf(prefs.relayUrl) }
    var showSettings by rememberSaveable { mutableStateOf(false) }

    // Auto-connect on launch and whenever the saved address changes, so the
    // remote screen stays free of connection chrome -- the relay address is a
    // setting, not a per-use step.
    LaunchedEffect(relayUrl) { client.connect(relayUrl) }

    if (showSettings) {
        SettingsScreen(
            client = client,
            initial = relayUrl,
            onSave = { value ->
                val trimmed = value.trim()
                prefs.relayUrl = trimmed
                relayUrl = trimmed
                showSettings = false
            },
            onBack = { showSettings = false },
            modifier = modifier,
        )
    } else {
        RemoteScreen(
            client = client,
            onReconnect = { client.connect(relayUrl) },
            onOpenSettings = { showSettings = true },
            modifier = modifier,
        )
    }
}

@Composable
private fun RemoteScreen(
    client: RemoteClient,
    onReconnect: () -> Unit,
    onOpenSettings: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val state by client.state.collectAsState()
    val position by client.position.collectAsState()
    val connected = state == ConnState.Connected

    Column(
        modifier = modifier
            .fillMaxSize()
            .padding(20.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        // Minimal header: a status dot (tap to reconnect) and a way into
        // settings. No address, no connect button on the control surface.
        Row(
            verticalAlignment = Alignment.CenterVertically,
            modifier = Modifier.fillMaxWidth(),
        ) {
            val dot = when (state) {
                ConnState.Connected -> Color(0xFF4CAF50)
                ConnState.Connecting -> Color(0xFFFFC107)
                ConnState.Error -> Color(0xFFF44336)
                ConnState.Disconnected -> Color.Gray
            }
            Box(
                modifier = Modifier
                    .size(14.dp)
                    .clip(CircleShape)
                    .background(dot)
                    .clickable(onClick = onReconnect),
            )
            Spacer(Modifier.width(8.dp))
            Text(
                if (connected) "" else "tap to reconnect",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.weight(1f),
            )
            TextButton(onClick = onOpenSettings) { Text("Settings") }
        }

        Spacer(Modifier.weight(1f))

        // Where the deck is, echoed back over the relay.
        val where = position?.let { p ->
            if (p.overview) "overview" else "${p.h + 1}.${p.v + 1} / ${p.total}"
        } ?: "--"
        Text(where, style = MaterialTheme.typography.displaySmall)

        Spacer(Modifier.height(8.dp))

        // Small prev / next arrows -- the primary control.
        Row(horizontalArrangement = Arrangement.spacedBy(20.dp)) {
            ArrowButton("‹", connected) { client.send("prev") }
            ArrowButton("›", connected) { client.send("next") }
        }

        Spacer(Modifier.weight(1f))

        // Secondary jumps.
        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            OutlinedButton(onClick = { client.send("first") }, enabled = connected) { Text("First") }
            OutlinedButton(onClick = { client.send("overview") }, enabled = connected) {
                Text("Overview")
            }
        }
    }
}

@Composable
private fun SettingsScreen(
    client: RemoteClient,
    initial: String,
    onSave: (String) -> Unit,
    onBack: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val state by client.state.collectAsState()
    var draft by rememberSaveable { mutableStateOf(initial) }

    Column(
        modifier = modifier
            .fillMaxSize()
            .padding(20.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            modifier = Modifier.fillMaxWidth(),
        ) {
            TextButton(onClick = onBack) { Text("< Back") }
            Text(
                "Settings",
                style = MaterialTheme.typography.headlineSmall,
                modifier = Modifier.weight(1f),
                textAlign = TextAlign.Center,
            )
            Spacer(Modifier.width(64.dp))
        }

        OutlinedTextField(
            value = draft,
            onValueChange = { draft = it },
            label = { Text("Relay address") },
            supportingText = { Text("ws://<deck-host>:5173/remote") },
            singleLine = true,
            modifier = Modifier.fillMaxWidth(),
        )

        val (label, color) = when (state) {
            ConnState.Connected -> "connected" to Color(0xFF4CAF50)
            ConnState.Connecting -> "connecting..." to Color(0xFFFFC107)
            ConnState.Error -> "connection failed" to Color(0xFFF44336)
            ConnState.Disconnected -> "disconnected" to Color.Gray
        }
        Text(label, color = color)

        Button(
            onClick = { onSave(draft) },
            enabled = draft.isNotBlank(),
            modifier = Modifier.fillMaxWidth(),
        ) { Text("Save & connect") }
    }
}

@Composable
private fun ArrowButton(glyph: String, enabled: Boolean, onClick: () -> Unit) {
    Button(
        onClick = onClick,
        enabled = enabled,
        modifier = Modifier
            .width(96.dp)
            .height(64.dp),
    ) {
        Text(glyph, fontSize = 30.sp)
    }
}
