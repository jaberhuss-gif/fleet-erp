import * as pdfjsLib from "pdfjs-dist";
import Tesseract from "tesseract.js";

// Use the pdfjs worker from a CDN to avoid bundling issues
pdfjsLib.GlobalWorkerOptions.workerSrc =
  "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.0.379/pdf.worker.min.mjs";

/**
 * Convert a PDF file to images (canvas -> dataURL) and run Tesseract OCR.
 * Returns the concatenated text from all pages.
 *
 * @param {File} file - The PDF file from an <input type="file" />
 * @param {function} onProgress - Optional callback (stage, progress)
 * @returns {Promise<string>} - Extracted text
 */
export async function extractTextFromPdfViaOcr(file, onProgress) {
  if (!file) throw new Error("No file provided");
  if (!/\.pdf$/i.test(file.name)) throw new Error("Only PDF files are supported for OCR");

  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const numPages = pdf.numPages;
  const allText = [];

  for (let pageNum = 1; pageNum <= numPages; pageNum++) {
    if (onProgress) onProgress("rendering", pageNum, numPages);

    const page = await pdf.getPage(pageNum);
    const viewport = page.getViewport({ scale: 2.0 }); // higher scale = better OCR

    const canvas = document.createElement("canvas");
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const context = canvas.getContext("2d");

    await page.render({ canvasContext: context, viewport }).promise;

    const dataUrl = canvas.toDataURL("image/png");

    if (onProgress) onProgress("ocr", pageNum, numPages);

    const { data } = await Tesseract.recognize(dataUrl, "ara+eng", {
      logger: (m) => {
        if (onProgress && m.status === "recognizing text") {
          onProgress("ocr-progress", pageNum, numPages, m.progress);
        }
      }
    });

    allText.push(data.text || "");
  }

  return allText.join("\n\n===PAGE_BREAK===\n\n");
}
