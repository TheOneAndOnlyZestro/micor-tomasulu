import { InstructionLine } from '../types';

export const parseAssembly = (code: string): { instructions: InstructionLine[], labels: Record<string, number> } => {
  const lines = code.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  const instructions: InstructionLine[] = [];
  const labels: Record<string, number> = {};

  let pcCounter = 0;

  // First pass: Find labels and clean code
  const cleanLines: { raw: string, pc: number }[] = [];
  
  lines.forEach((line) => {
    let currentLine = line;
    // Extract label
    if (currentLine.includes(':')) {
      const parts = currentLine.split(':');
      const label = parts[0].trim();
      labels[label] = pcCounter;
      currentLine = parts[1].trim();
    }
    
    if (currentLine.length > 0) {
      cleanLines.push({ raw: currentLine, pc: pcCounter });
      pcCounter += 4; // Assume 4 byte instructions
    }
  });

  // Second pass: Parse instructions
  cleanLines.forEach((item, index) => {
    // Regex for: OP DEST, SRC1, SRC2 (Handle variations like 0(R1))
    // Example: L.D F0, 0(R1) -> Op:L.D, Dest:F0, Src1: R1, Src2/Imm: 0
    // Example: ADD F1, F2, F3
    // Example: BNE R1, R2, LOOP
    
    const parts = item.raw.replace(/,/g, ' ').split(/\s+/);
    const op = parts[0].toUpperCase();
    let dest = parts[1] || '';
    let src1 = parts[2] || '';
    let src2 = parts[3] || '';
    let imm = 0;

    // Handle Load/Store format: OP REG, IMM(SRC) -> OP DEST, IMM, SRC
    if (src1.includes('(') && src1.includes(')')) {
      const match = src1.match(/^(-?\d+)\((.+)\)$/);
      if (match) {
        // Swap for internal representation consistency: OP Dest, BaseReg, Offset
        imm = parseInt(match[1]);
        const baseReg = match[2];
        src2 = imm.toString(); // Store offset in src2 slot for parser consistency
        src1 = baseReg;        // Store base reg in src1 slot
      }
    } else {
        // Try to parse immediate if it exists
        if (!isNaN(parseInt(src2))) {
            imm = parseInt(src2);
        }
        // Handle Branch labels
        if (labels.hasOwnProperty(src2)) {
            // imm = labels[src2];
            // We keep the label name in src2 for display, execution engine handles lookup
        } else if (labels.hasOwnProperty(src1) && !src2) {
             // Jump type instructions (J LABEL) - not strictly in requirements but good for safety
             src2 = src1; 
        }
    }

    instructions.push({
      id: index,
      raw: item.raw,
      op,
      dest,
      src1,
      src2,
      immediate: imm,
      pcAddress: item.pc,
      issueCycle: null,
      execStartCycle: null,
      execEndCycle: null,
      writeCycle: null,
    });
  });

  return { instructions, labels };
};