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

// OBS scene names -- create scenes with these exact names in OBS.
private const val DECK_SCENE = "Deck"
private const val DEMO_SCENE = "Demo"

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
    val relay = remember { RemoteClient() }
    val obs = remember { ObsClient() }
    DisposableEffect(Unit) {
        onDispose {
            relay.disconnect()
            obs.disconnect()
        }
    }

    var relayUrl by remember { mutableStateOf(prefs.relayUrl) }
    var obsUrl by remember { mutableStateOf(prefs.obsUrl) }
    var obsPassword by remember { mutableStateOf(prefs.obsPassword) }
    var showSettings by rememberSaveable { mutableStateOf(false) }

    // Auto-connect both legs on launch and whenever their settings change, so
    // the control surface carries no connection chrome.
    LaunchedEffect(relayUrl) { relay.connect(relayUrl) }
    LaunchedEffect(obsUrl, obsPassword) { obs.connect(obsUrl, obsPassword) }

    if (showSettings) {
        SettingsScreen(
            relay = relay,
            obs = obs,
            initialRelay = relayUrl,
            initialObsUrl = obsUrl,
            initialObsPassword = obsPassword,
            onSave = { r, u, p ->
                relayUrl = r.trim().also { prefs.relayUrl = it }
                obsUrl = u.trim().also { prefs.obsUrl = it }
                obsPassword = p.also { prefs.obsPassword = it }
                showSettings = false
            },
            onBack = { showSettings = false },
            modifier = modifier,
        )
    } else {
        StageScreen(
            relay = relay,
            obs = obs,
            onReconnect = {
                relay.connect(relayUrl)
                obs.connect(obsUrl, obsPassword)
            },
            onOpenSettings = { showSettings = true },
            modifier = modifier,
        )
    }
}

@Composable
private fun StageScreen(
    relay: RemoteClient,
    obs: ObsClient,
    onReconnect: () -> Unit,
    onOpenSettings: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val relayState by relay.state.collectAsState()
    val position by relay.position.collectAsState()
    val obsState by obs.state.collectAsState()
    val scene by obs.scene.collectAsState()
    val connected = relayState == ConnState.Connected

    Column(
        modifier = modifier
            .fillMaxSize()
            .padding(20.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        // Minimal header: two status dots (tap either to reconnect) + settings.
        Row(
            verticalAlignment = Alignment.CenterVertically,
            modifier = Modifier.fillMaxWidth(),
        ) {
            StatusDot(relayState, onReconnect)
            Spacer(Modifier.width(6.dp))
            StatusDot(obsState, onReconnect)
            Spacer(Modifier.weight(1f))
            TextButton(onClick = onOpenSettings) { Text("Settings") }
        }

        Spacer(Modifier.weight(1f))

        // Where the deck is, echoed back over the relay.
        val where = position?.let { p ->
            if (p.overview) "overview" else "${p.h + 1}.${p.v + 1} / ${p.total}"
        } ?: "--"
        Text(where, style = MaterialTheme.typography.displaySmall)

        Spacer(Modifier.height(4.dp))

        // Slide nav -- small prev / next arrows.
        Row(horizontalArrangement = Arrangement.spacedBy(20.dp)) {
            ArrowButton("‹", connected) { relay.send("prev") }
            ArrowButton("›", connected) { relay.send("next") }
        }

        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            OutlinedButton(onClick = { relay.send("first") }, enabled = connected) { Text("First") }
            OutlinedButton(onClick = { relay.send("overview") }, enabled = connected) {
                Text("Overview")
            }
        }

        Spacer(Modifier.weight(1f))

        // OBS scene switching -- the seamless cut to the live app. Active scene
        // stays highlighted (filled), driven by OBS events.
        Text(
            "SCENE",
            style = MaterialTheme.typography.labelMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        val obsReady = obsState == ConnState.Connected
        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            SceneButton("Deck", scene == DECK_SCENE, obsReady) { obs.setScene(DECK_SCENE) }
            SceneButton("Demo", scene == DEMO_SCENE, obsReady) { obs.setScene(DEMO_SCENE) }
        }
    }
}

@Composable
private fun SettingsScreen(
    relay: RemoteClient,
    obs: ObsClient,
    initialRelay: String,
    initialObsUrl: String,
    initialObsPassword: String,
    onSave: (String, String, String) -> Unit,
    onBack: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val relayState by relay.state.collectAsState()
    val obsState by obs.state.collectAsState()
    var relayDraft by rememberSaveable { mutableStateOf(initialRelay) }
    var obsDraft by rememberSaveable { mutableStateOf(initialObsUrl) }
    var pwDraft by rememberSaveable { mutableStateOf(initialObsPassword) }

    Column(
        modifier = modifier
            .fillMaxSize()
            .padding(20.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
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
            value = relayDraft,
            onValueChange = { relayDraft = it },
            label = { Text("Deck relay") },
            supportingText = { Text(connLabel("relay", relayState)) },
            singleLine = true,
            modifier = Modifier.fillMaxWidth(),
        )
        OutlinedTextField(
            value = obsDraft,
            onValueChange = { obsDraft = it },
            label = { Text("OBS WebSocket") },
            supportingText = { Text(connLabel("OBS", obsState)) },
            singleLine = true,
            modifier = Modifier.fillMaxWidth(),
        )
        OutlinedTextField(
            value = pwDraft,
            onValueChange = { pwDraft = it },
            label = { Text("OBS password") },
            supportingText = { Text("blank if OBS auth is disabled") },
            singleLine = true,
            modifier = Modifier.fillMaxWidth(),
        )

        Button(
            onClick = { onSave(relayDraft, obsDraft, pwDraft) },
            enabled = relayDraft.isNotBlank() && obsDraft.isNotBlank(),
            modifier = Modifier.fillMaxWidth(),
        ) { Text("Save & connect") }
    }
}

private fun connLabel(name: String, state: ConnState): String = when (state) {
    ConnState.Connected -> "$name: connected"
    ConnState.Connecting -> "$name: connecting..."
    ConnState.Error -> "$name: connection failed"
    ConnState.Disconnected -> "$name: disconnected"
}

@Composable
private fun StatusDot(state: ConnState, onClick: () -> Unit) {
    val color = when (state) {
        ConnState.Connected -> Color(0xFF4CAF50)
        ConnState.Connecting -> Color(0xFFFFC107)
        ConnState.Error -> Color(0xFFF44336)
        ConnState.Disconnected -> Color.Gray
    }
    Box(
        modifier = Modifier
            .size(14.dp)
            .clip(CircleShape)
            .background(color)
            .clickable(onClick = onClick),
    )
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

@Composable
private fun SceneButton(label: String, active: Boolean, enabled: Boolean, onClick: () -> Unit) {
    if (active) {
        Button(onClick = onClick, enabled = enabled, modifier = Modifier.width(130.dp)) {
            Text(label)
        }
    } else {
        OutlinedButton(onClick = onClick, enabled = enabled, modifier = Modifier.width(130.dp)) {
            Text(label)
        }
    }
}
