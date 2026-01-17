/*! coi-serviceworker v0.1.7 - Guido Zuidhof, licensed under MIT */
let coep = "require-corp";
let coop = "same-origin";

if (typeof window === "undefined") {
  self.addEventListener("install", () => self.skipWaiting());
  self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

  self.addEventListener("fetch", function (event) {
    if (event.request.cache === "only-if-cached" && event.request.mode !== "same-origin") {
      return;
    }

    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response.status === 0) {
            return response;
          }

          const newHeaders = new Headers(response.headers);
          newHeaders.set("Cross-Origin-Embedder-Policy", coep);
          newHeaders.set("Cross-Origin-Opener-Policy", coop);

          return new Response(response.body, {
            status: response.status,
            statusText: response.statusText,
            headers: newHeaders,
          });
        })
        .catch((e) => console.error(e))
    );
  });
} else {
  (() => {
    // You can customize the path to the service worker here
    const src = document.currentScript.src;
    const firstload = localStorage.getItem("coi-firstload");

    if (window.crossOriginIsolated) {
        localStorage.removeItem("coi-firstload");
        return;
    }

    if(firstload) {
        console.log("Reloading page to register COI Service Worker");
        window.location.reload();
    } else {
        localStorage.setItem("coi-firstload", "true");
    }
    
    // Register service worker
    if ("serviceWorker" in navigator) {
        navigator.serviceWorker.register(src).then(
        (registration) => {
            console.log("COI Service Worker registered");
            // If it's the first load, we might need a reload to ensure headers are applied?
            // The library usually relies on the fetch interceptor. 
            // However, for the very first page load, the headers aren't there yet unless we reload.
            // The original library handles this by reloading if !crossOriginIsolated.
             if (!window.crossOriginIsolated) {
                 window.location.reload();
             }
        },
        (err) => {
            console.error("COI Service Worker registration failed: ", err);
        }
        );
    }
  })();
}
