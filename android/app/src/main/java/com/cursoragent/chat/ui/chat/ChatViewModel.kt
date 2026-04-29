package com.cursoragent.chat.ui.chat

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.cursoragent.chat.data.AgentEvent
import com.cursoragent.chat.data.AgentRepository
import com.cursoragent.chat.data.Message
import com.cursoragent.chat.data.MessageRole
import com.cursoragent.chat.data.SettingsRepository
import com.cursoragent.chat.data.TokenManager
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class ChatUiState(
    val messages: List<Message> = emptyList(),
    val isAgentRunning: Boolean = false,
    val projectPath: String = "",
    val model: String = "",
    val sessionId: String? = null,
)

class ChatViewModel(application: Application) : AndroidViewModel(application) {

    private val agentRepository = AgentRepository()
    private val settingsRepository = SettingsRepository(application)
    private val tokenManager = TokenManager(application)

    private val _uiState = MutableStateFlow(ChatUiState())
    val uiState: StateFlow<ChatUiState> = _uiState.asStateFlow()

    private val _sessionExpired = MutableSharedFlow<Unit>()
    val sessionExpired: SharedFlow<Unit> = _sessionExpired.asSharedFlow()

    private var agentJob: Job? = null

    init {
        viewModelScope.launch {
            val path = settingsRepository.projectPath.first()
            val model = settingsRepository.model.first()
            _uiState.update { it.copy(projectPath = path, model = model) }
        }
    }

    fun refreshSettings() {
        viewModelScope.launch {
            val path = settingsRepository.projectPath.first()
            val model = settingsRepository.model.first()
            _uiState.update { it.copy(projectPath = path, model = model) }
        }
    }

    fun sendPrompt(prompt: String) {
        if (prompt.isBlank() || _uiState.value.isAgentRunning) return

        val userMessage = Message(role = MessageRole.USER, text = prompt.trim())
        val agentMessage = Message(role = MessageRole.AGENT, text = "", isStreaming = true)

        _uiState.update {
            it.copy(
                messages = it.messages + userMessage + agentMessage,
                isAgentRunning = true,
            )
        }

        agentJob = viewModelScope.launch {
            val serverUrl = tokenManager.getStoredServerUrl()
            val projectPath = settingsRepository.projectPath.first()
            val model = settingsRepository.model.first()
            val currentSessionId = _uiState.value.sessionId
            _uiState.update { it.copy(projectPath = projectPath, model = model) }

            if (serverUrl.isNullOrBlank()) {
                updateLastAgent("Error: Not connected to a server. Sign in first.", isError = true)
                return@launch
            }

            if (projectPath.isBlank()) {
                updateLastAgent("Error: Project path not set. Go to Settings.", isError = true)
                return@launch
            }

            val accessToken = tokenManager.getValidAccessToken()
            if (accessToken == null) {
                updateLastAgent("Error: Session expired. Please sign in again.", isError = true)
                _sessionExpired.emit(Unit)
                return@launch
            }

            val accumulated = StringBuilder()

            agentRepository.runAgent(serverUrl, projectPath, prompt.trim(), model, accessToken, currentSessionId)
                .collect { event ->
                    when (event) {
                        is AgentEvent.SessionStarted -> {
                            if (event.sessionId.isNotBlank()) {
                                _uiState.update { it.copy(sessionId = event.sessionId) }
                            }
                            updateLastAgent("Agent started...", streaming = true)
                        }
                        is AgentEvent.Data -> {
                            accumulated.append(event.text)
                            updateLastAgent(accumulated.toString(), streaming = true)
                        }
                        is AgentEvent.ToolStatus -> {
                            val icon = if (event.status == "started") "\u2699" else "\u2713"
                            val toolLine = "\n$icon ${event.name}"
                            accumulated.append(toolLine)
                            updateLastAgent(accumulated.toString(), streaming = true)
                        }
                        is AgentEvent.Done -> {
                            if (!event.sessionId.isNullOrBlank()) {
                                _uiState.update { it.copy(sessionId = event.sessionId) }
                            }
                            val suffix = "\n\n[Agent finished with exit code ${event.exitCode}]"
                            accumulated.append(suffix)
                            updateLastAgent(accumulated.toString(), streaming = false)
                        }
                        is AgentEvent.Queued -> {
                            updateLastAgent(
                                "Queued (position ${event.position}). Waiting...",
                                streaming = true,
                            )
                        }
                        is AgentEvent.Error -> {
                            val text = if (accumulated.isEmpty()) event.message
                                       else "$accumulated\n\n[Error: ${event.message}]"
                            updateLastAgent(text, isError = true)
                        }
                        is AgentEvent.SessionExpired -> {
                            updateLastAgent("Session expired. Please sign in again.", isError = true)
                            tokenManager.clearTokens()
                            _sessionExpired.emit(Unit)
                        }
                    }
                }
        }
    }

    private fun updateLastAgent(text: String, streaming: Boolean = false, isError: Boolean = false) {
        _uiState.update { state ->
            val messages = state.messages.toMutableList()
            val lastIndex = messages.indexOfLast { it.role == MessageRole.AGENT }
            if (lastIndex >= 0) {
                messages[lastIndex] = messages[lastIndex].copy(
                    text = text,
                    isStreaming = streaming && !isError,
                    isError = isError,
                )
            }
            state.copy(
                messages = messages,
                isAgentRunning = streaming && !isError,
            )
        }
    }

    fun clearChat() {
        agentJob?.cancel()
        _uiState.update { it.copy(messages = emptyList(), isAgentRunning = false, sessionId = null) }
    }
}
