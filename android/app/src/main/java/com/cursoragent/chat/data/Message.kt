package com.cursoragent.chat.data

import java.util.UUID

enum class MessageRole { USER, AGENT }

data class Message(
    val id: String = UUID.randomUUID().toString(),
    val role: MessageRole,
    val text: String,
    val timestamp: Long = System.currentTimeMillis(),
    val isStreaming: Boolean = false,
    val isError: Boolean = false,
)
