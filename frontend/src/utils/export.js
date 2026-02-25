import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { Document, Packer, Paragraph, TextRun } from 'docx';

export async function exportToPDF(element, filename = 'flowread-document.pdf') {
  const canvas = await html2canvas(element, {
    scale: 2,
    useCORS: true,
    backgroundColor: null,
  });
  const imgData = canvas.toDataURL('image/png');
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'px', format: 'a4' });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const imgWidth = pageWidth;
  const imgHeight = (canvas.height * pageWidth) / canvas.width;

  let y = 0;
  while (y < imgHeight) {
    if (y > 0) pdf.addPage();
    pdf.addImage(imgData, 'PNG', 0, -y, imgWidth, imgHeight);
    y += pageHeight;
  }
  pdf.save(filename);
}

/**
 * paragraphs: array of { text: string, bionicPositions: [{start, end}] }
 * We approximate bold as the first ~45% of each word.
 */
export async function exportToDOCX(paragraphs, filename = 'flowread-document.docx') {
  const docParagraphs = paragraphs.map((paraText) => {
    const words = paraText.split(' ');
    const runs = words.flatMap((word, i) => {
      const boldLen = Math.max(1, Math.ceil(word.length * 0.45));
      const space = i < words.length - 1 ? ' ' : '';
      return [
        new TextRun({ text: word.slice(0, boldLen), bold: true }),
        new TextRun({ text: word.slice(boldLen) + space }),
      ];
    });
    return new Paragraph({ children: runs, spacing: { after: 200 } });
  });

  const doc = new Document({ sections: [{ children: docParagraphs }] });
  const buffer = await Packer.toBlob(doc);
  const url = URL.createObjectURL(buffer);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function copyToClipboard(text) {
  return navigator.clipboard.writeText(text);
}
