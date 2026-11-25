// A synthetic AccessDoc used for demos and as the offline fallback.
// All content here is original, written for this prototype.

import { checkDoc } from './check.js';
import { getDoc, saveDoc } from './storage.js';

export const SAMPLE_DOC_ID = 'doc_sample';

function svgDataUrl(svg) {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg.replace(/\s+/g, ' ').trim())}`;
}

// Phospholipid bilayer with one channel protein.
function membraneSvg() {
  const heads = [];
  for (let i = 0; i < 14; i += 1) {
    const x = 20 + i * 26;
    if (i === 6 || i === 7) continue; // gap for the protein
    heads.push(
      `<circle cx="${x}" cy="40" r="9" fill="#2f6f9f"/>`,
      `<line x1="${x - 3}" y1="49" x2="${x - 3}" y2="78" stroke="#c98b2b" stroke-width="3"/>`,
      `<line x1="${x + 3}" y1="49" x2="${x + 3}" y2="78" stroke="#c98b2b" stroke-width="3"/>`,
      `<circle cx="${x}" cy="120" r="9" fill="#2f6f9f"/>`,
      `<line x1="${x - 3}" y1="82" x2="${x - 3}" y2="111" stroke="#c98b2b" stroke-width="3"/>`,
      `<line x1="${x + 3}" y1="82" x2="${x + 3}" y2="111" stroke="#c98b2b" stroke-width="3"/>`,
    );
  }
  return svgDataUrl(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 380 170" width="380" height="170">
    <rect width="380" height="170" fill="#ffffff"/>
    <text x="8" y="18" font-family="Arial, sans-serif" font-size="12" fill="#222">Outside the cell</text>
    <text x="8" y="162" font-family="Arial, sans-serif" font-size="12" fill="#222">Inside the cell (cytoplasm)</text>
    ${heads.join('')}
    <rect x="170" y="24" width="44" height="112" rx="18" fill="#6a9f4b" stroke="#2f5e1f" stroke-width="2"/>
    <rect x="186" y="30" width="12" height="100" rx="6" fill="#ffffff"/>
    <text x="222" y="160" font-family="Arial, sans-serif" font-size="11" fill="#222">channel protein</text>
  </svg>`);
}

