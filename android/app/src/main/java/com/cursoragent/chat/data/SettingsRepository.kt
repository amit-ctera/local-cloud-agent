package com.cursoragent.chat.data

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map

private val Context.dataStore: DataStore<Preferences> by preferencesDataStore(name = "settings")

class SettingsRepository(private val context: Context) {

    companion object {
        private val KEY_PROJECT_PATH = stringPreferencesKey("project_path")
        private val KEY_MODEL = stringPreferencesKey("model")

        const val DEFAULT_MODEL = "gpt-5.2"
    }

    val projectPath: Flow<String> = context.dataStore.data.map { prefs ->
        prefs[KEY_PROJECT_PATH] ?: ""
    }

    val model: Flow<String> = context.dataStore.data.map { prefs ->
        prefs[KEY_MODEL] ?: DEFAULT_MODEL
    }

    suspend fun setProjectPath(path: String) {
        context.dataStore.edit { it[KEY_PROJECT_PATH] = path }
    }

    suspend fun setModel(model: String) {
        context.dataStore.edit { it[KEY_MODEL] = model }
    }
}
