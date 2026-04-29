package com.cursoragent.chat.ui.settings

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SettingsScreen(
    viewModel: SettingsViewModel,
    onBack: () -> Unit,
    onSignedOut: () -> Unit,
) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Settings") },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = MaterialTheme.colorScheme.surfaceContainerHigh,
                ),
            )
        },
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(horizontal = 16.dp)
                .verticalScroll(rememberScrollState()),
        ) {
            Spacer(Modifier.height(16.dp))

            // Account info
            Text(
                text = "Account",
                style = MaterialTheme.typography.titleMedium,
                color = MaterialTheme.colorScheme.primary,
            )
            Spacer(Modifier.height(8.dp))

            if (state.userEmail.isNotBlank()) {
                Text(
                    text = "Signed in as ${state.userEmail}",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }

            Spacer(Modifier.height(12.dp))

            OutlinedTextField(
                value = state.serverUrl,
                onValueChange = viewModel::onServerUrlChange,
                label = { Text("Server URL") },
                placeholder = { Text("https://abcd-1234.ngrok-free.app") },
                modifier = Modifier.fillMaxWidth(),
                singleLine = true,
                supportingText = { Text("Update when ngrok URL changes after server restart") },
            )

            Spacer(Modifier.height(24.dp))
            HorizontalDivider()
            Spacer(Modifier.height(16.dp))

            // Agent configuration
            Text(
                text = "Agent Configuration",
                style = MaterialTheme.typography.titleMedium,
                color = MaterialTheme.colorScheme.primary,
            )
            Spacer(Modifier.height(8.dp))

            OutlinedTextField(
                value = state.projectPath,
                onValueChange = viewModel::onProjectPathChange,
                label = { Text("Project Path") },
                placeholder = { Text("C:\\Dev\\my-project") },
                modifier = Modifier.fillMaxWidth(),
                singleLine = true,
                supportingText = { Text("Absolute path to the project on the PC") },
            )

            Spacer(Modifier.height(12.dp))

            OutlinedTextField(
                value = state.model,
                onValueChange = viewModel::onModelChange,
                label = { Text("Model") },
                placeholder = { Text("gpt-5.2") },
                modifier = Modifier.fillMaxWidth(),
                singleLine = true,
                supportingText = { Text("AI model (e.g. gpt-5.2, claude-sonnet, auto)") },
            )

            Spacer(Modifier.height(12.dp))

            Button(
                onClick = {
                    viewModel.save()
                    onBack()
                },
                modifier = Modifier.fillMaxWidth(),
            ) {
                Text("Save")
            }

            if (state.saved) {
                Spacer(Modifier.height(8.dp))
                Text(
                    text = "Settings saved",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.tertiary,
                )
            }

            Spacer(Modifier.height(24.dp))
            HorizontalDivider()
            Spacer(Modifier.height(16.dp))

            // Update Cursor Token
            Text(
                text = "Update Cursor API Key",
                style = MaterialTheme.typography.titleMedium,
                color = MaterialTheme.colorScheme.primary,
            )
            Spacer(Modifier.height(8.dp))

            OutlinedTextField(
                value = state.newCursorToken,
                onValueChange = viewModel::onNewCursorTokenChange,
                label = { Text("New Cursor API Key") },
                modifier = Modifier.fillMaxWidth(),
                singleLine = true,
                supportingText = { Text("Generate a new key in Cursor and paste it here") },
            )

            Spacer(Modifier.height(8.dp))

            OutlinedButton(
                onClick = { viewModel.updateCursorToken() },
                modifier = Modifier.fillMaxWidth(),
                enabled = !state.cursorTokenUpdating && state.newCursorToken.isNotBlank(),
            ) {
                if (state.cursorTokenUpdating) {
                    CircularProgressIndicator(
                        modifier = Modifier.height(18.dp),
                        strokeWidth = 2.dp,
                    )
                } else {
                    Text("Update Token")
                }
            }

            if (state.cursorTokenMessage != null) {
                Spacer(Modifier.height(4.dp))
                Text(
                    text = state.cursorTokenMessage!!,
                    style = MaterialTheme.typography.bodySmall,
                    color = if (state.cursorTokenMessage!!.contains("success", ignoreCase = true))
                        MaterialTheme.colorScheme.tertiary
                    else MaterialTheme.colorScheme.error,
                )
            }

            Spacer(Modifier.height(24.dp))
            HorizontalDivider()
            Spacer(Modifier.height(16.dp))

            // Sign out
            Button(
                onClick = { viewModel.signOut(onSignedOut) },
                modifier = Modifier.fillMaxWidth(),
                enabled = !state.signOutLoading,
                colors = ButtonDefaults.buttonColors(
                    containerColor = MaterialTheme.colorScheme.error,
                ),
            ) {
                if (state.signOutLoading) {
                    CircularProgressIndicator(
                        modifier = Modifier.height(18.dp),
                        strokeWidth = 2.dp,
                        color = MaterialTheme.colorScheme.onError,
                    )
                } else {
                    Text("Sign Out")
                }
            }

            Spacer(Modifier.height(32.dp))
        }
    }
}
