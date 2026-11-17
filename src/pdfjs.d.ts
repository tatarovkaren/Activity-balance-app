// pdf.js из npm без типов для минифицированных сборок: нужен только getDocument.
declare module 'pdfjs-dist/legacy/build/pdf.min.mjs' {
  export function getDocument(src: { data: Uint8Array; isEvalSupported?: boolean }): {
    promise: Promise<{
      numPages: number;
      getPage(n: number): Promise<{ getTextContent(): Promise<{ items: unknown[] }> }>;
    }>;
  };
}
declare module 'pdfjs-dist/legacy/build/pdf.worker.min.mjs';
