declare module "pdfmake/build/pdfmake" {
  const pdfMake: {
    addVirtualFileSystem(files: Record<string, string>): void;
    addFonts(fonts: Record<string, { normal: string; bold: string; italics: string; bolditalics: string }>): void;
    createPdf(definition: unknown): { getBlob(): Promise<Blob> };
  };
  export default pdfMake;
}
