package com.cursoragent.chat.ui.auth

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.cursoragent.chat.data.AuthRepository
import com.cursoragent.chat.data.AuthResult
import com.cursoragent.chat.data.TokenManager
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class SigninUiState(
    val serverUrl: String = "",
    val email: String = "",
    val password: String = "",
    val isLoading: Boolean = false,
    val error: String? = null,
    val success: Boolean = false,
)

class SigninViewModel(application: Application) : AndroidViewModel(application) {

    private val authRepository = AuthRepository()
    val tokenManager = TokenManager(application)

    private val _uiState = MutableStateFlow(SigninUiState())
    val uiState: StateFlow<SigninUiState> = _uiState.asStateFlow()

    init {
        viewModelScope.launch {
            val savedUrl = tokenManager.getStoredServerUrl()
            if (!savedUrl.isNullOrBlank()) {
                _uiState.update { it.copy(serverUrl = savedUrl) }
            }
        }
    }

    fun onServerUrlChange(value: String) = _uiState.update { it.copy(serverUrl = value, error = null) }
    fun onEmailChange(value: String) = _uiState.update { it.copy(email = value, error = null) }
    fun onPasswordChange(value: String) = _uiState.update { it.copy(password = value, error = null) }

    fun signin() {
        val state = _uiState.value
        if (state.serverUrl.isBlank() || state.email.isBlank() || state.password.isBlank()) {
            _uiState.update { it.copy(error = "All fields are required") }
            return
        }

        _uiState.update { it.copy(isLoading = true, error = null) }

        viewModelScope.launch {
            when (val result = authRepository.signin(state.serverUrl.trim(), state.email.trim(), state.password)) {
                is AuthResult.Success -> {
                    tokenManager.storeTokens(
                        accessToken = result.accessToken,
                        refreshToken = result.refreshToken,
                        expiresInSeconds = result.expiresIn,
                        serverUrl = state.serverUrl.trim(),
                        email = state.email.trim(),
                    )
                    _uiState.update { it.copy(isLoading = false, success = true) }
                }
                is AuthResult.Error -> {
                    _uiState.update { it.copy(isLoading = false, error = result.message) }
                }
            }
        }
    }
}
