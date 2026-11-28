import type { DocumentFontFamily } from "@/lib/document/settings";
import type { DocumentPdfFontMapping, PdfFontAsset, PdfFontFamily } from "./types";

function asset(
  path: PdfFontAsset["path"],
  sha256: string,
): PdfFontAsset {
  return { path, fileName: path.slice(path.lastIndexOf("/") + 1), sha256 };
}

const liberationLicense = {
  id: "SIL-OFL-1.1",
  path: "/fonts/liberation/OFL.txt",
  sourceUrl: "https://openfontlicense.org/open-font-license-official-text/",
  attribution: "Copyright (c) 2012 Red Hat, Inc. with Reserved Font Name Liberation.",
} as const;

const liberationSourceUrl = "https://deb.debian.org/debian/pool/main/f/fonts-liberation/fonts-liberation_2.1.5-3_all.deb";

export const PDF_FONT_REGISTRY = {
  LiberationSans: {
    id: "LiberationSans",
    displayName: "Liberation Sans",
    internalFamilyName: "Liberation Sans",
    category: "sans-serif",
    variants: {
      regular: asset("/fonts/liberation/LiberationSans-Regular.ttf", "bade59d822652f76e6941aa87b40a87c13d1cc70db98ededb5011127efafd1d3"),
      bold: asset("/fonts/liberation/LiberationSans-Bold.ttf", "1b5f2da6f4cadce4c05b9ecebe3a6fcd374eb95ae443605e799f4c3287978939"),
      italic: asset("/fonts/liberation/LiberationSans-Italic.ttf", "93ff5260834141b6f9d8f2b846d427f3a5dc492dbdce8ebdad406e38a38f34bb"),
      boldItalic: asset("/fonts/liberation/LiberationSans-BoldItalic.ttf", "352e9dc2be89f210dbd3c0fd5dfaf97135de70e0beb5f22378601861462493a7"),
    },
    license: liberationLicense,
    provenance: {
      sourceUrl: liberationSourceUrl,
      version: "Liberation Fonts 2.1.5 (Debian package 1:2.1.5-3)",
      notes: "Static TrueType Sans faces; same files used by the existing HTML-independent PDF assets.",
    },
  },
  LiberationSerif: {
    id: "LiberationSerif",
    displayName: "Liberation Serif",
    internalFamilyName: "Liberation Serif",
    category: "serif",
    variants: {
      regular: asset("/fonts/liberation-serif/LiberationSerif-Regular.ttf", "9caef765d2e891c10dd73658894f01e660fe0c1c83e0bda7d6edf561d8f623d4"),
      bold: asset("/fonts/liberation-serif/LiberationSerif-Bold.ttf", "443a4dbd694b6e4689925947b456e0532e10b19c90fa32eb39ea6c2cd9db9ebd"),
      italic: asset("/fonts/liberation-serif/LiberationSerif-Italic.ttf", "de18fe26337e03241952dca46398d5b66f3c5738d080bfd284f66e67b926f597"),
      boldItalic: asset("/fonts/liberation-serif/LiberationSerif-BoldItalic.ttf", "4b2635d2ec4d992373dcae577c742a98ecfd841ffc1b8a103b5f10db163dbc7a"),
    },
    license: {
      ...liberationLicense,
      path: "/fonts/liberation-serif/OFL.txt",
    },
    provenance: {
      sourceUrl: liberationSourceUrl,
      version: "Liberation Fonts 2.1.5 (Debian package 1:2.1.5-3)",
      notes: "Static TrueType Serif faces.",
    },
  },
  LiberationMono: {
    id: "LiberationMono",
    displayName: "Liberation Mono",
    internalFamilyName: "Liberation Mono",
    category: "monospace",
    variants: {
      regular: asset("/fonts/liberation-mono/LiberationMono-Regular.ttf", "5883330d94debd992952cd8f0571b225f478c2d797d3f36c7521b0a5c9bde0f2"),
      bold: asset("/fonts/liberation-mono/LiberationMono-Bold.ttf", "ddce09ee3483b2d5faf61f0baba8592e76e0ac6dd4ab36683e5334c288bf5eef"),
      italic: asset("/fonts/liberation-mono/LiberationMono-Italic.ttf", "016743fc425a1b61eb349c72c02f3da6a1349d1da7a5d9aded27321397eed955"),
      boldItalic: asset("/fonts/liberation-mono/LiberationMono-BoldItalic.ttf", "2ec6f3e5bd9b24c7fb04c229a1ee64f600e4072c03a041c96c2d62974c2ede2c"),
    },
    license: {
      ...liberationLicense,
      path: "/fonts/liberation-mono/OFL.txt",
    },
    provenance: {
      sourceUrl: liberationSourceUrl,
      version: "Liberation Fonts 2.1.5 (Debian package 1:2.1.5-3)",
      notes: "Static TrueType Mono faces used for Courier New approximation and code.",
    },
  },
  DocmarkSignatureSans: {
    id: "DocmarkSignatureSans",
    displayName: "Docmark Signature Sans",
    internalFamilyName: "Docmark Signature Sans",
    category: "sans-serif",
    variants: {
      regular: asset("/fonts/pdf/docmark-signature-sans/DocmarkSignatureSans-Regular.ttf", "ff4d50a3366e181cc64de4d1e134edf5993efd340ec0b4590efbfb073d065c17"),
      bold: asset("/fonts/pdf/docmark-signature-sans/DocmarkSignatureSans-Bold.ttf", "82346c6402a7a4b5c4e274035bada8903a3eefa5efeddfb23354c71142003dd5"),
      italic: asset("/fonts/pdf/docmark-signature-sans/DocmarkSignatureSans-Italic.ttf", "bd515bd5a5c216638e956610c39242611e35e74a0522cb060c76263c030cc958"),
      boldItalic: asset("/fonts/pdf/docmark-signature-sans/DocmarkSignatureSans-BoldItalic.ttf", "6d3f3edd67455c6f2dae2a6e2b7d23c0a525ea19d1b1ac0adb505fec39266eed"),
    },
    license: {
      id: "SIL-OFL-1.1",
      path: "/fonts/pdf/docmark-signature-sans/OFL.txt",
      sourceUrl: "https://openfontlicense.org/open-font-license-official-text/",
      attribution: "Copyright 2024 The Montserrat.Git Project Authors",
    },
    provenance: {
      sourceUrl: "https://github.com/JulietaUla/Montserrat/tree/cc8daf2e7085006b9c112542fc82b58afc13521d",
      version: "Montserrat source commit cc8daf2e7085006b9c112542fc82b58afc13521d; static instances built with fontTools 4.61.1",
      notes: "Static 400/700 normal and italic TTF instances. Font family names are renamed to comply with the OFL reserved-name rule. Glyph outlines retain the selected Montserrat designs.",
    },
  },
  DejaVuMathTeXGyre: {
    id: "DejaVuMathTeXGyre",
    displayName: "DejaVu Math TeX Gyre",
    internalFamilyName: "DejaVu Math TeX Gyre",
    category: "sans-serif",
    variants: {
      regular: asset("/fonts/pdf/dejavu-math/DejaVuMathTeXGyre.ttf", "f7a5e6bcc7747e7488634c8b94684a71596b1b3bc1d39f3c4600fc7677458f9e"),
      bold: asset("/fonts/pdf/dejavu-math/DejaVuMathTeXGyre.ttf", "f7a5e6bcc7747e7488634c8b94684a71596b1b3bc1d39f3c4600fc7677458f9e"),
      italic: asset("/fonts/pdf/dejavu-math/DejaVuMathTeXGyre.ttf", "f7a5e6bcc7747e7488634c8b94684a71596b1b3bc1d39f3c4600fc7677458f9e"),
      boldItalic: asset("/fonts/pdf/dejavu-math/DejaVuMathTeXGyre.ttf", "f7a5e6bcc7747e7488634c8b94684a71596b1b3bc1d39f3c4600fc7677458f9e"),
    },
    license: {
      id: "Bitstream-Vera",
      path: "/fonts/pdf/dejavu-math/COPYRIGHT.txt",
      sourceUrl: "https://dejavu-fonts.github.io/License.html",
      attribution: "Copyright (c) 2003 by Bitstream, Inc. All Rights Reserved.",
    },
    provenance: {
      sourceUrl: "https://dejavu-fonts.github.io/",
      version: "DejaVu Math TeX Gyre 2.37 (Debian fonts-dejavu-extra 2.37-8)",
      notes: "One static TrueType Math face; tested to embed and extract supplementary math operators in pdfmake's PDFKit backend. Bold and italic slots alias the regular face and are reported as approximations.",
    },
  },
  NotoSansSymbols2: {
    id: "NotoSansSymbols2",
    displayName: "Noto Sans Symbols 2",
    internalFamilyName: "Noto Sans Symbols2",
    category: "sans-serif",
    variants: {
      regular: asset("/fonts/pdf/noto-sans-symbols2/NotoSansSymbols2-Regular.ttf", "876598db5f1e3bef2bc77c4d94c5b0d5d2c1620be4878a06f18fb5434e331688"),
      // This family has one static face; aliases keep pdfmake's family descriptor shape stable.
      bold: asset("/fonts/pdf/noto-sans-symbols2/NotoSansSymbols2-Regular.ttf", "876598db5f1e3bef2bc77c4d94c5b0d5d2c1620be4878a06f18fb5434e331688"),
      italic: asset("/fonts/pdf/noto-sans-symbols2/NotoSansSymbols2-Regular.ttf", "876598db5f1e3bef2bc77c4d94c5b0d5d2c1620be4878a06f18fb5434e331688"),
      boldItalic: asset("/fonts/pdf/noto-sans-symbols2/NotoSansSymbols2-Regular.ttf", "876598db5f1e3bef2bc77c4d94c5b0d5d2c1620be4878a06f18fb5434e331688"),
    },
    license: {
      id: "SIL-OFL-1.1",
      path: "/fonts/pdf/noto-sans-symbols2/OFL.txt",
      sourceUrl: "https://openfontlicense.org/open-font-license-official-text/",
      attribution: "Copyright 2017 Google Inc. All Rights Reserved.",
    },
    provenance: {
      sourceUrl: "https://deb.debian.org/debian/pool/main/f/fonts-noto/fonts-noto-core_20201225-2_all.deb",
      version: "Noto Sans Symbols2 2.003 (Debian fonts-noto-core 20201225-2)",
      notes: "Unmodified TrueType asset; internal copyright is 2017 Google Inc. The Debian package carries Google Inc./LLC copyright ranges and the OFL notice. Upstream project: https://github.com/googlefonts/noto-fonts. Bold and italic slots alias the regular face and are reported as approximations.",
    },
  },
} as const satisfies Record<string, PdfFontFamily>;

