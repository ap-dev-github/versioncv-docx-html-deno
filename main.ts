// main.ts - Deno Deploy Compatible Version
const CDN_BASE = "https://libra-wasm-cdn-production.devversioncv.workers.dev";
const VERSION = "v=13";

// Initialize WASM once (cached for subsequent requests)
let wasmInit: Promise<any> | null = null;

async function initializeWASM() {
  try {
    // Load Emscripten module
    const { default: initLibreOffice } = await import(`${CDN_BASE}/soffice.mjs?${VERSION}`);
    
    // Configure WASM memory (critical for Deno Deploy's 128MB limit)
    const wasmConfig = {
      locateFile: (path: string) => `${CDN_BASE}/${path}?${VERSION}`,
      noInitialRun: true,
      thisProgram: "soffice",
      wasmMemory: new WebAssembly.Memory({ initial: 128, maximum: 128 }), // Adjusted for Deploy
      printErr: (text: string) => console.error("[LibreOffice]", text),
    };

    return await initLibreOffice(wasmConfig);
  } catch (error) {
    console.error("WASM Initialization Failed:", error);
    throw error;
  }
}

export default async (req: Request): Promise<Response> => {
  // CORS Handling
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type"
      }
    });
  }

  if (req.method !== "POST") {
    return new Response("Only POST requests allowed", { status: 405 });
  }

  try {
    // Initialize WASM (singleton pattern)
    if (!wasmInit) {
      wasmInit = initializeWASM();
    }
    const libreoffice = await wasmInit;

    // Setup virtual filesystem
    if (!libreoffice.FS.analyzePath("/working").exists) {
      libreoffice.FS.mkdir("/working");
    }

    // Process document
    const docData = new Uint8Array(await req.arrayBuffer());
    libreoffice.FS.writeFile("/working/input.docx", docData);

    // Convert to HTML (timeout after 10s)
    await Promise.race([
      new Promise((_, reject) => 
        setTimeout(() => reject("Conversion timed out"), 10000)
      ),
      libreoffice.callMain([
        "--headless",
        "--convert-to", "html",
        "--outdir", "/working",
        "/working/input.docx"
      ])
    ]);

    // Get result
    const html = libreoffice.FS.readFile("/working/input.html", { encoding: "utf8" });

    // Cleanup
    libreoffice.FS.unlink("/working/input.docx");
    libreoffice.FS.unlink("/working/input.html");

    return new Response(html, {
      headers: {
        "Content-Type": "text/html",
        "Access-Control-Allow-Origin": "*"
      }
    });

  } catch (error) {
    console.error("Conversion Error:", error);
    return new Response(`Error: ${error instanceof Error ? error.message : String(error)}`, {
      status: 500,
      headers: { "Access-Control-Allow-Origin": "*" }
    });
  }
};