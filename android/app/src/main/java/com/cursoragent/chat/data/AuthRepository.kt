package com.cursoragent.chat.data

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

sealed class AuthResult {
    data class Success(
        val accessToken: String,
        val refreshToken: String,
        val expiresIn: Int,
    ) : AuthResult()

    data class Error(val message: String, val code: Int = 0) : AuthResult()
}

class AuthRepository {

    private val client = OkHttpClient.Builder()
        .connectTimeout(10, TimeUnit.SECONDS)
        .readTimeout(10, TimeUnit.SECONDS)
        .writeTimeout(10, TimeUnit.SECONDS)
        .build()

    private val json = Json { ignoreUnknownKeys = true }

    suspend fun signup(
        serverUrl: String,
        email: String,
        password: String,
        cursorToken: String,
    ): AuthResult {
        return authRequest(serverUrl, "/auth/signup", buildMap {
            put("email", email)
            put("password", password)
            put("cursorToken", cursorToken)
        })
    }

    suspend fun signin(
        serverUrl: String,
        email: String,
        password: String,
    ): AuthResult {
        return authRequest(serverUrl, "/auth/signin", mapOf(
            "email" to email,
            "password" to password,
        ))
    }

    suspend fun signout(
        serverUrl: String,
        accessToken: String,
        refreshToken: String,
    ): Boolean {
        return try {
            val bodyJson = json.encodeToString(
                kotlinx.serialization.serializer<Map<String, String>>(),
                mapOf("refreshToken" to refreshToken),
            )
            val request = Request.Builder()
                .url("${serverUrl.trimEnd('/')}/auth/signout")
                .header("Authorization", "Bearer $accessToken")
                .post(bodyJson.toRequestBody("application/json".toMediaType()))
                .build()
            val response = client.newCall(request).execute()
            val success = response.isSuccessful
            response.close()
            success
        } catch (_: IOException) {
            false
        }
    }

    suspend fun updateCursorToken(
        serverUrl: String,
        accessToken: String,
        cursorToken: String,
    ): AuthResult {
        return try {
            val bodyJson = json.encodeToString(
                kotlinx.serialization.serializer<Map<String, String>>(),
                mapOf("cursorToken" to cursorToken),
            )
            val request = Request.Builder()
                .url("${serverUrl.trimEnd('/')}/auth/cursor-token")
                .header("Authorization", "Bearer $accessToken")
                .put(bodyJson.toRequestBody("application/json".toMediaType()))
                .build()
            val response = client.newCall(request).execute()
            val body = response.body?.string() ?: ""
            response.close()
            if (response.isSuccessful) {
                AuthResult.Success("", "", 0)
            } else {
                val errorMsg = try {
                    json.decodeFromString<JsonObject>(body)["error"]?.jsonPrimitive?.contentOrNull
                } catch (_: Exception) { null }
                AuthResult.Error(errorMsg ?: "Failed to update token", response.code)
            }
        } catch (e: IOException) {
            AuthResult.Error("Cannot reach server: ${e.message}")
        }
    }

    private fun authRequest(
        serverUrl: String,
        path: String,
        bodyMap: Map<String, String>,
    ): AuthResult {
        return try {
            val bodyJson = json.encodeToString(
                kotlinx.serialization.serializer<Map<String, String>>(),
                bodyMap,
            )
            val request = Request.Builder()
                .url("${serverUrl.trimEnd('/')}$path")
                .post(bodyJson.toRequestBody("application/json".toMediaType()))
                .build()

            val response = client.newCall(request).execute()
            val body = response.body?.string() ?: ""
            response.close()

            if (response.isSuccessful) {
                val obj = json.decodeFromString<JsonObject>(body)
                val accessToken = obj["accessToken"]?.jsonPrimitive?.contentOrNull
                    ?: return AuthResult.Error("Invalid response: missing accessToken")
                val refreshToken = obj["refreshToken"]?.jsonPrimitive?.contentOrNull
                    ?: return AuthResult.Error("Invalid response: missing refreshToken")
                val expiresIn = obj["expiresIn"]?.jsonPrimitive?.intOrNull ?: 900
                AuthResult.Success(accessToken, refreshToken, expiresIn)
            } else {
                val errorMsg = try {
                    json.decodeFromString<JsonObject>(body)["error"]?.jsonPrimitive?.contentOrNull
                } catch (_: Exception) { null }
                AuthResult.Error(errorMsg ?: "Server error ${response.code}", response.code)
            }
        } catch (e: IOException) {
            AuthResult.Error("Cannot reach server: ${e.message}")
        }
    }
}
