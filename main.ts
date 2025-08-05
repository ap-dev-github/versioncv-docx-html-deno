// Import the LibreOffice WebAssembly runtime from your CDN
import initLib from "https://libra-wasm-cdn-production.devversioncv.workers.dev/soffice.mjs";

// Deno Edge Function
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
    // Get the uploaded DOCX file as Uint8Array
    const docxBuffer = new Uint8Array(await req.arrayBuffer());

    // Load the LibreOffice WebAssembly runtime from your CDN
  const Module = await initLib({
  locateFile: (file) =>
    `https://libra-wasm-cdn-production.devversioncv.workers.dev/${file}`,
  ENVIRONMENT: "DENONODE" // or "SHELL" or "DENONODE"
});

    // Write the uploaded DOCX file to the in-memory filesystem
    Module.FS.writeFile("/input.docx", docxBuffer);

    // Call LibreOffice WASM to convert the DOCX to HTML
    Module.callMain([
      "--headless",
      "--convert-to",
      "html:XHTML Writer",
      "/input.docx",
      "--outdir",
      "/"
    ]);

    // Read the resulting HTML output
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
