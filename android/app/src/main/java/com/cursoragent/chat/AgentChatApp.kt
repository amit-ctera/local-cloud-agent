package com.cursoragent.chat

import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.platform.LocalContext
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import com.cursoragent.chat.data.TokenManager
import com.cursoragent.chat.ui.auth.SigninScreen
import com.cursoragent.chat.ui.auth.SigninViewModel
import com.cursoragent.chat.ui.auth.SignupScreen
import com.cursoragent.chat.ui.auth.SignupViewModel
import com.cursoragent.chat.ui.chat.ChatScreen
import com.cursoragent.chat.ui.chat.ChatViewModel
import com.cursoragent.chat.ui.settings.SettingsScreen
import com.cursoragent.chat.ui.settings.SettingsViewModel

@Composable
fun AgentChatApp() {
    val navController = rememberNavController()
    val context = LocalContext.current
    val tokenManager = TokenManager(context)
    val isLoggedIn by tokenManager.isLoggedIn.collectAsState(initial = false)

    val startDestination = if (isLoggedIn) "chat" else "signin"

    NavHost(navController = navController, startDestination = startDestination) {
        composable("signin") {
            val signinViewModel: SigninViewModel = viewModel()
            SigninScreen(
                viewModel = signinViewModel,
                onSigninSuccess = {
                    navController.navigate("chat") {
                        popUpTo("signin") { inclusive = true }
                    }
                },
                onNavigateToSignup = { navController.navigate("signup") },
            )
        }
        composable("signup") {
            val signupViewModel: SignupViewModel = viewModel()
            SignupScreen(
                viewModel = signupViewModel,
                onSignupSuccess = {
                    navController.navigate("chat") {
                        popUpTo("signin") { inclusive = true }
                    }
                },
                onNavigateToSignin = { navController.popBackStack() },
            )
        }
        composable("chat") {
            val chatViewModel: ChatViewModel = viewModel()
            ChatScreen(
                viewModel = chatViewModel,
                onNavigateToSettings = { navController.navigate("settings") },
            )
        }
        composable("settings") {
            val settingsViewModel: SettingsViewModel = viewModel()
            val chatViewModel: ChatViewModel = viewModel()
            SettingsScreen(
                viewModel = settingsViewModel,
                onBack = {
                    navController.popBackStack()
                    chatViewModel.refreshSettings()
                },
                onSignedOut = {
                    navController.navigate("signin") {
                        popUpTo(0) { inclusive = true }
                    }
                },
            )
        }
    }
}
