export enum OpType {
  LOAD = 'LOAD',
  STORE = 'STORE',
  ADD = 'ADD',
  SUB = 'SUB',
  MULT = 'MULT',
  DIV = 'DIV',
  BRANCH = 'BRANCH', // BNE, BEQ
}

export enum InstState {
  PENDING = 'PENDING',
  ISSUED = 'ISSUED',
  EXECUTING = 'EXECUTING',
  WRITING_RESULT = 'WRITING',
  COMMIT = 'COMMIT',
}

export interface InstructionConfig {
  op: OpType;
  cycles: number;
  rsType: 'ADD' | 'MULT' | 'LOAD' | 'STORE';
}

export interface SystemConfig {
  rsSizes: {
    ADD: number;
    MULT: number;
    LOAD: number;
    STORE: number;
  };
  latencies: {
    [key in OpType]: number;
  };
  cache: {
    enabled: boolean;
    blockSize: number; // in bytes
    cacheSize: number; // in bytes
    hitLatency: number;
    missPenalty: number;
  };
  memorySize: number;
}

export interface InstructionLine {
  id: number;
  raw: string;
  op: string;
  dest: string;
  src1: string;
  src2: string; // immediate or register
  immediate: number;
  pcAddress: number; // The instruction address
  issueCycle: number | null;
  execStartCycle: number | null;
  execEndCycle: number | null;
  writeCycle: number | null;
}

export interface ReservationStation {
  id: string;
  type: 'ADD' | 'MULT' | 'LOAD' | 'STORE';
  busy: boolean;
  op: string | null;
  vj: number | null;
  vk: number | null;
  qj: string | null; // tag of RS producing source 1
  qk: string | null; // tag of RS producing source 2
  a: number | null;  // Address for load/store
  instId: number | null; // Reference to the instruction ID
  timeLeft: number;
  result: number | null;
}

export interface Register {
  name: string;
  value: number;
  qi: string | null; // The RS tag currently writing to this register
}

export interface CacheBlock {
  tag: number;
  valid: boolean;
  data: number[]; // Simulating data as array of bytes
  lastAccess: number; // For LRU
}

export interface SimulationState {
  cycle: number;
  pc: number;
  instructions: InstructionLine[];
  reservationStations: ReservationStation[];
  registers: { [key: string]: Register };
  memory: { [address: number]: number }; // Byte addressable memory
  cache: CacheBlock[];
  cdb: { tag: string; value: number } | null;
  log: string[];
  isFinished: boolean;
  branchStall: boolean; // True if waiting for branch to resolve
}
