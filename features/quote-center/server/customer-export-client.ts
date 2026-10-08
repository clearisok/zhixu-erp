export type CustomerExportFile = { blob: Blob; fileName: string; sha256: string; warnings: string[] };
async function readFileResponse(response:Response):Promise<CustomerExportFile> {
  if (!response.ok) throw new Error(`Server HTTP ${response.status}; export not completed`);
  const blob = await response.blob(), sha256 = response.headers.get("x-zhixu-file-sha256") ?? "";
  const actual = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", await blob.arrayBuffer()))).map(b => b.toString(16).padStart(2,"0")).join("");
  if (actual !== sha256) throw new Error("Generated file integrity mismatch");
  return { blob, sha256, fileName: decodeURIComponent(response.headers.get("x-zhixu-file-name") ?? ""), warnings: JSON.parse(decodeURIComponent(response.headers.get("x-zhixu-export-warnings") ?? "%5B%5D")) };
}
export async function customerExport(quoteId: string, selection: { expectedVersion: number; revisionId: string; priceVersionIds: string[] }): Promise<CustomerExportFile> {
  return readFileResponse(await fetch(`/api/v1/quotes/${encodeURIComponent(quoteId)}/customer-export`, { method: "POST", credentials: "include", cache: "no-store",
    headers: { "Content-Type": "application/json", "X-Zhixu-Request": "1" }, body: JSON.stringify(selection) }));
}
export type CustomerBatchReport={selected:number;success:number;failed:Array<{index:number;code:string}>};
export async function customerBatchExport(items:Array<{quoteId:string;expectedVersion:number}>):Promise<{report:CustomerBatchReport;file:CustomerExportFile|null}>{
  const response=await fetch("/api/v1/quotes/customer-batch-export",{method:"POST",credentials:"include",cache:"no-store",
    headers:{"Content-Type":"application/json","X-Zhixu-Request":"1"},body:JSON.stringify({items})});
  if(!response.ok)throw new Error(`Server HTTP ${response.status}; batch not completed`);
  if(response.headers.get("content-type")?.includes("application/json"))return{report:(await response.json()).report,file:null};
  const report=JSON.parse(decodeURIComponent(response.headers.get("x-zhixu-batch-report")??"")) as CustomerBatchReport;
  return{report,file:await readFileResponse(response)};
}
export function downloadCustomerFile(file: CustomerExportFile) {
  const url = URL.createObjectURL(file.blob), anchor = document.createElement("a");
  anchor.href = url; anchor.download = file.fileName; anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
