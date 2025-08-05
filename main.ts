// main.ts for Deno Deploy
const CDN_BASE = "https://libra-wasm-cdn-production.devversioncv.workers.dev";
const VERSION = "v=13";

let wasmModule: any;

async function initWASM() {
  try {
    const { default: initLib } = await import(`${CDN_BASE}/soffice.mjs?${VERSION}`);
    
    return await initLib({
      locateFile: (path: string) => `${CDN_BASE}/${path}?${VERSION}`,
      noInitialRun: true,
      thisProgram: "soffice",
      wasmMemory: new WebAssembly.Memory({ initial: 256 }),
      instantiateWasm: async (imports, callback) => {
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

async function handler(req: Request): Promise<Response> {
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

  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  try {
    if (!wasmModule) {
      wasmModule = await initWASM();
      wasmModule.FS.mkdir("/working");
    }

    const docxData = new Uint8Array(await req.arrayBuffer());
    wasmModule.FS.writeFile("/working/input.docx", docxData);

    wasmModule.callMain([
      "--headless",
      "--convert-to", "html",
      "--outdir", "/working",
      "/working/input.docx"
    ]);

    const html = wasmModule.FS.readFile("/working/input.html", { encoding: "utf8" });
    
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

export default handler;