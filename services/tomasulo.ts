import { 
  SimulationState, SystemConfig, OpType, ReservationStation, 
  InstructionLine, Register, InstState, CacheBlock
} from '../types';

// Helper to determine operation type
const getOpType = (op: string): OpType => {
  op = op.toUpperCase();
  if (['L.D', 'LW', 'LD', 'L.S'].includes(op)) return OpType.LOAD;
  if (['S.D', 'SW', 'SD', 'S.S'].includes(op)) return OpType.STORE;
  if (['ADD', 'ADD.D', 'ADDI', 'DADDI', 'ADD.S'].includes(op)) return OpType.ADD;
  if (['SUB', 'SUB.D', 'SUBI', 'DSUBI', 'SUB.S'].includes(op)) return OpType.SUB;
  if (['MUL', 'MUL.D', 'MUL.S'].includes(op)) return OpType.MULT;
  if (['DIV', 'DIV.D', 'DIV.S'].includes(op)) return OpType.DIV;
  if (['BNE', 'BEQ', 'BNEZ', 'BEQZ'].includes(op)) return OpType.BRANCH;
  return OpType.ADD; // Default/Fallback
};

// Helper to map OpType to RS Type
const getRSType = (opType: OpType): 'ADD' | 'MULT' | 'LOAD' | 'STORE' => {
  switch (opType) {
    case OpType.LOAD: return 'LOAD';
    case OpType.STORE: return 'STORE';
    case OpType.MULT: 
    case OpType.DIV: return 'MULT';
    default: return 'ADD'; // Branches usually go to ALU/ADD RS
  }
};

export const initializeState = (
  instructions: InstructionLine[], 
  config: SystemConfig,
  initialRegs: { [key: string]: number }
): SimulationState => {
  const rs: ReservationStation[] = [];
  
  // Initialize RS
  ['ADD', 'MULT', 'LOAD', 'STORE'].forEach(type => {
    const count = config.rsSizes[type as keyof typeof config.rsSizes];
    for (let i = 0; i < count; i++) {
      rs.push({
        id: `${type}${i + 1}`,
        type: type as any,
        busy: false,
        op: null,
        vj: null,
        vk: null,
        qj: null,
        qk: null,
        a: null,
        instId: null,
        timeLeft: 0,
        result: null
      });
    }
  });

  const registers: { [key: string]: Register } = {};
  // Initialize Registers
  Object.keys(initialRegs).forEach(name => {
    registers[name] = { name, value: initialRegs[name], qi: null };
  });

  return {
    cycle: 0,
    pc: 0,
    instructions,
    reservationStations: rs,
    registers,
    memory: {},
    cache: [],
    cdb: null,
    log: ['Simulation initialized.'],
    isFinished: false,
    branchStall: false,
  };
};

const accessCache = (addr: number, config: SystemConfig, cache: CacheBlock[], cycle: number): { hit: boolean, penalty: number, newCache: CacheBlock[] } => {
  if (!config.cache.enabled) return { hit: true, penalty: 0, newCache: cache };

  const blockIndex = Math.floor(addr / config.cache.blockSize);
  const tag = blockIndex; // Simple direct mapping simulation (simplified for demo) or fully associative logic
  
  // Let's assume Fully Associative with LRU for robustness in this project
  const maxBlocks = config.cache.cacheSize / config.cache.blockSize;
  
  const existingBlockIdx = cache.findIndex(b => b.tag === tag);
  
  let newCache = [...cache];
  let hit = false;
  let penalty = 0;

  if (existingBlockIdx !== -1) {
    // Hit
    hit = true;
    newCache[existingBlockIdx] = { ...newCache[existingBlockIdx], lastAccess: cycle };
  } else {
    // Miss
    hit = false;
    penalty = config.cache.missPenalty;
    
    const newBlock: CacheBlock = {
      tag,
      valid: true,
      data: [], // Data simulation optional for visuals
      lastAccess: cycle
    };

    if (newCache.length < maxBlocks) {
      newCache.push(newBlock);
    } else {
      // Evict LRU
      newCache.sort((a, b) => a.lastAccess - b.lastAccess);
      newCache[0] = newBlock; // Replace oldest
    }
  }

  return { hit, penalty, newCache };
};

