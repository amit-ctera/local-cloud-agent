package com.cursoragent.chat.ui.settings

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.cursoragent.chat.data.AuthRepository
import com.cursoragent.chat.data.AuthResult
import com.cursoragent.chat.data.SettingsRepository
import com.cursoragent.chat.data.TokenManager
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class SettingsUiState(
    val serverUrl: String = "",
    val projectPath: String = "",
    val model: String = SettingsRepository.DEFAULT_MODEL,
    val userEmail: String = "",
    val newCursorToken: String = "",
    val saved: Boolean = false,
    val signOutLoading: Boolean = false,
    val cursorTokenUpdating: Boolean = false,
    val cursorTokenMessage: String? = null,
)

class SettingsViewModel(application: Application) : AndroidViewModel(application) {

    private val settingsRepository = SettingsRepository(application)
    private val tokenManager = TokenManager(application)
    private val authRepository = AuthRepository()

    private val _uiState = MutableStateFlow(SettingsUiState())
    val uiState: StateFlow<SettingsUiState> = _uiState.asStateFlow()

    init {
        viewModelScope.launch {
            val serverUrl = tokenManager.getStoredServerUrl() ?: ""
            val email = tokenManager.userEmail.first()
            _uiState.update {
                it.copy(
                    serverUrl = serverUrl,
                    projectPath = settingsRepository.projectPath.first(),
                    model = settingsRepository.model.first(),
                    userEmail = email,
                )
            }
        }
    }

    fun onServerUrlChange(value: String) {
        _uiState.update { it.copy(serverUrl = value, saved = false) }
    }

    fun onProjectPathChange(value: String) {
        _uiState.update { it.copy(projectPath = value, saved = false) }
    }

    fun onModelChange(value: String) {
        _uiState.update { it.copy(model = value, saved = false) }
    }

    fun onNewCursorTokenChange(value: String) {
        _uiState.update { it.copy(newCursorToken = value, cursorTokenMessage = null) }
    }

    fun save() {
        viewModelScope.launch {
            val state = _uiState.value
            tokenManager.updateServerUrl(state.serverUrl.trim())
            settingsRepository.setProjectPath(state.projectPath.trim())
            settingsRepository.setModel(state.model.trim())
            _uiState.update { it.copy(saved = true) }
        }
    }

    fun updateCursorToken() {
        val state = _uiState.value
        if (state.newCursorToken.isBlank()) {
            _uiState.update { it.copy(cursorTokenMessage = "Token cannot be empty") }
            return
        }

        _uiState.update { it.copy(cursorTokenUpdating = true, cursorTokenMessage = null) }

        viewModelScope.launch {
            val serverUrl = tokenManager.getStoredServerUrl() ?: ""
            val accessToken = tokenManager.getValidAccessToken()

            if (accessToken == null) {
                _uiState.update {
                    it.copy(cursorTokenUpdating = false, cursorTokenMessage = "Session expired. Sign in again.")
                }
                return@launch
            }

            when (val result = authRepository.updateCursorToken(serverUrl, accessToken, state.newCursorToken.trim())) {
                is AuthResult.Success -> {
                    _uiState.update {
                        it.copy(
                            cursorTokenUpdating = false,
                            cursorTokenMessage = "Cursor token updated successfully",
                            newCursorToken = "",
                        )
                    }
                }
                is AuthResult.Error -> {
                    _uiState.update {
                        it.copy(cursorTokenUpdating = false, cursorTokenMessage = result.message)
                    }
                }
            }
        }
    }

    fun signOut(onComplete: () -> Unit) {
        _uiState.update { it.copy(signOutLoading = true) }

        viewModelScope.launch {
            val serverUrl = tokenManager.getStoredServerUrl() ?: ""
            val accessToken = tokenManager.getValidAccessToken()
            val refreshToken = tokenManager.getRefreshToken()

            if (accessToken != null && refreshToken != null) {
                authRepository.signout(serverUrl, accessToken, refreshToken)
            }

            tokenManager.clearTokens()
            _uiState.update { it.copy(signOutLoading = false) }
            onComplete()
        }
    }
}
