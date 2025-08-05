// Import the LibreOffice WebAssembly runtime from your CDN
import initLib from "https://libra-wasm-cdn-production.devversioncv.workers.dev/soffice.mjs";

const VERSION = `v=11`; 
const CDN_BASE = `https://libra-wasm-cdn-production.devversioncv.workers.dev`;

// patched Deno to simulate Worker environment expected by Emscripten
(globalThis as any).self = globalThis;
(globalThis as any).location = new URL("https://fake.url");

Deno.serve(async (req) => {
  // Handle preflight for CORS
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type"
      }
    });
  }

  if (req.method !== "POST") {
    return new Response("Use POST with DOCX file", { status: 405 });
  }

  try {
    // Get uploaded DOCX file
    const docxBuffer = new Uint8Array(await req.arrayBuffer());

    // Load patched LibreOffice WASM runtime
    const Module = await initLib({
      locateFile: (file) => `${CDN_BASE}/${file}?${VERSION}`
    });

    // Write the file into virtual FS
    Module.FS.writeFile("/input.docx", docxBuffer);

    // Run the conversion
    Module.callMain([
      "--headless",
      "--convert-to",
      "html:XHTML Writer",
      "/input.docx",
      "--outdir",
      "/"
    ]);

    // Read back output
    const htmlOutput = Module.FS.readFile("/input.html", { encoding: "utf8" });

    return new Response(htmlOutput, {
      status: 200,
      headers: {
        "Content-Type": "text/html",
        "Access-Control-Allow-Origin": "*"
      }
    });
  } catch (err) {
    return new Response(
      `Conversion error: ${(err as Error).message || "unknown error"}`,
      {
        status: 500,
        headers: {
          "Access-Control-Allow-Origin": "*"
        }
      }
    );
  }
});