export const nextCycle = (state: SimulationState, config: SystemConfig, labels: Record<string, number>): SimulationState => {
  if (state.isFinished) return state;

  const nextState = { ...state, cycle: state.cycle + 1, cdb: null, log: [...state.log] };
  const { instructions, reservationStations, registers, memory } = nextState;

  // 1. WRITE RESULT (Broadcast on CDB)
  // Check for RS that finished execution in the PREVIOUS cycle (timeLeft reached 0)
  // Note: We need arbitration. Pick the first one (or based on priority)
  
  let cdbProducer: ReservationStation | null = null;
  
  // Logic: Find candidates who finished execution
  const readyToWrite = reservationStations.filter(r => r.busy && r.timeLeft === 0 && r.result !== null);
  
  if (readyToWrite.length > 0) {
    // Arbitration: Prefer earliest instruction, or just first in list
    // Simple: First available
    cdbProducer = readyToWrite[0];
    
    nextState.cdb = { tag: cdbProducer.id, value: cdbProducer.result! };
    nextState.log.push(`Cycle ${nextState.cycle}: ${cdbProducer.id} broadcasts result ${cdbProducer.result}`);

    const inst = instructions.find(i => i.id === cdbProducer!.instId);
    if (inst) inst.writeCycle = nextState.cycle;

    // Update Registers waiting for this tag
    Object.values(registers).forEach(reg => {
      if (reg.qi === cdbProducer!.id) {
        reg.value = cdbProducer!.result!;
        reg.qi = null;
      }
    });

    // Update Reservation Stations waiting for this tag
    reservationStations.forEach(rs => {
      if (rs.busy) {
        if (rs.qj === cdbProducer!.id) {
          rs.vj = cdbProducer!.result!;
          rs.qj = null;
        }
        if (rs.qk === cdbProducer!.id) {
          rs.vk = cdbProducer!.result!;
          rs.qk = null;
        }
      }
    });

    // Clear the producer RS
    const producerIndex = reservationStations.findIndex(r => r.id === cdbProducer!.id);
    if (producerIndex !== -1) {
       // Reset RS
       reservationStations[producerIndex] = {
         ...reservationStations[producerIndex],
         busy: false, op: null, vj: null, vk: null, qj: null, qk: null, a: null, instId: null, result: null
       };
    }
  }

  // 2. EXECUTE
  // Iterate through busy RS. 
  // If not executing yet, check if operands ready (Qj, Qk null).
  // If Load/Store, handle address calc and memory logic.
  
  reservationStations.forEach((rs, idx) => {
    if (!rs.busy) return;

    // Check if operands are ready
    if (rs.qj === null && rs.qk === null) {
      const inst = instructions.find(i => i.id === rs.instId);
      if (!inst) return;

      if (inst.execStartCycle === null) {
        // Start Execution
        inst.execStartCycle = nextState.cycle;
        
        let latency = 0;
        const opType = getOpType(inst.op);
        
        // Load/Store specific logic
        if (opType === OpType.LOAD || opType === OpType.STORE) {
             // 1. Calculate Effective Address (Base + Offset)
             // Vj holds Base Reg value, A holds offset (from parsing phase)
             const effectiveAddr = (rs.vj || 0) + (rs.a || 0);
             rs.a = effectiveAddr; 
             
             // MEMORY DISAMBIGUATION (RAW/WAR/WAW for Memory)
             // Simple version: Strictly order loads/stores to same address?
             // Project req: Check "Address clashes".
             // We won't simulate complex Store Buffers causing stalls here for simplicity, 
             // but we will simulate Cache access for Loads.
             
             if (opType === OpType.LOAD) {
               const { hit, penalty, newCache } = accessCache(effectiveAddr, config, nextState.cache, nextState.cycle);
               nextState.cache = newCache; // Update cache state (LRU/New block)
               latency = config.latencies[OpType.LOAD] + (hit ? 0 : penalty);
               if (!hit) nextState.log.push(`Cycle ${nextState.cycle}: Cache Miss for ${inst.op} at address ${effectiveAddr}`);
             } else {
               latency = config.latencies[OpType.STORE];
             }
        } else {
           latency = config.latencies[opType];
        }

        rs.timeLeft = latency;
      }

      // Decrement Timer
      if (rs.timeLeft > 0) {
        rs.timeLeft--;
      }

      // If execution finished this cycle
      if (rs.timeLeft === 0 && inst.execEndCycle === null) {
        inst.execEndCycle = nextState.cycle;
        
        // Compute Result
        let res = 0;
        const opType = getOpType(inst.op);
        const v1 = rs.vj || 0;
        const v2 = rs.vk || 0;

        switch(opType) {
          case OpType.ADD: res = v1 + v2; break;
          case OpType.SUB: res = v1 - v2; break;
          case OpType.MULT: res = v1 * v2; break;
          case OpType.DIV: res = v2 !== 0 ? v1 / v2 : 0; break;
          case OpType.LOAD: 
            // Simulate memory load (return random or 0 if uninit)
            res = memory[rs.a || 0] || 0; 
            break;
          case OpType.STORE:
            // Store doesn't produce a register result, but writes to memory
            memory[rs.a || 0] = rs.vk || 0; // Storing vk to address a
            res = NaN; // No WB for store usually, handled differently
            break;
          case OpType.BRANCH:
             // Branch Logic
             // BNE R1, R2, LOOP
             // v1 = R1, v2 = R2
             // If v1 != v2, branch taken.
             const taken = (inst.op.startsWith('BNE') && v1 !== v2) || (inst.op.startsWith('BEQ') && v1 === v2);
             if (taken) {
                 // Update PC
                 const targetLabel = inst.src2;
                 if (labels[targetLabel] !== undefined) {
                     nextState.pc = labels[targetLabel];
                     nextState.log.push(`Cycle ${nextState.cycle}: Branch taken to ${targetLabel}`);
                 }
             }
             nextState.branchStall = false; // Release stall
             res = NaN;
             break;
        }

        rs.result = res;
        
        // Stores and Branches don't write back to CDB (normally)
        if (opType === OpType.STORE || opType === OpType.BRANCH) {
             // Clear RS immediately
             inst.writeCycle = nextState.cycle;
             rs.busy = false;
             // ... clear other fields ...
             const rsIdx = reservationStations.indexOf(rs);
             reservationStations[rsIdx] = {
                 ...reservationStations[rsIdx],
                 busy: false, op: null, instId: null
             };
        }
      }
    }
  });

  // 3. ISSUE
  // Fetch instruction at PC
  // If Branch Stall, do nothing
  if (!nextState.branchStall) {
    const issueInst = instructions.find(i => i.pcAddress === nextState.pc && i.issueCycle === null);
    
    if (issueInst) {
      const opType = getOpType(issueInst.op);
      const rsType = getRSType(opType);
      
      // Check for structural hazard (Free RS)
      const freeRS = reservationStations.find(r => r.type === rsType && !r.busy);
      
      if (freeRS) {
        // Issue
        issueInst.issueCycle = nextState.cycle;
        nextState.pc += 4; // Advance PC
        
        if (opType === OpType.BRANCH) {
            nextState.branchStall = true;
        }

        // Rename / Read Operands
        let vj = null, vk = null, qj = null, qk = null, a = null;

        // Src1 -> Vj/Qj
        if (issueInst.src1) {
            // Check if src1 is register
            if (registers[issueInst.src1]) {
                if (registers[issueInst.src1].qi) {
                    qj = registers[issueInst.src1].qi;
                    // Check if CDB is broadcasting this tag right now (Forwarding)
                    if (nextState.cdb && nextState.cdb.tag === qj) {
                        vj = nextState.cdb.value;
                        qj = null;
                    }
                } else {
                    vj = registers[issueInst.src1].value;
                }
            }
        }

        // Src2 -> Vk/Qk (or Immediate)
        if (opType === OpType.LOAD || opType === OpType.STORE) {
             // For Load/Store: Src2 holds the offset (immediate)
             a = issueInst.immediate;
             // Store needs the value to be stored (Dest register acts as source for STORE)
             if (opType === OpType.STORE) {
                 if (registers[issueInst.dest]) {
                     if (registers[issueInst.dest].qi) {
                         qk = registers[issueInst.dest].qi;
                         if (nextState.cdb && nextState.cdb.tag === qk) {
                             vk = nextState.cdb.value;
                             qk = null;
                         }
                     } else {
                         vk = registers[issueInst.dest].value;
                     }
                 }
             }
        } else {
            // Normal ALU
            if (registers[issueInst.src2]) {
                 if (registers[issueInst.src2].qi) {
                     qk = registers[issueInst.src2].qi;
                     if (nextState.cdb && nextState.cdb.tag === qk) {
                         vk = nextState.cdb.value;
                         qk = null;
                     }
                 } else {
                     vk = registers[issueInst.src2].value;
                 }
            } else {
                // Immediate value
                vk = issueInst.immediate;
            }
        }

        // Update RS
        const rsIndex = reservationStations.indexOf(freeRS);
        reservationStations[rsIndex] = {
            ...freeRS,
            busy: true,
            op: issueInst.op,
            instId: issueInst.id,
            vj, vk, qj, qk, a,
            timeLeft: 0, // Will be set in Exec stage
            result: null
        };

        // Update Register Alias Table (if instruction writes to register)
        if (opType !== OpType.STORE && opType !== OpType.BRANCH && registers[issueInst.dest]) {
            registers[issueInst.dest].qi = freeRS.id;
        }
      }
    }
  }

  // Check completion
  const allDone = instructions.every(i => i.writeCycle !== null);
  if (allDone) {
      nextState.isFinished = true;
      nextState.log.push("All instructions completed.");
  }

  return nextState;
};
