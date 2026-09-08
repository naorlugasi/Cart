/**
 * Mobile (In-App WebView) handoff helper.
 *
 * The app opens the chain's website inside a WebView, waits for the page to load and then
 * evaluates a script that performs the same cart-add requests the browser extension does.
 * The script is fully self-contained: the server builds it from the injector plus the payload
 * of a specific handoff (items + adapter), so the page never has to call the platform API and
 * the app never needs to know adapter details.
 *
 *   GET {API}/api/handoffs/{id}/script   -> JavaScript to pass to evaluateJavascript()
 *
 * This module shows how to build the same script locally (e.g. for tests or offline builds).
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const INJECTOR = path.join(here, '..', 'src', 'handoff', 'injector.cjs');

export function buildWebviewScript({ apiBase, handoffId, payload = null, redirect = true }) {
  const injector = readFileSync(INJECTOR, 'utf8');
  // With `payload` (GET /api/handoffs/{id}) the script is self-contained: chains whose CSP blocks
  // connections to the platform (Rami Levy) still work, and the app reads the result from the
  // `cart-handoff-result` message / the return value instead of the platform API.
  const opts = JSON.stringify({ apiBase, handoffId, payload, redirect });
  return `${injector}\n;CartHandoffInjector.bootstrap(${opts});`;
}

/** Native-side pseudo code kept next to the JS for reference. */
export const NATIVE_SNIPPETS = {
  android: `
// Kotlin - after the chain page finished loading in the WebView:
webView.settings.javaScriptEnabled = true
webView.webViewClient = object : WebViewClient() {
  override fun onPageFinished(view: WebView, url: String) {
    if (!injected) {
      injected = true
      view.evaluateJavascript(handoffScript, null) // handoffScript = body of GET /api/handoffs/{id}/script
    }
  }
}
webView.loadUrl(handoff.url)
`,
  ios: `
// Swift (WKWebView):
func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
  guard !injected else { return }
  injected = true
  webView.evaluateJavaScript(handoffScript) { _, error in
    if let error = error { print("handoff failed: \\(error)") }
  }
}
`,
};
