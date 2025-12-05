// services/tomasulo.ts
import {
  SimulationState,
  SystemConfig,
  OpType,
  ReservationStation,
  InstructionLine,
  Register,
  CacheBlock,
} from "../types";

// ============================================================================
// HELPERS
// ============================================================================

const getOpType = (op: string): OpType => {
  op = op.toUpperCase();
  if (["L.D", "LW", "LD", "L.S"].includes(op)) return OpType.LOAD;
  if (["S.D", "SW", "SD", "S.S"].includes(op)) return OpType.STORE;

  // FP Add/Sub
  if (["ADD.D", "ADD.S"].includes(op)) return OpType.ADD;
  if (["SUB.D", "SUB.S"].includes(op)) return OpType.SUB;

  // FP Mult/Div
  if (["MUL", "MUL.D", "MUL.S"].includes(op)) return OpType.MULT;
  if (["DIV", "DIV.D", "DIV.S"].includes(op)) return OpType.DIV;

  // Integer Arithmetic
  if (
    ["ADD", "ADDI", "DADDI", "DADD", "SUB", "SUBI", "DSUBI", "DSUB"].includes(
      op
    )
  )
    return OpType.INTEGER;

  // Branch
  if (["BNE", "BEQ", "BNEZ", "BEQZ"].includes(op)) return OpType.BRANCH;

  return OpType.INTEGER; // Default
};

const getRSType = (
  opType: OpType
): "ADD" | "MULT" | "LOAD" | "STORE" | "INTEGER" => {
  switch (opType) {
    case OpType.LOAD:
      return "LOAD";
    case OpType.STORE:
      return "STORE";
    case OpType.MULT:
    case OpType.DIV:
      return "MULT";
    case OpType.ADD:
    case OpType.SUB:
      return "ADD";
    case OpType.INTEGER:
    case OpType.BRANCH:
      return "INTEGER";
    default:
      return "INTEGER";
  }
};

const accessCache = (
  addr: number,
  config: SystemConfig,
  cache: CacheBlock[],
  cycle: number
): { hit: boolean; penalty: number; newCache: CacheBlock[] } => {
  if (!config.cache.enabled) return { hit: true, penalty: 0, newCache: cache };

  const blockIndex = Math.floor(addr / config.cache.blockSize);
  const tag = blockIndex;
  const maxBlocks = config.cache.cacheSize / config.cache.blockSize;
  const existingBlockIdx = cache.findIndex((b) => b.tag === tag);

  let newCache = [...cache];
  let hit = false;
  let penalty = 0;

  if (existingBlockIdx !== -1) {
    hit = true;
    newCache[existingBlockIdx] = {
      ...newCache[existingBlockIdx],
      lastAccess: cycle,
    };
  } else {
    hit = false;
    penalty = config.cache.missPenalty;
    const newBlock: CacheBlock = {
      tag,
      valid: true,
      data: [],
      lastAccess: cycle,
    };

    if (newCache.length < maxBlocks) {
      newCache.push(newBlock);
    } else {
      newCache.sort((a, b) => a.lastAccess - b.lastAccess);
      newCache[0] = newBlock;
    }
  }

  return { hit, penalty, newCache };
};

// ============================================================================
// INITIALIZATION
// ============================================================================

