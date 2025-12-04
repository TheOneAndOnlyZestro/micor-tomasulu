import { OpType, SystemConfig } from './types';

export const DEFAULT_CONFIG: SystemConfig = {
  rsSizes: {
    ADD: 3,
    MULT: 2,
    LOAD: 3,
    STORE: 3,
  },
  latencies: {
    [OpType.LOAD]: 2,
    [OpType.STORE]: 2,
    [OpType.ADD]: 2,
    [OpType.SUB]: 2,
    [OpType.MULT]: 10,
    [OpType.DIV]: 40,
    [OpType.BRANCH]: 1,
  },
  cache: {
    enabled: true,
    blockSize: 4, // 4 bytes per block
    cacheSize: 16, // 16 bytes total
    hitLatency: 1, // included in base latency usually, but can be added
    missPenalty: 10,
  },
  memorySize: 256,
};

export const INITIAL_REGISTERS = [
  'F0', 'F2', 'F4', 'F6', 'F8', 'F10', 'F12', 'F14', 'F16', 'F18', 'F20',
  'R1', 'R2', 'R3', 'R4'
];

export const SAMPLE_CODE_SEQUENTIAL = `L.D F6, 0(R2)
L.D F2, 8(R2)
MUL.D F0, F2, F4
SUB.D F8, F2, F6
DIV.D F10, F0, F6
ADD.D F6, F8, F2
S.D F6, 8(R2)`;

export const SAMPLE_CODE_LOOP = `DADDI R1, R1, 24
DADDI R2, R2, 0
LOOP: L.D F0, 0(R1)
MUL.D F4, F0, F2
S.D F4, 0(R1)
SUBI R1, R1, 8
BNE R1, R2, LOOP`;
