package pl.boggle.tv

import android.annotation.SuppressLint
import android.app.Activity
import android.content.Context
import android.graphics.Color
import android.os.Bundle
import android.view.Gravity
import android.view.View
import android.view.WindowManager
import android.view.inputmethod.EditorInfo
import android.view.inputmethod.InputMethodManager
import android.webkit.WebChromeClient
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Button
import android.widget.EditText
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.TextView

/**
 * Simple fullscreen WebView for Android TV.
 * Connects to the Boggle Node.js server running on a computer.
 * Shows a one-time setup screen to enter the server IP, then goes fullscreen.
 */
class MainActivity : Activity() {

    private lateinit var webView: WebView
    private lateinit var setupLayout: LinearLayout
    private val PREFS = "boggle_prefs"
    private val KEY_IP = "server_ip"

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // Fullscreen immersive
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        @Suppress("DEPRECATION")
        window.decorView.systemUiVisibility = (
            View.SYSTEM_UI_FLAG_FULLSCREEN
            or View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
            or View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
            or View.SYSTEM_UI_FLAG_LAYOUT_STABLE
            or View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
            or View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
        )

        // Root container
        val root = FrameLayout(this)
        root.setBackgroundColor(Color.parseColor("#1a0a1e"))

        // WebView (underneath)
        webView = WebView(this)
        webView.setBackgroundColor(Color.parseColor("#1a0a1e"))
        webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            mediaPlaybackRequiresUserGesture = false
            cacheMode = WebSettings.LOAD_NO_CACHE
            @Suppress("DEPRECATION")
            mixedContentMode = WebSettings.MIXED_CONTENT_ALWAYS_ALLOW
        }
        webView.webViewClient = WebViewClient()
        webView.webChromeClient = WebChromeClient()
        webView.visibility = View.GONE
        root.addView(webView, FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.MATCH_PARENT,
            FrameLayout.LayoutParams.MATCH_PARENT
        ))

        // Setup screen (on top)
        setupLayout = createSetupScreen()
        root.addView(setupLayout, FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.MATCH_PARENT,
            FrameLayout.LayoutParams.MATCH_PARENT
        ))

        setContentView(root)

        // Check saved IP
        val savedIp = getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY_IP, null)
        if (!savedIp.isNullOrBlank()) {
            connectToServer(savedIp)
        }
    }

    private fun createSetupScreen(): LinearLayout {
        val layout = LinearLayout(this)
        layout.orientation = LinearLayout.VERTICAL
        layout.gravity = Gravity.CENTER
        layout.setBackgroundColor(Color.parseColor("#1a0a1e"))
        layout.setPadding(80, 40, 80, 40)

        // Title
        val title = TextView(this)
        title.text = "💖 BOGGLE 💖"
        title.setTextColor(Color.parseColor("#ff69b4"))
        title.textSize = 48f
        title.gravity = Gravity.CENTER
        layout.addView(title, LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT,
            LinearLayout.LayoutParams.WRAP_CONTENT
        ).apply { bottomMargin = 40 })

        // Instruction
        val info = TextView(this)
        info.text = "Uruchom serwer na komputerze:\nnode server.js\n\nWpisz adres IP komputera:"
        info.setTextColor(Color.parseColor("#c9a0c0"))
        info.textSize = 20f
        info.gravity = Gravity.CENTER
        layout.addView(info, LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT,
            LinearLayout.LayoutParams.WRAP_CONTENT
        ).apply { bottomMargin = 30 })

        // IP input
        val input = EditText(this)
        input.id = View.generateViewId()
        input.hint = "np. 192.168.1.100"
        input.setHintTextColor(Color.parseColor("#665577"))
        input.setTextColor(Color.WHITE)
        input.textSize = 28f
        input.gravity = Gravity.CENTER
        input.setBackgroundColor(Color.parseColor("#2a1133"))
        input.setPadding(40, 24, 40, 24)
        input.isSingleLine = true
        input.imeOptions = EditorInfo.IME_ACTION_GO
        input.isFocusable = true
        input.isFocusableInTouchMode = true

        val savedIp = getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY_IP, "")
        input.setText(savedIp)

        val inputParams = LinearLayout.LayoutParams(600, LinearLayout.LayoutParams.WRAP_CONTENT)
        inputParams.gravity = Gravity.CENTER
        inputParams.bottomMargin = 30
        layout.addView(input, inputParams)

        // Connect button
        val btn = Button(this)
        btn.text = "📺  POŁĄCZ"
        btn.textSize = 22f
        btn.setTextColor(Color.parseColor("#1a0a1e"))
        btn.setBackgroundColor(Color.parseColor("#86efac"))
        btn.setPadding(60, 20, 60, 20)
        btn.isFocusable = true

        val btnParams = LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.WRAP_CONTENT,
            LinearLayout.LayoutParams.WRAP_CONTENT
        )
        btnParams.gravity = Gravity.CENTER
        layout.addView(btn, btnParams)

        val doConnect = {
            val ip = input.text.toString().trim()
            if (ip.isNotBlank()) {
                // Save IP
                getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                    .edit().putString(KEY_IP, ip).apply()
                // Hide keyboard
                val imm = getSystemService(Context.INPUT_METHOD_SERVICE) as InputMethodManager
                imm.hideSoftInputFromWindow(input.windowToken, 0)
                connectToServer(ip)
            }
        }

        btn.setOnClickListener { doConnect() }
        input.setOnEditorActionListener { _, actionId, _ ->
            if (actionId == EditorInfo.IME_ACTION_GO) { doConnect(); true } else false
        }

        return layout
    }

    private fun connectToServer(ip: String) {
        setupLayout.visibility = View.GONE
        webView.visibility = View.VISIBLE
        webView.loadUrl("http://$ip:3000/host")
    }

    @Suppress("DEPRECATION")
    @Deprecated("Deprecated in API level 33")
    override fun onBackPressed() {
        // Long-press back → show setup screen again
        setupLayout.visibility = View.VISIBLE
        webView.visibility = View.GONE
    }
}
