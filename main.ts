// main.ts
import { serve } from "https://deno.land/std@0.208.0/http/server.ts";

// CDN Configuration
const CDN_BASE = "https://libra-wasm-cdn-production.devversioncv.workers.dev";
const VERSION = "v=11";

let wasmModule: any;

async function initWASM() {
  try {
    // Dynamically import from CDN
    const { default: initLib } = await import(`${CDN_BASE}/soffice.mjs?${VERSION}`);
    
    return await initLib({
      locateFile: (path: string) => `${CDN_BASE}/${path}?${VERSION}`,
      noInitialRun: true,
      thisProgram: "soffice",
      wasmMemory: new WebAssembly.Memory({ initial: 256 }),
      // Recommended for CDN loading:
      instantiateWasm: async (imports: WebAssembly.Imports, callback: (instance: WebAssembly.Instance) => void) => {
        const wasmResponse = await fetch(`${CDN_BASE}/soffice.wasm?${VERSION}`);
        const wasmBytes = await wasmResponse.arrayBuffer();
        const instance = await WebAssembly.instantiate(wasmBytes, imports);
        callback(instance);
        return instance.exports;
      }
    });
  } catch (error) {
    console.error("WASM Initialization Failed:", error);
    throw error;
  }
}

async function handleRequest(req: Request): Promise<Response> {
  // CORS Preflight
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type"
      }
    });
  }

  // Only accept POST requests
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  try {
    // Initialize WASM (cached after first load)
    if (!wasmModule) {
      wasmModule = await initWASM();
      wasmModule.FS.mkdir("/working");
    }

    // Process document
    const docxData = new Uint8Array(await req.arrayBuffer());
    wasmModule.FS.writeFile("/working/input.docx", docxData);

    // Convert to HTML
    wasmModule.callMain([
      "--headless",
      "--convert-to", "html",
      "--outdir", "/working",
      "/working/input.docx"
    ]);

    // Read result
    const html = wasmModule.FS.readFile("/working/input.html", { encoding: "utf8" });

    // Cleanup
    wasmModule.FS.unlink("/working/input.docx");
    wasmModule.FS.unlink("/working/input.html");

    return new Response(html, {
      headers: {
        "Content-Type": "text/html",
        "Access-Control-Allow-Origin": "*"
      }
    });

  } catch (error) {
    console.error("Conversion Error:", error);
    return new Response(`Conversion Failed: ${error.message}`, {
      status: 500,
      headers: { "Access-Control-Allow-Origin": "*" }
    });
  }
}

// Start Server
console.log("Server running at http://localhost:8000");
serve(handleRequest, { port: 8000 });