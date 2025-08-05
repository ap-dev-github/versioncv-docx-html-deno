// main.ts
const CDN_BASE = "https://your-cdn.com/libreoffice-wasm";
const VERSION = "v=2";

let wasmModule: Promise<any> | null = null;

async function initWASM() {
  const { default: initLib } = await import(`${CDN_BASE}/lo-loader.mjs?${VERSION}`);
  return initLib({
    locateFile: (path) => `${CDN_BASE}/${path}?${VERSION}`,
    noInitialRun: true,
    wasmMemory: new WebAssembly.Memory({ initial: 64, maximum: 128 }),
    thisProgram: "soffice"
  });
}

async function convertDocxToHtml(docxData: Uint8Array): Promise<string> {
  if (!wasmModule) wasmModule = initWASM();
  const lo = await wasmModule;
  
  lo.FS.mkdir("/conv");
  lo.FS.writeFile("/conv/input.docx", docxData);
  
  await lo.callMain([
    "--headless",
    "--convert-to", "html",
    "--outdir", "/conv",
    "/conv/input.docx"
  ]);
  
  const html = lo.FS.readFile("/conv/input.html", { encoding: "utf8" });
  
  // Cleanup
  lo.FS.unlink("/conv/input.docx");
  lo.FS.unlink("/conv/input.html");
  
  return html;
}

// Additional processing functions
async function processHtml(html: string): Promise<string> {
  // Example: Extract all links
  const links = [...html.matchAll(/href="(.*?)"/g)].map(m => m[1]);
  console.log("Found links:", links);
  
  // Example: Add analytics tracking
  return html.replace(/<a /g, '<a data-track="click" ');
}

export default async (req: Request): Promise<Response> => {
  try {
    // Handle CORS
    if (req.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    if (req.method !== "POST") {
      return new Response("Only POST allowed", { status: 405 });
    }

    // 1. Convert DOCX to HTML
    const docxData = new Uint8Array(await req.arrayBuffer());
    const rawHtml = await convertDocxToHtml(docxData);
    
    // 2. Process HTML
    const processedHtml = await processHtml(rawHtml);
    
    // 3. Return or further process
    return new Response(processedHtml, {
      headers: { 
        "Content-Type": "text/html",
        ...corsHeaders
      }
    });

  } catch (error) {
    console.error("Error:", error);
    return new Response(`Error: ${error.message}`, { 
      status: 500,
      headers: corsHeaders 
    });
  }
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type"
};