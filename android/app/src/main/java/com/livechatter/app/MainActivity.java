package com.livechatter.app;

import android.Manifest;
import android.annotation.SuppressLint;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.view.ViewGroup;
import android.webkit.CookieManager;
import android.webkit.PermissionRequest;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;

import androidx.activity.OnBackPressedCallback;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.content.ContextCompat;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;

import java.util.ArrayList;
import java.util.List;

public class MainActivity extends AppCompatActivity {

    private static final String PREFS_NAME = "livechatter_prefs";
    private static final String KEY_SERVER_URL = "server_url";

    private WebView webView;
    private String currentBaseUrl;
    private String baseHost;
    private ValueCallback<Uri[]> filePathCallback;
    private PermissionRequest pendingWebPermissionRequest;

    private final ActivityResultLauncher<Intent> fileChooserLauncher =
            registerForActivityResult(new ActivityResultContracts.StartActivityForResult(), result -> {
                if (filePathCallback == null) return;
                Uri[] results = WebChromeClient.FileChooserParams.parseResult(
                        result.getResultCode(),
                        result.getData()
                );
                filePathCallback.onReceiveValue(results);
                filePathCallback = null;
            });

    private final ActivityResultLauncher<String[]> runtimePermissionLauncher =
            registerForActivityResult(new ActivityResultContracts.RequestMultiplePermissions(), grants -> {
                if (pendingWebPermissionRequest == null) return;
                List<String> grantedResources = new ArrayList<>();
                for (String resource : pendingWebPermissionRequest.getResources()) {
                    if (PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(resource)
                            && Boolean.TRUE.equals(grants.get(Manifest.permission.RECORD_AUDIO))) {
                        grantedResources.add(resource);
                    } else if (PermissionRequest.RESOURCE_VIDEO_CAPTURE.equals(resource)
                            && Boolean.TRUE.equals(grants.get(Manifest.permission.CAMERA))) {
                        grantedResources.add(resource);
                    }
                }
                if (!grantedResources.isEmpty()) {
                    pendingWebPermissionRequest.grant(grantedResources.toArray(new String[0]));
                } else {
                    pendingWebPermissionRequest.deny();
                }
                pendingWebPermissionRequest = null;
            });

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        setActiveBaseUrl(loadSavedServerUrl());

        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.parseColor("#171A21"));

        // Keep WebView safely below the status bar and above the navigation bar / keyboard on Android 15+
        ViewCompat.setOnApplyWindowInsetsListener(root, (view, windowInsets) -> {
            Insets insets = windowInsets.getInsets(
                    WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.ime()
            );
            view.setPadding(insets.left, insets.top, insets.right, insets.bottom);
            return WindowInsetsCompat.CONSUMED;
        });

        WindowInsetsControllerCompat insetsController =
                WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
        if (insetsController != null) {
            insetsController.setAppearanceLightStatusBars(false);
            insetsController.setAppearanceLightNavigationBars(false);
        }

        webView = new WebView(this);
        webView.setBackgroundColor(Color.parseColor("#171A21"));
        webView.setLayoutParams(new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
        ));
        root.addView(webView);
        setContentView(root);

        CookieManager cookieManager = CookieManager.getInstance();
        cookieManager.setAcceptCookie(true);
        cookieManager.setAcceptThirdPartyCookies(webView, true);

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setJavaScriptCanOpenWindowsAutomatically(true);
        settings.setSupportMultipleWindows(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE);
        settings.setUseWideViewPort(true);
        settings.setLoadWithOverviewMode(true);

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if (uri == null) return false;
                String scheme = uri.getScheme() != null ? uri.getScheme().toLowerCase() : "";
                String host = uri.getHost() != null ? uri.getHost().toLowerCase() : "";

                // Internal APK recovery actions (from the offline / HTTP 404 error page)
                if ("livechatter".equals(scheme)) {
                    if ("retry".equals(host)) {
                        view.loadUrl(currentBaseUrl);
                        return true;
                    }
                    if ("reset-server".equals(host)) {
                        saveServerUrl(null);
                        setActiveBaseUrl(BuildConfig.LIVECHAT_URL);
                        view.loadUrl(currentBaseUrl);
                        return true;
                    }
                    if ("set-server".equals(host)) {
                        String rawUrl = uri.getQueryParameter("url");
                        String normalized = normalizeHttpsUrl(rawUrl);
                        if (normalized != null) {
                            saveServerUrl(normalized);
                            setActiveBaseUrl(normalized);
                            view.loadUrl(currentBaseUrl);
                        } else {
                            showRecoveryScreen(
                                    view,
                                    "Invalid Server URL",
                                    "Please enter a valid https:// LiveChatter URL (for example, your published Cloud Run or AI Studio Shared App URL)."
                            );
                        }
                        return true;
                    }
                    return true;
                }

                // Open native phone apps for WhatsApp, Gmail, Messages (SMS), and external links (including Google Sign-In)
                if ("mailto".equals(scheme) || "sms".equals(scheme) || "smsto".equals(scheme)
                        || "tel".equals(scheme) || "whatsapp".equals(scheme)
                        || "wa.me".equals(host) || host.endsWith(".whatsapp.com")
                        || "mail.google.com".equals(host)) {
                    openExternally(uri);
                    return true;
                }

                if (("http".equals(scheme) || "https".equals(scheme)) && !host.equalsIgnoreCase(baseHost)) {
                    openExternally(uri);
                    return true;
                }

                return false;
            }

            @Override
            public void onReceivedHttpError(
                    WebView view,
                    WebResourceRequest request,
                    WebResourceResponse errorResponse
            ) {
                if (request != null && request.isForMainFrame() && errorResponse != null) {
                    int status = errorResponse.getStatusCode();
                    if (status >= 400) {
                        String title = status == 404
                                ? "LiveChatter URL Not Published (404)"
                                : "Server Returned Error (" + status + ")";
                        String message = status == 404
                                ? "The configured LiveChatter server URL returned Page Not Found (404). Open AI Studio and click Share / Deploy to publish your Shared App URL, or enter your deployed LiveChatter HTTPS URL below."
                                : "LiveChatter could not load from the configured server (HTTP " + status + "). Retry or update your server URL below.";
                        showRecoveryScreen(view, title, message);
                    }
                }
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (request != null && request.isForMainFrame()) {
                    showRecoveryScreen(
                            view,
                            "Connection Unavailable",
                            "Could not reach LiveChatter right now. Check your internet connection or update your deployed server URL below."
                    );
                }
            }
        });

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(
                    WebView webView,
                    ValueCallback<Uri[]> filePathCallback,
                    FileChooserParams fileChooserParams
            ) {
                if (MainActivity.this.filePathCallback != null) {
                    MainActivity.this.filePathCallback.onReceiveValue(null);
                }
                MainActivity.this.filePathCallback = filePathCallback;
                try {
                    fileChooserLauncher.launch(fileChooserParams.createIntent());
                    return true;
                } catch (ActivityNotFoundException e) {
                    MainActivity.this.filePathCallback = null;
                    return false;
                }
            }

            @Override
            public void onPermissionRequest(PermissionRequest request) {
                runOnUiThread(() -> handleWebPermissionRequest(request));
            }
        });

        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                if (webView != null && webView.canGoBack()) {
                    webView.goBack();
                } else {
                    setEnabled(false);
                    getOnBackPressedDispatcher().onBackPressed();
                }
            }
        });

        webView.loadUrl(resolveStartUrl(getIntent()));
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        if (webView == null || intent == null || intent.getData() == null) {
            return;
        }
        Uri data = intent.getData();
        // When returning from external browser Google Sign-In, keep the active WebView state intact
        if ("livechatter".equalsIgnoreCase(data.getScheme())
                && "oauth-complete".equalsIgnoreCase(data.getHost())) {
            return;
        }
        webView.loadUrl(resolveStartUrl(intent));
    }

    private String loadSavedServerUrl() {
        SharedPreferences prefs = getSharedPreferences(PREFS_NAME, MODE_PRIVATE);
        String saved = prefs.getString(KEY_SERVER_URL, null);
        String normalized = normalizeHttpsUrl(saved);
        return normalized != null ? normalized : BuildConfig.LIVECHAT_URL;
    }

    private void saveServerUrl(String url) {
        SharedPreferences prefs = getSharedPreferences(PREFS_NAME, MODE_PRIVATE);
        SharedPreferences.Editor editor = prefs.edit();
        if (url == null || url.isEmpty()) {
            editor.remove(KEY_SERVER_URL);
        } else {
            editor.putString(KEY_SERVER_URL, url);
        }
        editor.apply();
    }

    private void setActiveBaseUrl(String url) {
        currentBaseUrl = url;
        Uri parsed = Uri.parse(url);
        baseHost = parsed.getHost() != null ? parsed.getHost() : "";
    }

    private String normalizeHttpsUrl(String raw) {
        if (raw == null) return null;
        String trimmed = raw.trim();
        if (trimmed.isEmpty()) return null;
        if (!trimmed.startsWith("https://") && !trimmed.startsWith("http://")) {
            trimmed = "https://" + trimmed;
        }
        Uri uri = Uri.parse(trimmed);
        String scheme = uri.getScheme();
        String host = uri.getHost();
        if (!"https".equalsIgnoreCase(scheme) || host == null || host.isEmpty()) {
            return null;
        }
        if (trimmed.endsWith("/")) {
            trimmed = trimmed.substring(0, trimmed.length() - 1);
        }
        return trimmed;
    }

    private String escapeHtml(String text) {
        if (text == null) return "";
        return text
                .replace("&", "&amp;")
                .replace("<", "&lt;")
                .replace(">", "&gt;")
                .replace("\"", "&quot;")
                .replace("'", "&#39;");
    }

    private void showRecoveryScreen(WebView view, String title, String message) {
        String safeTitle = escapeHtml(title);
        String safeMessage = escapeHtml(message);
        String safeCurrentUrl = escapeHtml(currentBaseUrl);
        String html = "<!doctype html><html><head><meta charset='utf-8'>"
                + "<meta name='viewport' content='width=device-width,initial-scale=1'>"
                + "<style>"
                + "body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;"
                + "background:#171A21;color:#F8FAFC;font-family:system-ui,-apple-system,sans-serif;padding:20px;box-sizing:border-box}"
                + ".card{width:100%;max-width:380px;background:#1D2029;border:1px solid rgba(255,255,255,.12);border-radius:16px;padding:24px;box-sizing:border-box}"
                + ".badge{display:inline-block;padding:4px 10px;border-radius:999px;background:rgba(244,63,94,.16);color:#FDA4AF;font-size:11px;font-weight:700;margin-bottom:12px}"
                + "h1{margin:0 0 8px;font-size:18px;line-height:1.3}p{margin:0 0 16px;color:#94A3B8;font-size:13px;line-height:1.5}"
                + ".url-box{background:#11141B;border:1px solid rgba(255,255,255,.08);border-radius:10px;padding:10px 12px;font-size:11px;color:#CBD5E1;word-break:break-all;margin-bottom:16px}"
                + "label{display:block;font-size:11px;font-weight:700;color:#94A3B8;text-transform:uppercase;letter-spacing:.04em;margin-bottom:6px}"
                + "input{width:100%;box-sizing:border-box;background:#11141B;border:1px solid rgba(255,255,255,.16);color:#F8FAFC;border-radius:10px;padding:11px 12px;font-size:13px;margin-bottom:10px;outline:none}"
                + "input:focus{border-color:#3B82F6}"
                + ".btn{display:block;width:100%;box-sizing:border-box;text-align:center;border:none;border-radius:10px;padding:11px 14px;font-weight:600;font-size:13px;text-decoration:none;cursor:pointer}"
                + ".btn-primary{background:#2563EB;color:#fff;margin-bottom:8px}"
                + ".btn-secondary{background:#262B38;color:#E2E8F0;margin-bottom:8px}"
                + ".btn-ghost{background:transparent;color:#94A3B8;font-size:12px;padding:8px}"
                + "</style></head><body><div class='card'>"
                + "<div class='badge'>LiveChatter Mobile</div>"
                + "<h1>" + safeTitle + "</h1>"
                + "<p>" + safeMessage + "</p>"
                + "<div class='url-box'>Current URL:<br>" + safeCurrentUrl + "</div>"
                + "<a class='btn btn-primary' href='livechatter://retry'>Retry Connection</a>"
                + "<form onsubmit='event.preventDefault();var u=document.getElementById(\"u\").value.trim();"
                + "if(u){window.location.href=\"livechatter://set-server?url=\"+encodeURIComponent(u);}'>"
                + "<label for='u'>Use Another LiveChatter HTTPS URL</label>"
                + "<input id='u' type='url' placeholder='https://your-app.run.app' value='" + safeCurrentUrl + "' />"
                + "<button class='btn btn-secondary' type='submit'>Save &amp; Connect</button>"
                + "</form>"
                + "<a class='btn btn-ghost' href='livechatter://reset-server'>Reset to Default URL</a>"
                + "</div></body></html>";
        view.loadDataWithBaseURL(null, html, "text/html", "UTF-8", null);
    }

    private String resolveStartUrl(Intent intent) {
        String baseUrl = currentBaseUrl;
        if (intent == null || intent.getData() == null) {
            return baseUrl;
        }
        Uri data = intent.getData();
        String invite = data.getQueryParameter("invite");
        if ((invite == null || invite.isEmpty()) && "livechatter".equalsIgnoreCase(data.getScheme())) {
            List<String> segments = data.getPathSegments();
            if (!segments.isEmpty()) {
                invite = segments.get(segments.size() - 1);
            }
        }
        if (invite != null && !invite.isEmpty()) {
            return Uri.parse(baseUrl).buildUpon().appendQueryParameter("invite", invite).build().toString();
        }
        return baseUrl;
    }

    private void handleWebPermissionRequest(PermissionRequest request) {
        List<String> needed = new ArrayList<>();
        for (String resource : request.getResources()) {
            if (PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(resource)
                    && ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO)
                    != PackageManager.PERMISSION_GRANTED) {
                needed.add(Manifest.permission.RECORD_AUDIO);
            } else if (PermissionRequest.RESOURCE_VIDEO_CAPTURE.equals(resource)
                    && ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA)
                    != PackageManager.PERMISSION_GRANTED) {
                needed.add(Manifest.permission.CAMERA);
            }
        }
        if (needed.isEmpty()) {
            request.grant(request.getResources());
        } else {
            pendingWebPermissionRequest = request;
            runtimePermissionLauncher.launch(needed.toArray(new String[0]));
        }
    }

    private void openExternally(Uri uri) {
        try {
            Intent intent = new Intent(Intent.ACTION_VIEW, uri);
            startActivity(intent);
        } catch (ActivityNotFoundException ignored) {
            // No handler app installed on device
        }
    }

    @Override
    protected void onPause() {
        CookieManager.getInstance().flush();
        super.onPause();
    }

    @Override
    protected void onStop() {
        CookieManager.getInstance().flush();
        super.onStop();
    }

    @Override
    protected void onDestroy() {
        CookieManager.getInstance().flush();
        if (webView != null) {
            webView.destroy();
            webView = null;
        }
        super.onDestroy();
    }
}