function dividerSvg() {
  return svgDataUrl(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 12" width="200" height="12">
    <circle cx="80" cy="6" r="3" fill="#7d8579"/><circle cx="100" cy="6" r="3" fill="#7d8579"/><circle cx="120" cy="6" r="3" fill="#7d8579"/>
  </svg>`);
}

export function buildSampleDoc() {
  const doc = {
    id: SAMPLE_DOC_ID,
    title: 'BIOL 1001 – Week 3: Cell Structure',
    lang: 'en',
    sourceFile: 'biol1001-week3-cell-structure.pdf',
    source: { kind: 'pdf', pages: 5, url: null },
    createdAt: '2026-11-20T15:00:00Z',
    sections: [
      {
        id: 's1',
        heading: 'Overview',
        level: 2,
        summary:
          'This week introduces the cell as the basic unit of life. You will compare prokaryotic and eukaryotic cells, look at how the plasma membrane controls what enters and leaves, and see why most cells stay small.',
        blocks: [
          { id: 'b1', type: 'pageMarker', n: 1 },
          {
            id: 'b2',
            type: 'paragraph',
            text: 'Every living organism is made of one or more cells. A cell is the smallest unit that can carry out all the processes we associate with life: taking in energy, building and breaking down molecules, responding to its surroundings and reproducing. In this unit we look inside the cell and ask how its structure supports each of these jobs.',
            marks: [{ start: 66, end: 79, type: 'bold' }, { start: 261, end: 281, type: 'italic' }],
            plain: null,
          },
          {
            id: 'b3',
            type: 'paragraph',
            text: 'By the end of the week you should be able to describe the main structures of a eukaryotic cell, explain the function of each, and use the surface-area-to-volume ratio to argue why cells divide rather than simply growing larger.',
            plain: null,
          },
          {
            id: 'b4',
            type: 'list',
            ordered: false,
            items: [
              'Read this handout before Tuesday’s lecture.',
              'Complete the membrane diagram worksheet in the lab on Thursday.',
              'Bring questions about organelles to the Friday review session.',
            ],
          },
        ],
      },
      {
        id: 's2',
        heading: 'Prokaryotic and eukaryotic cells',
        level: 2,
        summary: null,
        blocks: [
          {
            id: 'b5',
            type: 'paragraph',
            text: 'Biologists sort cells into two broad groups. Prokaryotic cells, found in bacteria and archaea, have no nucleus; their DNA sits in a region of the cytoplasm called the nucleoid. Eukaryotic cells, found in animals, plants, fungi and protists, keep their DNA inside a membrane-bound nucleus and contain many other membrane-bound compartments called organelles.',
            plain: null,
          },
          {
            id: 'b6',
            type: 'table',
            caption: 'Comparison of prokaryotic and eukaryotic cells',
            headers: ['Feature', 'Prokaryotic cells', 'Eukaryotic cells'],
            rows: [
              ['Nucleus', 'Absent; DNA in the nucleoid', 'Present, surrounded by a double membrane'],
              ['Typical size', '1–10 micrometres', '10–100 micrometres'],
              ['Membrane-bound organelles', 'None', 'Many, such as mitochondria and the Golgi apparatus'],
              ['Ribosomes', 'Smaller (70S)', 'Larger (80S) in the cytoplasm'],
              ['Examples', 'Escherichia coli, archaea', 'Human liver cells, yeast, leaf cells'],
            ],
          },
          {
            id: 'b7',
            type: 'paragraph',
            text: 'Despite these differences, all cells share four features: a plasma membrane, cytoplasm, ribosomes and DNA. These shared features are strong evidence that all life descends from a common ancestor.',
            plain: null,
          },
          { id: 'b8', type: 'pageMarker', n: 2 },
        ],
      },
      {
        id: 's3',
        heading: 'The plasma membrane',
        level: 2,
        summary: null,
        blocks: [
          {
            id: 'b9',
            type: 'paragraph',
            text: 'The plasma membrane is the boundary between the cell and its environment. It is selectively permeable, which means it lets some substances cross easily while blocking or controlling others.',
            plain: null,
          },
          { id: 'b10', type: 'heading', text: 'The fluid mosaic model', level: 3 },
          {
            id: 'b11',
            type: 'paragraph',
            text: 'The membrane is built from a double layer of phospholipids. Each phospholipid has a water-attracting (hydrophilic) head and two water-repelling (hydrophobic) tails. In water the molecules arrange themselves so the heads face outward and the tails point toward each other, forming a bilayer. Proteins float within this layer like tiles in a moving mosaic, which is why it is called the fluid mosaic model.',
            plain: null,
          },
          {
            id: 'b12',
            type: 'image',
            src: membraneSvg(),
            alt: 'Diagram of a cell membrane. Two rows of phospholipids face each other: round blue heads point outward toward the outside of the cell and toward the cytoplasm, and orange tails point inward. A green channel protein with an open central pore spans the full width of the bilayer.',
            altStatus: 'approved',
            caption: 'Figure 1. A section of the phospholipid bilayer with one channel protein.',
          },
          { id: 'b13', type: 'heading', text: 'Membrane proteins', level: 3 },
          {
            id: 'b14',
            type: 'list',
            ordered: false,
            items: [
              'Channel proteins form pores that let specific ions or water pass through.',
              'Carrier proteins change shape to move molecules across the membrane.',
              'Receptor proteins bind signalling molecules such as hormones.',
              'Recognition proteins act as identity tags that other cells can detect.',
            ],
          },
          { id: 'b15', type: 'image', src: dividerSvg(), alt: '', altStatus: 'decorative', caption: null },
          { id: 'b16', type: 'pageMarker', n: 3 },
        ],
      },
      {
        id: 's4',
        heading: 'Organelles and their jobs',
        level: 2,
        summary: null,
        blocks: [
          {
            id: 'b17',
            type: 'paragraph',
            text: 'Organelles let a eukaryotic cell divide its work into separate compartments, so that chemical reactions which would interfere with each other can run at the same time.',
            plain: null,
          },
          { id: 'b18', type: 'heading', text: 'Nucleus', level: 3 },
          {
            id: 'b19',
            type: 'paragraph',
            text: 'The nucleus stores the cell’s DNA and controls which genes are expressed. Its double membrane, the nuclear envelope, is perforated by nuclear pores that let messenger RNA leave for the cytoplasm.',
            plain: null,
          },
          { id: 'b20', type: 'heading', text: 'Mitochondria', level: 3 },
          {
            id: 'b21',
            type: 'paragraph',
            text: 'Mitochondria carry out cellular respiration, releasing energy from glucose and storing it in ATP. Cells with high energy demands, such as muscle cells, contain thousands of them.',
            plain: null,
          },
          { id: 'b22', type: 'heading', text: 'From gene to secreted protein', level: 3 },
          {
            id: 'b23',
            type: 'paragraph',
            text: 'Proteins that will leave the cell follow a set route through the endomembrane system:',
            plain: null,
          },
          {
            id: 'b24',
            type: 'list',
            ordered: true,
            items: [
              'A gene in the nucleus is copied into messenger RNA.',
              'Ribosomes on the rough endoplasmic reticulum translate the RNA into a protein.',
              'The protein is packed into a transport vesicle and sent to the Golgi apparatus.',
              'The Golgi apparatus modifies, sorts and labels the protein.',
              'A secretory vesicle fuses with the plasma membrane and releases the protein outside the cell.',
            ],
          },
          { id: 'b25', type: 'pageMarker', n: 4 },
        ],
      },
      {
        id: 's5',
        heading: 'Why cells stay small',
        level: 2,
        summary: null,
        blocks: [
          {
            id: 'b26',
            type: 'paragraph',
            text: 'A cell exchanges materials with its environment through its surface, but it uses those materials throughout its volume. As a cell grows, its volume increases faster than its surface area, so each unit of volume is served by less membrane.',
            plain: null,
          },
          {
            id: 'b27',
            type: 'paragraph',
            text: 'For a cube-shaped cell with side length s, the surface-area-to-volume ratio is:',
            plain: null,
          },
          {
            id: 'b28',
            type: 'math',
            latex: '\\frac{SA}{V} = \\frac{6s^2}{s^3} = \\frac{6}{s}',
            text: 'SA / V = 6s² / s³ = 6 / s',
            spoken:
              'Surface area divided by volume equals six s squared over s cubed, which simplifies to six divided by s.',
          },
          {
            id: 'b29',
            type: 'table',
            caption: 'Surface area and volume of cube-shaped cells',
            headers: ['Side length (µm)', 'Surface area (µm²)', 'Volume (µm³)', 'SA : V ratio'],
            rows: [
              ['1', '6', '1', '6 : 1'],
              ['2', '24', '8', '3 : 1'],
              ['5', '150', '125', '1.2 : 1'],
              ['10', '600', '1000', '0.6 : 1'],
            ],
          },
          {
            id: 'b30',
            type: 'paragraph',
            text: 'Because the ratio falls as s grows, a large cell cannot move nutrients in and wastes out quickly enough. Dividing into two smaller cells restores a high ratio.',
            plain: null,
          },
          { id: 'b31', type: 'pageMarker', n: 5 },
        ],
      },
      {
        id: 's6',
        heading: 'Key terms and review questions',
        level: 2,
        summary: null,
        blocks: [
          { id: 'b32', type: 'heading', text: 'Key terms', level: 3 },
          {
            id: 'b33',
            type: 'list',
            ordered: false,
            items: [
              'Organelle: a membrane-bound compartment with a specific job.',
              'Selectively permeable: allowing some substances to cross but not others.',
              'Phospholipid bilayer: the double layer of lipids that forms cell membranes.',
              'Surface-area-to-volume ratio: how much membrane a cell has for each unit of its volume.',
            ],
          },
          { id: 'b34', type: 'heading', text: 'Review questions', level: 3 },
          {
            id: 'b35',
            type: 'list',
            ordered: true,
            items: [
              'Name two structures found in every cell and explain why each is needed.',
              'Explain why the hydrophobic tails of phospholipids point toward the middle of the membrane.',
              'Using the table of cube-shaped cells, predict the ratio for a cell with a side length of 20 micrometres.',
            ],
          },
          {
            id: 'b36',
            type: 'paragraph',
            text: 'Answers will be discussed in the Friday review session. Bring your worksheet.',
            plain: null,
          },
          {
            id: 'b37',
            type: 'paragraph',
            role: 'notes',
            text: 'Instructor note: the worksheet is also on the course page if you lose your printed copy.',
            plain: null,
          },
        ],
      },
    ],
  };
  doc.report = checkDoc(doc);
  return doc;
}

export const sampleDoc = buildSampleDoc();

/**
 * Save the sample doc under id `doc_sample` (only if absent, unless force).
 * Resolves to the stored doc. Never rejects; on storage failure it resolves
 * to the in-memory copy.
 */
export async function seedSampleDoc({ force = false } = {}) {
  try {
    const existing = await getDoc(SAMPLE_DOC_ID);
    if (existing && !force) return existing;
    return await saveDoc(buildSampleDoc());
  } catch {
    return buildSampleDoc();
  }
}
