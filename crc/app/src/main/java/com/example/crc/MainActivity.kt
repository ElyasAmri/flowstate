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
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
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
import androidx.compose.runtime.mutableIntStateOf
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

// Slide titles + their horizontal index in the deck (all top-level, v = 0).
private val MAIN_SLIDES = listOf(
    "Title", "Problem", "Root cause", "Architecture", "Demo",
    "Fanar integrations", "Evaluation", "Improving Fanar", "Close",
)
private val APPENDIX_SLIDES = listOf(
    "Eval design", "Node taxonomy", "Refinement", "Why it matters", "Governance", "Tech stack",
)
private const val APPENDIX_OFFSET = 9 // first appendix slide's index in the deck

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            CRCTheme {
                App()
            }
        }
    }
}

@Composable
fun App() {
    val context = LocalContext.current
    val prefs = remember { Prefs(context) }
    val relay = remember { RemoteClient() }
    DisposableEffect(Unit) { onDispose { relay.disconnect() } }

    var relayUrl by remember { mutableStateOf(prefs.relayUrl) }
    var showSettings by rememberSaveable { mutableStateOf(false) }

    // Auto-connect on launch and whenever the relay address changes.
    LaunchedEffect(relayUrl) { relay.connect(relayUrl) }

    if (showSettings) {
        SettingsScreen(
            relay = relay,
            initialRelay = relayUrl,
            onSave = { r ->
                relayUrl = r.trim().also { prefs.relayUrl = it }
                showSettings = false
            },
            onBack = { showSettings = false },
        )
    } else {
        HomeScreen(
            relay = relay,
            onReconnect = { relay.connect(relayUrl) },
            onOpenSettings = { showSettings = true },
        )
    }
}

@Composable
private fun HomeScreen(
    relay: RemoteClient,
    onReconnect: () -> Unit,
    onOpenSettings: () -> Unit,
) {
    var tab by rememberSaveable { mutableIntStateOf(0) }
    Scaffold(
        modifier = Modifier.fillMaxSize(),
        bottomBar = {
            NavigationBar {
                NavigationBarItem(
                    selected = tab == 0,
                    onClick = { tab = 0 },
                    icon = { Text("◉", fontSize = 18.sp) },
                    label = { Text("Controls") },
                )
                NavigationBarItem(
                    selected = tab == 1,
                    onClick = { tab = 1 },
                    icon = { Text("▤", fontSize = 18.sp) },
                    label = { Text("Main") },
                )
                NavigationBarItem(
                    selected = tab == 2,
                    onClick = { tab = 2 },
                    icon = { Text("⋯", fontSize = 18.sp) },
                    label = { Text("Appendix") },
                )
            }
        },
    ) { innerPadding ->
        Box(modifier = Modifier.padding(innerPadding).fillMaxSize()) {
            when (tab) {
                0 -> ControlsTab(relay, onReconnect, onOpenSettings)
                1 -> SlidesTab(relay, MAIN_SLIDES, 0)
                else -> SlidesTab(relay, APPENDIX_SLIDES, APPENDIX_OFFSET)
            }
        }
    }
}

@Composable
private fun ControlsTab(
    relay: RemoteClient,
    onReconnect: () -> Unit,
    onOpenSettings: () -> Unit,
) {
    val relayState by relay.state.collectAsState()
    val position by relay.position.collectAsState()
    val connected = relayState == ConnState.Connected

    Column(
        modifier = Modifier.fillMaxSize().padding(20.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        // Status dot (tap to reconnect) + settings.
        Row(
            verticalAlignment = Alignment.CenterVertically,
            modifier = Modifier.fillMaxWidth(),
        ) {
            StatusDot(relayState, onReconnect)
            Spacer(Modifier.weight(1f))
            TextButton(onClick = onOpenSettings) { Text("Settings") }
        }

        Spacer(Modifier.weight(1f))

        val where = position?.let { p ->
            if (p.overview) "overview" else "${p.h + 1} / ${p.total}"
        } ?: "--"
        Text(where, style = MaterialTheme.typography.displaySmall)

        Spacer(Modifier.height(4.dp))

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
    }
}

@Composable
private fun SlidesTab(relay: RemoteClient, titles: List<String>, offset: Int) {
    val relayState by relay.state.collectAsState()
    val position by relay.position.collectAsState()
    val enabled = relayState == ConnState.Connected

    LazyColumn(
        modifier = Modifier.fillMaxSize().padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        itemsIndexed(titles) { i, title ->
            val h = offset + i
            val active = position?.h == h
            SlideButton(
                label = "${h + 1}.  $title",
                active = active,
                enabled = enabled,
                onClick = { relay.goto(h) },
            )
        }
    }
}

@Composable
private fun SlideButton(label: String, active: Boolean, enabled: Boolean, onClick: () -> Unit) {
    if (active) {
        Button(onClick = onClick, enabled = enabled, modifier = Modifier.fillMaxWidth()) {
            Text(label, modifier = Modifier.fillMaxWidth(), textAlign = TextAlign.Start)
        }
    } else {
        OutlinedButton(onClick = onClick, enabled = enabled, modifier = Modifier.fillMaxWidth()) {
            Text(label, modifier = Modifier.fillMaxWidth(), textAlign = TextAlign.Start)
        }
    }
}

@Composable
private fun SettingsScreen(
    relay: RemoteClient,
    initialRelay: String,
    onSave: (String) -> Unit,
    onBack: () -> Unit,
) {
    val relayState by relay.state.collectAsState()
    var relayDraft by rememberSaveable { mutableStateOf(initialRelay) }

    Column(
        modifier = Modifier.fillMaxSize().padding(20.dp),
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

        Button(
            onClick = { onSave(relayDraft) },
            enabled = relayDraft.isNotBlank(),
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
