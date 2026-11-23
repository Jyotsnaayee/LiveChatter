package com.livechatter.app;

import android.Manifest;
import android.annotation.SuppressLint;
import android.content.ActivityNotFoundException;
import android.content.Intent;
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
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;

import androidx.activity.OnBackPressedCallback;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.content.ContextCompat;

import java.util.ArrayList;
import java.util.List;

public class MainActivity extends AppCompatActivity {

    private WebView webView;
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

        Uri baseUri = Uri.parse(BuildConfig.LIVECHAT_URL);
        baseHost = baseUri.getHost() != null ? baseUri.getHost() : "";

        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.parseColor("#171A21"));

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

                // Open native phone apps for WhatsApp, Gmail, Messages (SMS), and external links
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
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (request != null && request.isForMainFrame()) {
                    String retryUrl = BuildConfig.LIVECHAT_URL;
                    String offlineHtml = "<!doctype html><html><head><meta name='viewport' content='width=device-width,initial-scale=1'>"
                            + "<style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;"
                            + "background:#171A21;color:#F8FAFC;font-family:system-ui,sans-serif;padding:24px;text-align:center}"
                            + ".card{max-width:340px;background:#1D2029;border:1px solid rgba(255,255,255,.1);border-radius:16px;padding:24px}"
                            + "h1{margin:0 0 8px;font-size:18px}p{margin:0 0 18px;color:#94A3B8;font-size:13px;line-height:1.5}"
                            + "a{display:inline-block;background:#2563EB;color:#fff;text-decoration:none;padding:10px 18px;border-radius:10px;font-weight:600;font-size:13px}</style>"
                            + "</head><body><div class='card'><h1>Connection Unavailable</h1>"
                            + "<p>Could not reach LiveChatter right now. Check your internet connection and try again.</p>"
                            + "<a href='" + retryUrl + "'>Retry</a></div></body></html>";
                    view.loadDataWithBaseURL(null, offlineHtml, "text/html", "UTF-8", null);
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
        if (webView != null && intent != null && intent.getData() != null) {
            webView.loadUrl(resolveStartUrl(intent));
        }
    }

    private String resolveStartUrl(Intent intent) {
        String baseUrl = BuildConfig.LIVECHAT_URL;
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
    protected void onDestroy() {
        if (webView != null) {
            webView.destroy();
            webView = null;
        }
        super.onDestroy();
    }
}
