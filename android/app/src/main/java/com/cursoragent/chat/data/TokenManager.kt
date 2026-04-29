package com.cursoragent.chat.data

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.longPreferencesKey
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.jsonPrimitive
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import java.io.IOException
import java.util.concurrent.TimeUnit

private val Context.tokenStore: DataStore<Preferences> by preferencesDataStore(name = "auth_tokens")

class TokenManager(private val context: Context) {

    companion object {
        private val KEY_ACCESS_TOKEN = stringPreferencesKey("access_token")
        private val KEY_REFRESH_TOKEN = stringPreferencesKey("refresh_token")
        private val KEY_EXPIRES_AT = longPreferencesKey("access_token_expires_at")
        private val KEY_SERVER_URL = stringPreferencesKey("auth_server_url")
        private val KEY_USER_EMAIL = stringPreferencesKey("user_email")

        private const val EXPIRY_BUFFER_MS = 60_000L // Refresh 1 min before actual expiry
    }

    private val client = OkHttpClient.Builder()
        .connectTimeout(10, TimeUnit.SECONDS)
        .readTimeout(10, TimeUnit.SECONDS)
        .writeTimeout(10, TimeUnit.SECONDS)
        .build()

    private val json = Json { ignoreUnknownKeys = true }
    private val refreshMutex = Mutex()

    val isLoggedIn: Flow<Boolean> = context.tokenStore.data.map { prefs ->
        !prefs[KEY_REFRESH_TOKEN].isNullOrBlank()
    }

    val userEmail: Flow<String> = context.tokenStore.data.map { prefs ->
        prefs[KEY_USER_EMAIL] ?: ""
    }

    val serverUrl: Flow<String> = context.tokenStore.data.map { prefs ->
        prefs[KEY_SERVER_URL] ?: ""
    }

    suspend fun storeTokens(
        accessToken: String,
        refreshToken: String,
        expiresInSeconds: Int,
        serverUrl: String? = null,
        email: String? = null,
    ) {
        val expiresAt = System.currentTimeMillis() + (expiresInSeconds * 1000L)
        context.tokenStore.edit { prefs ->
            prefs[KEY_ACCESS_TOKEN] = accessToken
            prefs[KEY_REFRESH_TOKEN] = refreshToken
            prefs[KEY_EXPIRES_AT] = expiresAt
            if (serverUrl != null) prefs[KEY_SERVER_URL] = serverUrl
            if (email != null) prefs[KEY_USER_EMAIL] = email
        }
    }

    suspend fun getValidAccessToken(): String? {
        val prefs = context.tokenStore.data.first()
        val accessToken = prefs[KEY_ACCESS_TOKEN] ?: return null
        val expiresAt = prefs[KEY_EXPIRES_AT] ?: 0L

        if (System.currentTimeMillis() < expiresAt - EXPIRY_BUFFER_MS) {
            return accessToken
        }

        return refreshAccessToken()
    }

    private suspend fun refreshAccessToken(): String? = refreshMutex.withLock {
        val prefs = context.tokenStore.data.first()
        val accessToken = prefs[KEY_ACCESS_TOKEN]
        val expiresAt = prefs[KEY_EXPIRES_AT] ?: 0L

        // Double-check after acquiring mutex (another coroutine may have refreshed)
        if (accessToken != null && System.currentTimeMillis() < expiresAt - EXPIRY_BUFFER_MS) {
            return accessToken
        }

        val refreshToken = prefs[KEY_REFRESH_TOKEN] ?: return null
        val baseUrl = prefs[KEY_SERVER_URL] ?: return null

        try {
            val bodyJson = json.encodeToString(
                kotlinx.serialization.serializer<Map<String, String>>(),
                mapOf("refreshToken" to refreshToken),
            )
            val request = Request.Builder()
                .url("${baseUrl.trimEnd('/')}/auth/refresh")
                .post(bodyJson.toRequestBody("application/json".toMediaType()))
                .build()

            val response = client.newCall(request).execute()
            if (!response.isSuccessful) {
                if (response.code == 401) {
                    clearTokens()
                }
                response.close()
                return null
            }

            val body = response.body?.string() ?: return null
            response.close()

            val obj = json.decodeFromString<JsonObject>(body)
            val newAccessToken = obj["accessToken"]?.jsonPrimitive?.contentOrNull ?: return null
            val newRefreshToken = obj["refreshToken"]?.jsonPrimitive?.contentOrNull ?: return null
            val newExpiresIn = obj["expiresIn"]?.jsonPrimitive?.intOrNull ?: 900

            storeTokens(newAccessToken, newRefreshToken, newExpiresIn)
            return newAccessToken
        } catch (_: IOException) {
            return null
        } catch (_: Exception) {
            return null
        }
    }

    suspend fun getRefreshToken(): String? {
        return context.tokenStore.data.first()[KEY_REFRESH_TOKEN]
    }

    suspend fun getStoredServerUrl(): String? {
        return context.tokenStore.data.first()[KEY_SERVER_URL]
    }

    suspend fun clearTokens() {
        context.tokenStore.edit { prefs ->
            prefs.remove(KEY_ACCESS_TOKEN)
            prefs.remove(KEY_REFRESH_TOKEN)
            prefs.remove(KEY_EXPIRES_AT)
            prefs.remove(KEY_USER_EMAIL)
        }
    }
}