export type PdfFontFamilyId = keyof typeof PDF_FONT_REGISTRY;

export const DOCUMENT_PDF_FONT_MAPPINGS = {
  Arial: {
    familyId: "LiberationSans",
    fidelity: "approximate",
    explanation: "Liberation Sans is metrically compatible with Arial but is a different embedded font.",
  },
  Helvetica: {
    familyId: "LiberationSans",
    fidelity: "approximate",
    explanation: "Liberation Sans is used as an open Helvetica-style sans-serif substitute.",
  },
  Georgia: {
    familyId: "LiberationSerif",
    fidelity: "approximate",
    explanation: "Liberation Serif is used as an open serif substitute for Georgia.",
  },
  "Times New Roman": {
    familyId: "LiberationSerif",
    fidelity: "approximate",
    explanation: "Liberation Serif is metrically compatible with Times New Roman but is a different embedded font.",
  },
  "Courier New": {
    familyId: "LiberationMono",
    fidelity: "approximate",
    explanation: "Liberation Mono is a fixed-width open substitute for Courier New.",
  },
  Montserrat: {
    familyId: "DocmarkSignatureSans",
    fidelity: "exact",
  },
} as const satisfies Record<DocumentFontFamily, DocumentPdfFontMapping>;

export const DEFAULT_PDF_DOCUMENT_FAMILY: DocumentFontFamily = "Arial";
export const DEFAULT_PDF_MONOSPACE_FAMILY: PdfFontFamilyId = "LiberationMono";
