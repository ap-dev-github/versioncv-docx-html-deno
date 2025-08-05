// main.ts - Deno Worker with LibreOffice WASM
import { serve } from "https://deno.land/std@0.192.0/http/server.ts";

// Configuration
const WASM_URL = "https://libra-wasm-cdn-production.devversioncv.workers.dev/soffice.mjs";
const VERSION = "v=12";

// Initialize WASM once (cold start)
const initWASM = async () => {
  const { default: initLib, Module } = await import(WASM_URL);
  
  await initLib({
    locateFile: (file: string) => `${WASM_URL.replace('soffice.mjs', file)}?${VERSION}`,
    noInitialRun: true, // Critical for worker environment
    thisProgram: "soffice", // Required for LibreOffice CLI
    wasmMemory: new WebAssembly.Memory({ initial: 256 }),
  });

  return Module;
};

// Cache initialized WASM
let wasmModule: any;

Deno.serve(async (req: Request) => {
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
    return new Response("Send DOCX via POST", { status: 405 });
  }

  try {
    // Initialize WASM (if not cached)
    if (!wasmModule) {
      wasmModule = await initWASM();
      // Configure virtual filesystem
      wasmModule.FS.mkdir("/working");
      wasmModule.FS.mount(wasmModule.FS.filesystems.WORKERFS, {}, "/working");
    }

    // Process file
    const docxData = new Uint8Array(await req.arrayBuffer());
    wasmModule.FS.writeFile("/working/input.docx", docxData);

    // Execute conversion
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
  } catch (err) {
    return new Response(`Error: ${err.message}`, { 
      status: 500,
      headers: { "Access-Control-Allow-Origin": "*" }
    });
  }
});