export const initializeState = (
  instructions: InstructionLine[],
  config: SystemConfig,
  initialRegs: { [key: string]: number }
): SimulationState => {
  const rs: ReservationStation[] = [];

  // Initialize RS
  ["ADD", "MULT", "LOAD", "STORE", "INTEGER"].forEach((type) => {
    const count = config.rsSizes[type as keyof typeof config.rsSizes];
    for (let i = 0; i < count; i++) {
      let prefix =
        type === "ADD"
          ? "A"
          : type === "MULT"
          ? "M"
          : type === "LOAD"
          ? "L"
          : type === "STORE"
          ? "S"
          : "I";

      rs.push({
        id: `${prefix}${i + 1}`,
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
        result: null,
      });
    }
  });

  const registers: { [key: string]: Register } = {};
  Object.keys(initialRegs).forEach((name) => {
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
    log: ["Simulation initialized."],
    isFinished: false,
    branchStall: false,
  };
};

// ============================================================================
// NEXT CYCLE LOGIC
// ============================================================================

export const nextCycle = (
  state: SimulationState,
  config: SystemConfig,
  labels: Record<string, number>
): SimulationState => {
  if (state.isFinished) return state;

  const nextState = {
    ...state,
    cycle: state.cycle + 1,
    cdb: null,
    log: [...state.log],
    instructions: [...state.instructions], // Shallow copy for appending loop instrs
  };

  const { reservationStations, registers, memory } = nextState;

  // =========================================================================
  // 1. WRITE RESULT (Broadcast on CDB)
  // =========================================================================
  let cdbProducer: ReservationStation | null = null;

  const readyToWrite = reservationStations.filter(
    (r) => r.busy && r.timeLeft === 0 && r.result !== null
  );

  if (readyToWrite.length > 0) {
    // Pick the first one (arbitration strategy: FCFS or random)
    cdbProducer = readyToWrite[0];

    nextState.cdb = { tag: cdbProducer.id, value: cdbProducer.result! };
    nextState.log.push(
      `Cycle ${nextState.cycle}: ${cdbProducer.id} broadcasts result ${cdbProducer.result}`
    );

    // Update instruction status
    const inst = nextState.instructions.find(
      (i) => i.id === cdbProducer!.instId
    );
    if (inst) inst.writeCycle = nextState.cycle;

    // Update Registers
    Object.values(registers).forEach((reg) => {
      if (reg.qi === cdbProducer!.id) {
        reg.value = cdbProducer!.result!;
        reg.qi = null;
      }
    });

    // Update RS waiting for operands
    reservationStations.forEach((rs) => {
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

    // Clear Producer RS
    const producerIndex = reservationStations.indexOf(cdbProducer);
    if (producerIndex !== -1) {
      reservationStations[producerIndex] = {
        ...reservationStations[producerIndex],
        busy: false,
        op: null,
        vj: null,
        vk: null,
        qj: null,
        qk: null,
        a: null,
        instId: null,
        result: null,
      };
    }
  }

  // =========================================================================
  // 2. EXECUTE
  // =========================================================================
  reservationStations.forEach((rs) => {
    if (!rs.busy) return;

    // Wait for operands
    if (rs.qj === null && rs.qk === null) {
      const inst = nextState.instructions.find((i) => i.id === rs.instId);
      if (!inst) return;

      // Start Execution
      if (inst.execStartCycle === null) {
        inst.execStartCycle = nextState.cycle;

        let latency = 0;
        const opType = getOpType(inst.op);

        if (opType === OpType.LOAD || opType === OpType.STORE) {
          // Address calc usually happens at Issue or start of Exec.
          // Simplified: We use 'rs.a' which contains offset or calc'd address.
          const effectiveAddr = rs.a || 0;

          if (opType === OpType.LOAD) {
            const { hit, penalty, newCache } = accessCache(
              effectiveAddr,
              config,
              nextState.cache,
              nextState.cycle
            );
            nextState.cache = newCache;
            latency = config.latencies[OpType.LOAD] + (hit ? 0 : penalty);
            if (!hit)
              nextState.log.push(
                `Cycle ${nextState.cycle}: Cache Miss for ${inst.op} at address ${effectiveAddr}`
              );
          } else {
            latency = config.latencies[OpType.STORE];
          }
        } else {
          latency = config.latencies[opType];
        }

        rs.timeLeft = latency;
      }

      if (rs.timeLeft > 0) {
        rs.timeLeft--;
      }

      // Execution Finished
      if (rs.timeLeft === 0 && inst.execEndCycle === null) {
        inst.execEndCycle = nextState.cycle;

        let res = 0;
        const opType = getOpType(inst.op);
        const v1 = rs.vj || 0;
        const v2 = rs.vk || 0;

        switch (opType) {
          case OpType.ADD:
          case OpType.INTEGER:
            if (
              ["ADD", "ADDI", "DADDI", "ADD.D", "ADD.S"].some((o) =>
                inst.op.toUpperCase().includes(o)
              )
            ) {
              res = v1 + v2;
            } else {
              res = v1 - v2;
            }
            break;
          case OpType.SUB:
            res = v1 - v2;
            break;
          case OpType.MULT:
            res = v1 * v2;
            break;
          case OpType.DIV:
            res = v2 !== 0 ? v1 / v2 : 0;
            break;
          case OpType.LOAD:
            res = memory[rs.a || 0] || 0;
            break;
          case OpType.STORE:
            memory[rs.a || 0] = rs.vk || 0;
            res = NaN;
            break;
          case OpType.BRANCH:
            const isBNE = inst.op.toUpperCase().startsWith("BNE");
            const isBEQ = inst.op.toUpperCase().startsWith("BEQ");
            let taken = false;

            if (isBNE && v1 !== v2) taken = true;
            if (isBEQ && v1 === v2) taken = true;

            if (taken) {
              // FIX: Label is in src2 for Branch instructions
              const targetLabel = inst.src2;
              if (labels[targetLabel] !== undefined) {
                nextState.pc = labels[targetLabel];
                nextState.log.push(
                  `Cycle ${nextState.cycle}: Branch taken to ${targetLabel}`
                );
              }
            }
            nextState.branchStall = false;
            res = NaN;
            break;
        }

        rs.result = res;

        // Stores and Branches don't write back to CDB, clear immediately
        if (opType === OpType.STORE || opType === OpType.BRANCH) {
          inst.writeCycle = nextState.cycle;
          rs.busy = false;
          const rsIdx = reservationStations.indexOf(rs);
          reservationStations[rsIdx] = {
            ...reservationStations[rsIdx],
            busy: false,
            op: null,
            instId: null,
            vj: null,
            vk: null,
            qj: null,
            qk: null,
            a: null,
            result: null,
          };
        }
      }
    }
  });

  // =========================================================================
  // 3. ISSUE
  // =========================================================================
  if (!nextState.branchStall) {
    let issueInst = nextState.instructions.find(
      (i) => i.pcAddress === nextState.pc && i.issueCycle === null
    );

    // === DYNAMIC LOOP HANDLING ===
    if (!issueInst) {
      // If PC is valid but no pending instruction, we looped. Create new instance.
      const template = nextState.instructions.find(
        (i) => i.pcAddress === nextState.pc
      );

      if (template) {
        const maxId = nextState.instructions.reduce(
          (max, i) => Math.max(max, i.id),
          0
        );
        const newInst: InstructionLine = {
          ...template,
          id: maxId + 1,
          issueCycle: null,
          execStartCycle: null,
          execEndCycle: null,
          writeCycle: null,
        };
        nextState.instructions.push(newInst);
        issueInst = newInst;
      }
    }

    if (issueInst) {
      const opType = getOpType(issueInst.op);
      const rsType = getRSType(opType);
      let effectiveAddr: number | null = null;
      let stallIssue = false;

      // -----------------------------
      // 3a. Address / Hazard Check
      // -----------------------------
      if (opType === OpType.LOAD || opType === OpType.STORE) {
        // Parser Logic: LOAD/STORE R1, 10(R2) -> dest:R1, src1:R2, src2:10 (imm)
        const baseReg = issueInst.src1;
        const offset = issueInst.immediate;

        // Resolve Base Register for Address Calculation
        if (registers[baseReg] && registers[baseReg].qi !== null) {
          if (nextState.cdb && nextState.cdb.tag === registers[baseReg].qi) {
            effectiveAddr = nextState.cdb.value + offset;
          } else {
            stallIssue = true; // Wait for base address register
          }
        } else {
          effectiveAddr =
            (registers[baseReg] ? registers[baseReg].value : 0) + offset;
        }

        // Check Memory Hazards (Load/Store Ordering)
        if (!stallIssue) {
          for (const checkRS of reservationStations) {
            if (
              checkRS.busy &&
              checkRS.instId !== null &&
              checkRS.instId < issueInst.id
            ) {
              if (checkRS.a === effectiveAddr) {
                const checkInst = nextState.instructions.find(
                  (i) => i.id === checkRS.instId
                );
                const checkOp = checkInst
                  ? getOpType(checkInst.op)
                  : OpType.INTEGER;

                // RAW / WAW / WAR hazards on Memory
                if (opType === OpType.LOAD && checkOp === OpType.STORE)
                  stallIssue = true;
                if (
                  opType === OpType.STORE &&
                  (checkOp === OpType.LOAD || checkOp === OpType.STORE)
                )
                  stallIssue = true;
              }
            }
          }
        }
      }

      // -----------------------------
      // 3b. Reservation Station Allocation
      // -----------------------------
      if (!stallIssue) {
        const freeRS = reservationStations.find(
          (r) => r.type === rsType && !r.busy
        );

        if (freeRS) {
          // ISSUE!
          issueInst.issueCycle = nextState.cycle;
          nextState.pc += 4;
          if (opType === OpType.BRANCH) nextState.branchStall = true;

          let vj = null,
            vk = null,
            qj = null,
            qk = null,
            a = null;

          // Helper to get Value or RS Tag
          const resolveOperand = (regName: string) => {
            if (!registers[regName]) return { v: 0, q: null }; // Immediate or zero
            if (registers[regName].qi) {
              const tag = registers[regName].qi;
              // Snatch from CDB if broadcasting now
              if (nextState.cdb && nextState.cdb.tag === tag)
                return { v: nextState.cdb.value, q: null };
              return { v: null, q: tag };
            }
            return { v: registers[regName].value, q: null };
          };

          // --- OPERAND MAPPING (FIXED FOR PARSER) ---

          // 1. Operand 1 (Vj/Qj)
          if (opType === OpType.BRANCH) {
            // BNE R1, R2, LABEL -> Parser: Dest=R1, Src1=R2
            // First operand is R1 (Dest)
            if (issueInst.dest) {
              const res = resolveOperand(issueInst.dest);
              vj = res.v;
              qj = res.q;
            }
          } else if (issueInst.src1) {
            // Normal: ADD F0, F1, F2 -> Src1=F1
            const res = resolveOperand(issueInst.src1);
            vj = res.v;
            qj = res.q;
          }

          // 2. Operand 2 (Vk/Qk)
          if (opType === OpType.STORE) {
            // STORE F0, 0(R1) -> Parser: Dest=F0 (Value to store), Src1=R1 (Base)
            // Vk is the value to store (Dest)
            const res = resolveOperand(issueInst.dest);
            vk = res.v;
            qk = res.q;
            a = effectiveAddr; // Address computed earlier
          } else if (opType === OpType.BRANCH) {
            // BNE R1, R2, LABEL -> Src1=R2
            // Second operand is R2 (Src1)
            if (issueInst.src1) {
              const res = resolveOperand(issueInst.src1);
              vk = res.v;
              qk = res.q;
            }
          } else if (opType === OpType.LOAD) {
            a = effectiveAddr; // Load uses 'a', no Vk
          } else {
            // Arithmetic: ADD F0, F1, F2 -> Src2=F2 or Immediate
            if (registers[issueInst.src2]) {
              const res = resolveOperand(issueInst.src2);
              vk = res.v;
              qk = res.q;
            } else {
              vk = issueInst.immediate;
            }
          }

          // Occupy RS
          const rsIndex = reservationStations.indexOf(freeRS);
          reservationStations[rsIndex] = {
            ...freeRS,
            busy: true,
            op: issueInst.op,
            instId: issueInst.id,
            vj,
            vk,
            qj,
            qk,
            a,
            timeLeft: 0, // Latency handled in Exec
            result: null,
          };

          // Update Register RAT (if writing)
          // Branches and Stores do not write to registers
          if (
            opType !== OpType.STORE &&
            opType !== OpType.BRANCH &&
            registers[issueInst.dest]
          ) {
            registers[issueInst.dest].qi = freeRS.id;
          }
        }
      }
    }
  }

  // =========================================================================
  // CHECK COMPLETION
  // =========================================================================
  const allWritten = nextState.instructions.every((i) => i.writeCycle !== null);

  // Check if PC points to code that exists in history (Loop check)
  const pcIsValid = nextState.instructions.some(
    (i) => i.pcAddress === nextState.pc
  );

  if (allWritten && !pcIsValid) {
    nextState.isFinished = true;
    nextState.log.push("All instructions completed.");
  }

  return nextState;
};
