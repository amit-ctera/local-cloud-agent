package com.cursoragent.chat.data

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.flow.flowOn
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

sealed class AgentEvent {
    data class SessionStarted(val sessionId: String) : AgentEvent()
    data class Data(val text: String) : AgentEvent()
    data class Done(val exitCode: Int, val sessionId: String?) : AgentEvent()
    data class ToolStatus(val name: String, val status: String) : AgentEvent()
    data class Queued(val position: Int) : AgentEvent()
    data class Error(val message: String) : AgentEvent()
    data object SessionExpired : AgentEvent()
}

class AgentRepository {

    private val client = OkHttpClient.Builder()
        .connectTimeout(10, TimeUnit.SECONDS)
        .readTimeout(0, TimeUnit.SECONDS)
        .writeTimeout(10, TimeUnit.SECONDS)
        .build()

    private val json = Json { ignoreUnknownKeys = true }

    fun runAgent(
        serverUrl: String,
        projectPath: String,
        prompt: String,
        model: String?,
        accessToken: String,
        sessionId: String? = null,
    ): Flow<AgentEvent> = flow {
        val bodyMap = buildMap {
            put("projectPath", projectPath)
            put("prompt", prompt)
            if (!model.isNullOrBlank()) put("model", model)
            if (!sessionId.isNullOrBlank()) put("sessionId", sessionId)
        }
        val bodyJson = json.encodeToString(
            kotlinx.serialization.serializer<Map<String, String>>(),
            bodyMap,
        )
        val request = Request.Builder()
            .url("${serverUrl.trimEnd('/')}/run?stream=true")
            .header("Authorization", "Bearer $accessToken")
            .post(bodyJson.toRequestBody("application/json".toMediaType()))
            .build()

        val response = try {
            client.newCall(request).execute()
        } catch (e: IOException) {
            emit(AgentEvent.Error("Cannot reach server: ${e.message}"))
            return@flow
        }

        if (response.code == 401) {
            emit(AgentEvent.SessionExpired)
            response.close()
            return@flow
        }

        if (!response.isSuccessful) {
            val errorBody = response.body?.string() ?: "Unknown error"
            emit(AgentEvent.Error("Server error ${response.code}: $errorBody"))
            response.close()
            return@flow
        }

        val source = response.body?.source()
        if (source == null) {
            emit(AgentEvent.Error("Empty response body"))
            response.close()
            return@flow
        }

        try {
            var currentEvent = ""
            while (!source.exhausted()) {
                val line = source.readUtf8Line() ?: break

                if (line.startsWith("event: ")) {
                    currentEvent = line.removePrefix("event: ").trim()
                    continue
                }

                if (!line.startsWith("data: ")) continue
                val payload = line.removePrefix("data: ")

                when (currentEvent) {
                    "started" -> {
                        try {
                            val obj = json.decodeFromString<JsonObject>(payload)
                            val sid = obj["sessionId"]?.jsonPrimitive?.contentOrNull ?: ""
                            emit(AgentEvent.SessionStarted(sid))
                        } catch (_: Exception) {
                            emit(AgentEvent.SessionStarted(""))
                        }
                    }
                    "done" -> {
                        try {
                            val obj = json.decodeFromString<JsonObject>(payload)
                            val exitCode = obj["exitCode"]?.jsonPrimitive?.intOrNull ?: -1
                            val sid = obj["sessionId"]?.jsonPrimitive?.contentOrNull
                            emit(AgentEvent.Done(exitCode, sid))
                        } catch (_: Exception) {
                            emit(AgentEvent.Done(-1, null))
                        }
                    }
                    "tool" -> {
                        try {
                            val obj = json.decodeFromString<JsonObject>(payload)
                            val name = obj["name"]?.jsonPrimitive?.contentOrNull ?: "unknown"
                            val status = obj["status"]?.jsonPrimitive?.contentOrNull ?: "unknown"
                            emit(AgentEvent.ToolStatus(name, status))
                        } catch (_: Exception) {
                            // skip malformed tool events
                        }
                    }
                    "queued" -> {
                        try {
                            val obj = json.decodeFromString<JsonObject>(payload)
                            val position = obj["position"]?.jsonPrimitive?.intOrNull ?: 0
                            emit(AgentEvent.Queued(position))
                        } catch (_: Exception) {
                            emit(AgentEvent.Queued(0))
                        }
                    }
                    "error" -> {
                        emit(AgentEvent.Error(payload))
                    }
                    else -> {
                        val text = try {
                            json.decodeFromString<String>(payload)
                        } catch (_: Exception) {
                            payload
                        }
                        if (text.isNotBlank()) {
                            emit(AgentEvent.Data(text))
                        }
                    }
                }
                currentEvent = ""
            }
        } catch (e: IOException) {
            emit(AgentEvent.Error("Connection lost: ${e.message}"))
        } finally {
            response.close()
        }
    }.flowOn(Dispatchers.IO)
}
